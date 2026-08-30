// High-fidelity conversion via a headless LibreOffice, used automatically whenever the `soffice`
// binary is present (local dev, or a deployment that bundles it). LibreOffice has a real document
// layout engine, so Arabic / RTL text, tables, headings, fonts and structure survive a conversion
// the way they do in Word itself -- far better than the from-scratch pure-JS pipeline, which stays
// as the fallback when `soffice` isn't installed (e.g. Render's plain Node runtime).

import { execFile } from 'child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import type { ConvertFormat } from '../formats';

const run = promisify(execFile);

const SOFFICE = process.env.LIBREOFFICE_PATH || 'soffice';
const JOB_TIMEOUT_MS = Number(process.env.LIBREOFFICE_TIMEOUT_MS) || 150_000;

// Pairs LibreOffice converts in a single pass (same app family, or a PDF imported into an app).
const DIRECT: Partial<Record<ConvertFormat, Partial<Record<ConvertFormat, string>>>> = {
  docx: { pdf: 'pdf' },
  pptx: { pdf: 'pdf' },
  xlsx: { pdf: 'pdf' },
  pdf: {
    // A PDF opens in Writer (flowing text) or Impress (one slide per page); both keep the text as
    // editable Unicode runs positioned where they sit on the page -- far closer to the source's
    // visual structure than a flat text re-extraction.
    docx: 'docx:MS Word 2007 XML',
    pptx: 'pptx:Impress MS PowerPoint 2007 XML',
  },
};

// The infilter that decides which app a PDF is imported into (Writer for docx, Impress for pptx).
const PDF_IMPORT_FILTER: Partial<Record<ConvertFormat, string>> = {
  docx: 'writer_pdf_import',
  pptx: 'impress_pdf_import',
};

// Cross-family pairs LibreOffice has no single-pass filter for (Writer <-> Impress <-> Calc). Route
// through a PDF LibreOffice renders itself, then re-import that PDF into the target app: pagination
// and the on-page position of every run survive as editable objects. The trade-off is the source's
// paragraph flow -- the result is page-bound like the PDF was.
const CHAIN: Partial<Record<ConvertFormat, ConvertFormat[]>> = {
  docx: ['pptx'],
  pptx: ['docx'],
  xlsx: ['docx', 'pptx'],
};

let available: boolean | null = null;

/** True if a usable `soffice` was found (probed once, then cached). */
export async function libreOfficeAvailable(): Promise<boolean> {
  if (available === null) {
    try {
      await run(SOFFICE, ['--headless', '--version'], { timeout: 15_000 });
      available = true;
    } catch {
      available = false;
    }
  }
  return available;
}

/** Whether runViaLibreOffice can produce this pair directly (one `soffice` pass). */
export function libreOfficeHandles(source: ConvertFormat, target: ConvertFormat): boolean {
  return !!DIRECT[source]?.[target];
}

/** Whether this cross-family pair should be reached by routing through a PDF (source -> pdf, then
 *  that pdf recovered into the target -- see engines/index.ts officeToPaged). */
export function libreOfficeChains(source: ConvertFormat, target: ConvertFormat): boolean {
  return !!CHAIN[source]?.includes(target);
}

// Serialize soffice jobs -- each spawns a whole office process (~150-250MB); running several at
// once risks an OOM, and there's little throughput to gain.
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

export async function runViaLibreOffice(
  input: Buffer,
  source: ConvertFormat,
  target: ConvertFormat,
): Promise<Buffer> {
  const filter = DIRECT[source]?.[target];
  if (!filter) throw new Error(`LibreOffice does not handle ${source} -> ${target}`);

  return serialize(async () => {
    const work = await mkdtemp(join(tmpdir(), 'lo-'));
    const profile = join(work, 'profile');
    await mkdir(profile, { recursive: true });
    const inPath = join(work, `in.${source}`);
    await writeFile(inPath, input);

    const args = [
      '--headless',
      '--norestore',
      '--nolockcheck',
      '--nodefault',
      `-env:UserInstallation=file://${profile}`,
      ...(source === 'pdf' ? [`--infilter=${PDF_IMPORT_FILTER[target] ?? 'writer_pdf_import'}`] : []),
      '--convert-to',
      filter,
      '--outdir',
      work,
      inPath,
    ];

    try {
      await run(SOFFICE, args, { timeout: JOB_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 });
      const produced = (await readdir(work)).find((f) => f.startsWith('in.') && f !== `in.${source}`);
      if (!produced) throw new Error('LibreOffice produced no output file');
      const out = await readFile(join(work, produced));
      if (!out.length) throw new Error('LibreOffice produced an empty file');
      return out;
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}
