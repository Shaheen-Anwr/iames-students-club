// PDF -> pages of text lines.
//
// Preferred: Poppler's `pdftotext` (see poppler.engine) when the binary is present -- mature bidi +
// overprint handling, reads real-world Arabic lecture PDFs cleanly.
// Fallback: Mozilla's PDF.js (pdfjs-dist) -- applies the font ToUnicode map and doesn't silently
// reorder glyphs; we rebuild reading order from each text item's on-page position, and repairLine()
// de-shapes + reorders lines that came out as visual-order presentation forms.

import { pdftotextAvailable, pdfToTextViaPoppler } from './poppler.engine';
import { fixArabicArtifacts } from './arabic-fix.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ArabicShaper } = require('arabic-persian-reshaper');

// pdfjs-dist v4's legacy build is ESM-only. This file compiles to CommonJS, and tsc would rewrite
// a literal `import()` into `require()` (which throws ERR_REQUIRE_ESM on Node 20) -- so build the
// dynamic import through `new Function` to keep it a genuine runtime `import()`.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importESM = new Function('s', 'return import(s)') as (s: string) => Promise<any>;

let pdfjsPromise: Promise<any> | null = null;
function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = importESM('pdfjs-dist/legacy/build/pdf.mjs').then((m: any) => {
      // pdfjs v4 still insists on a workerSrc even in Node; point it at the bundled worker file
      // (it runs it in a worker thread). require.resolve only locates the path -- no ESM require.
      m.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
      return m;
    });
  }
  return pdfjsPromise;
}

const PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻿]/;
const ARABIC_LETTER_RUN = /[ء-يـٮ-ۓۺ-ۼٱ-ڿ]+[ً-ْٰ]*/g;

// A line extracted as presentation forms is in visual order; de-shape it and reverse each Arabic
// word so the sequence becomes logical. Latin/number tokens and spacing keep their positions.
function repairLine(line: string): string {
  if (!PRESENTATION_FORMS.test(line)) return line;
  const deshaped: string = ArabicShaper.convertArabicBack(line);
  let out = deshaped.replace(ARABIC_LETTER_RUN, (run: string) => [...run].reverse().join(''));
  // Punctuation that sat at the visual start of a word belongs at its logical end.
  out = out.replace(/([،؛.:!؟])(\s*)([ء-ي]{2,})/g, (_m, p, sp, w) => `${sp}${w}${p}`);
  return out.replace(/\s+([،؛.])/g, '$1');
}

export interface PdfPage {
  lines: string[];
}

export async function pdfToPages(input: Buffer): Promise<PdfPage[]> {
  let pages: PdfPage[] | null = null;
  if (await pdftotextAvailable()) {
    try {
      const text = await pdfToTextViaPoppler(input);
      const parsed = text
        .split(/\n\f\n|\f/)
        .map((p) => ({ lines: p.split('\n').map((l) => l.trim()).filter(Boolean) }))
        .filter((p) => p.lines.length);
      if (parsed.some((p) => p.lines.length)) pages = parsed;
    } catch {
      // fall through to the pdfjs reader
    }
  }
  if (!pages) pages = await pagesViaPdfjs(input);
  // Correct the systematic ر/ن ToUnicode transposition some Arabic PDF fonts bake in.
  return pages.map((p) => ({ lines: p.lines.map(fixArabicArtifacts) }));
}

async function pagesViaPdfjs(input: Buffer): Promise<PdfPage[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(input),
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;

  const pages: PdfPage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const byRow = new Map<number, Array<{ x: number; s: string }>>();
      for (const item of content.items as any[]) {
        if (!item.str) continue;
        const y = Math.round(item.transform[5] / 2) * 2; // 2pt bucket so a wavy baseline still groups
        if (!byRow.has(y)) byRow.set(y, []);
        byRow.get(y)!.push({ x: item.transform[4], s: item.str });
      }
      const lines = [...byRow.keys()]
        .sort((a, b) => b - a) // top of page first
        .map((y) =>
          byRow
            .get(y)!
            .sort((a, b) => a.x - b.x)
            .map((it) => it.s)
            .join('')
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .filter(Boolean)
        .map(repairLine);
      pages.push({ lines });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
