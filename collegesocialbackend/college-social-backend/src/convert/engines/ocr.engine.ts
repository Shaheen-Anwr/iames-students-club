// OCR for scanned/image-only PDFs: WASM tesseract.js, no system `tesseract` binary needed. Adobe's
// OCRJob is NOT used here -- its OCRSupportedLocale enum has no Arabic entry at all (verified
// directly against the SDK's type defs), which rules it out for this app's actual users.
//
// Each page is rendered to a PNG (pageimage.engine.ts's existing mupdf rasterizer, same one behind
// the pdf->image format pair), then recognized with tesseract.js's OWN built-in PDF output mode
// (`output: { pdf: true }`) -- it already produces an "image + invisible searchable text layer"
// single-page PDF using the correct word bounding boxes internally, the same trick this codebase's
// pageimage.engine.ts hand-rolls for docx/pptx. Reusing it here avoids re-deriving bbox-to-PDF-point
// math. The per-page PDFs are then merged into one document with the already-tested pdf-lib merge()
// from pdf-tools.engine.ts.

import { mkdir, access, writeFile } from 'fs/promises';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createWorker } = require('tesseract.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Logger } = require('@nestjs/common');
import type { ProgressFn } from '../formats';
import { pdfToImages } from './pageimage.engine';

const logger = new Logger('OcrEngine');

export type OcrLanguage = 'ara' | 'eng' | 'ara+eng';

const MAX_PAGES = Math.min(100, Math.max(1, Number(process.env.CONVERT_OCR_MAX_PAGES) || 30));

// Trained-data files live here, both as the pre-fetched compressed source tesseract.js reads from
// (langPath) and where it writes its own decompressed re-cache after first use (cachePath) -- so a
// language downloads at most once per file per instance. Pre-populated at deploy time in the Docker
// image where possible (see Dockerfile); fetched here on first use otherwise.
const TESSDATA_DIR = process.env.TESSDATA_PATH || join(process.cwd(), '.tessdata-cache');

// tesseract.js's own Node fetch (run inside a worker_thread) proved unreliable in at least one real
// deployment environment -- it either hung or threw "fetch failed" against the exact same CDN URL
// that a plain fetch()/curl from the main thread fetched in a few seconds. Rather than depend on
// that path at all, download each language's file ourselves (main thread, already the same fetch()
// this app's Adobe/LlamaParse engines use successfully) and hand tesseract.js a local directory --
// per its own source, a non-URL langPath is read straight off disk, no network call inside it ever.
// Retries: even a plain fetch() against this CDN intermittently throws a bare "fetch failed" in at
// least one real deployment environment (confirmed directly -- a `curl` to the identical URL
// succeeded immediately when a same-instant fetch() didn't), so treat it like any other flaky
// external network call in this codebase (see adobe.engine.ts's own retry-once-on-transient logic)
// rather than assume one failure means the CDN itself is unreachable.
const DOWNLOAD_ATTEMPTS = 3;

async function ensureTrainedData(lang: string): Promise<void> {
  await mkdir(TESSDATA_DIR, { recursive: true });
  const gzPath = join(TESSDATA_DIR, `${lang}.traineddata.gz`);
  try {
    await access(gzPath);
    return;
  } catch {
    /* not cached yet -- fetch below */
  }
  const url = `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0/${lang}.traineddata.gz`;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      logger.log(`Fetching ${lang} trained data (first use on this instance, attempt ${attempt}/${DOWNLOAD_ATTEMPTS})…`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(gzPath, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (err) {
      lastErr = err;
      logger.warn(`${lang} trained-data fetch attempt ${attempt} failed: ${(err as Error)?.message ?? err}`);
      if (attempt < DOWNLOAD_ATTEMPTS) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`تعذّر تحميل بيانات اللغة "${lang}": ${(lastErr as Error)?.message ?? lastErr}`);
}

// OCR is real CPU+memory work -- serialize jobs on this instance the same way libreoffice.engine.ts
// serializes soffice invocations, rather than risk several running at once on a small server.
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

function langList(lang: OcrLanguage): string[] {
  return lang === 'ara+eng' ? ['ara', 'eng'] : [lang];
}

// tesseract.js's worker, when given NO `errorHandler`, both rejects the specific job's promise AND
// unconditionally re-throws the same error inside its internal message-port handler -- the second
// throw happens outside any promise chain we can await, so it crashes the entire Node process
// (confirmed directly in testing: a failed trained-data fetch took down this whole backend, not
// just the one OCR job). Passing a no-op errorHandler suppresses that redundant throw; the real,
// catchable error still surfaces normally through the rejected job promise below.
function silenceWorkerCrash(err: unknown): void {
  logger.warn(`tesseract worker error (non-fatal, surfaced via the pending job's own rejection): ${String(err)}`);
}

export async function ocrPdf(input: Buffer, lang: OcrLanguage, onProgress: ProgressFn): Promise<Buffer> {
  return serialize(async () => {
    onProgress(10, 'رسم صفحات المستند');
    const pages = await pdfToImages(input, onProgress, 250);
    if (pages.length > MAX_PAGES) throw new Error(`المستند يحتوي على ${pages.length} صفحة (الحد الأقصى ${MAX_PAGES})`);

    const langs = langList(lang);
    onProgress(12, 'تجهيز بيانات التعرّف الضوئي');
    for (const l of langs) await ensureTrainedData(l);

    const worker = await createWorker(langs, undefined, {
      langPath: TESSDATA_DIR,
      cachePath: TESSDATA_DIR,
      errorHandler: silenceWorkerCrash,
    });
    try {
      const pagePdfs: Buffer[] = [];
      for (let i = 0; i < pages.length; i += 1) {
        onProgress(20 + Math.round(((i + 1) / pages.length) * 60), `التعرّف الضوئي على الصفحة ${i + 1} من ${pages.length}`);
        const { data } = await worker.recognize(pages[i], {}, { pdf: true, text: false, hocr: false, tsv: false });
        if (!data.pdf?.length) throw new Error(`OCR produced no output for page ${i + 1}`);
        pagePdfs.push(Buffer.from(data.pdf));
      }

      onProgress(85, 'دمج الصفحات');
      const merged = await PDFDocument.create();
      for (const pagePdf of pagePdfs) {
        const src = await PDFDocument.load(pagePdf);
        const copied = await merged.copyPages(src, src.getPageIndices());
        for (const p of copied) merged.addPage(p);
      }
      return Buffer.from(await merged.save());
    } finally {
      await worker.terminate();
    }
  });
}
