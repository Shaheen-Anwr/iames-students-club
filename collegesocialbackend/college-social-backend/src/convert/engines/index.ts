// Dispatch: (source bytes, source format, target format) -> converted bytes. The goal is an output
// that keeps the *visual structure* of the source (layout, pagination, tables, fonts, RTL) while
// staying editable. Every direction picks a real layout engine first and falls back gracefully:
//
//   * -> PDF  (docx/pptx/xlsx -> pdf): Adobe Create PDF (identical to Office's own "Save as PDF")
//       -> headless LibreOffice -> pdfkit redraw (last resort).
//   PDF -> Word/PowerPoint: by default, editable-text recovery -- LlamaParse structural recovery
//       -> Adobe Export PDF + Arabic clean-up -> LibreOffice PDF import (writer_pdf_import /
//       impress_pdf_import) -> flat block pipeline. This reflows correctly in every reader, phones
//       included. Set CONVERT_PDF_PAGE_IMAGE=1 to instead render each page to an image laid
//       full-bleed onto a same-size page/slide with an invisible text layer behind it ("looks
//       exactly like the PDF", MuPDF/WASM) -- pixel-exact, but only in desktop Word / LibreOffice;
//       it falls back to the editable chain if rasterising fails.
//   Word/PowerPoint/Excel -> Word/PowerPoint: LibreOffice renders the source to a PDF, then that
//       PDF is recovered into the target (Adobe Export PDF, else LibreOffice's PDF import); no
//       soffice -> Adobe's own Create+Export round-trip; else the flat block pipeline. This trades
//       the source's paragraph flow for a page-faithful copy -- an accepted trade for "looks the
//       same".
//   * -> Excel: a spreadsheet isn't a page canvas, so it keeps the text/table extraction route.
//
// Every Office INPUT is first run through the structural Arabic normalizer (a no-op unless it
// carries frozen presentation-form glyphs from some earlier bad conversion).

import type { ConvertFormat, ProgressFn } from '../formats';
import type { Block } from './blocks';
import { docxToBlocks, pdfToBlocks, pptxToBlocks, xlsxToBlocks } from './extract.engine';
import { blocksToPdf } from './pdf.engine';
import { blocksToDocx } from './docx.engine';
import { blocksToPptx } from './pptx.engine';
import { blocksToXlsx } from './xlsx.engine';
import {
  libreOfficeAvailable,
  libreOfficeChains,
  libreOfficeHandles,
  runViaLibreOffice,
} from './libreoffice.engine';
import { adobeAvailable, isAdobeRecoverable, runViaAdobe } from './adobe.engine';
import { llamaParseAvailable, runViaLlamaParse } from './llamaparse.engine';
import { pageImageAvailable, pdfToPageImageFile } from './pageimage.engine';
import { normalizeArabicInOfficeFile } from './office-arabic-normalize.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Logger } = require('@nestjs/common');
const logger = new Logger('ConvertEngine');

// A converted .docx/.pptx/.xlsx from Adobe or LibreOffice can carry the source PDF's broken font
// encoding (Arabic as frozen presentation-form glyphs). Post-process those so the text is clean,
// editable Unicode while every bit of the engine's layout is kept. A no-op for PDF output and for
// files that are already clean (e.g. our own pure-JS docx builder).
function finish(buf: Buffer, target: ConvertFormat): Buffer {
  if (target === 'pdf') return buf;
  try {
    return normalizeArabicInOfficeFile(buf);
  } catch {
    return buf;
  }
}

async function extract(input: Buffer, source: ConvertFormat): Promise<Block[]> {
  switch (source) {
    case 'docx':
      return docxToBlocks(input);
    case 'pptx':
      return pptxToBlocks(input);
    case 'xlsx':
      return xlsxToBlocks(input);
    case 'pdf':
      return pdfToBlocks(input);
  }
}

function render(blocks: Block[], target: ConvertFormat): Promise<Buffer> | Buffer {
  switch (target) {
    case 'pdf':
      return blocksToPdf(blocks);
    case 'docx':
      return blocksToDocx(blocks);
    case 'pptx':
      return blocksToPptx(blocks);
    case 'xlsx':
      return blocksToXlsx(blocks);
  }
}

async function pureJs(input: Buffer, source: ConvertFormat, target: ConvertFormat): Promise<Buffer> {
  return render(await extract(input, source), target);
}

const noop: ProgressFn = () => undefined;

async function officeToPdf(input: Buffer, source: ConvertFormat, onProgress: ProgressFn): Promise<Buffer> {
  const tryAdobe = async (): Promise<Buffer | null> => {
    if (!adobeAvailable()) return null;
    try {
      const out = await runViaAdobe(input, source, 'pdf', onProgress);
      logger.log(`Adobe ${source}->pdf ok (${out.length}b)`);
      return out;
    } catch (err) {
      const msg = (err as Error).message;
      logger.warn(`Adobe ${source}->pdf ${isAdobeRecoverable(err) ? 'unavailable' : 'failed'} (${msg})`);
      return null;
    }
  };
  const tryLibre = async (): Promise<Buffer | null> => {
    if (!libreOfficeHandles(source, 'pdf') || !(await libreOfficeAvailable())) return null;
    try {
      onProgress(25, 'التحويل عبر LibreOffice');
      const out = await runViaLibreOffice(input, source, 'pdf');
      onProgress(92, 'إنهاء الملف');
      logger.log(`LibreOffice ${source}->pdf ok (${out.length}b)`);
      return out;
    } catch (err) {
      logger.warn(`LibreOffice ${source}->pdf failed (${(err as Error).message})`);
      return null;
    }
  };

  // Adobe's Create PDF is exact for Word & Excel, but reverses multi-word RTL runs in PowerPoint
  // text -- LibreOffice renders Arabic slides correctly, so it goes first for pptx.
  const order = source === 'pptx' ? [tryLibre, tryAdobe] : [tryAdobe, tryLibre];
  for (const fn of order) {
    const out = await fn();
    if (out) return out;
  }

  onProgress(30, 'رسم المستند');
  return blocksToPdf(await extract(input, source));
}

// pdf -> xlsx only: no page canvas to preserve, so Adobe's table recovery -> flat block pipeline.
async function pdfToOffice(input: Buffer, target: ConvertFormat, onProgress: ProgressFn): Promise<Buffer> {
  if (adobeAvailable()) {
    try {
      const out = await runViaAdobe(input, 'pdf', target, onProgress);
      logger.log(`Adobe pdf->${target} ok (${out.length}b)`);
      onProgress(95, 'تحسين النص العربي');
      return finish(out, target);
    } catch (err) {
      const msg = (err as Error).message;
      logger.warn(`Adobe pdf->${target} ${isAdobeRecoverable(err) ? 'unavailable' : 'failed'} (${msg}); using local pipeline`);
    }
  }
  onProgress(25, 'استخراج المحتوى');
  const blocks = await extract(input, 'pdf');
  onProgress(60, `إنشاء ملف ${target.toUpperCase()}`);
  return finish(await render(blocks, target), target);
}

// pdf -> docx | pptx: recover the page as editable objects, keeping its layout.
//
// `viaPageImage` / `viaLlamaParse` are set only when the input is a real user-uploaded PDF -- not
// when officeToPaged hands us a LibreOffice-rendered intermediate (that source already has clean
// structure, and the page-image / LlamaParse round-trips would just add cost and lose editability).
//
//   viaLlamaParse -> LLM structural recovery to editable text; the DEFAULT -- reflows in any
//                    reader, phones included.
//   viaPageImage  -> reproduce every page as an image ("looks exactly like the PDF"); opt-in via
//                    CONVERT_PDF_PAGE_IMAGE=1, and only faithful in desktop Word / LibreOffice.
//                    Falls through to the editable chain below if it's off or rasterising fails.
async function pdfToPaged(
  input: Buffer,
  target: 'docx' | 'pptx',
  onProgress: ProgressFn,
  opts: { viaPageImage?: boolean; viaLlamaParse?: boolean } = {},
): Promise<Buffer> {
  if (opts.viaPageImage && pageImageAvailable()) {
    try {
      const out = await pdfToPageImageFile(input, target, onProgress);
      logger.log(`page-image pdf->${target} ok (${out.length}b)`);
      return out; // it's rasterised pages -- no Arabic normalisation to do
    } catch (err) {
      logger.warn(
        `page-image pdf->${target} failed (${(err as Error).message}); falling back to text recovery`,
      );
    }
  }
  if (opts.viaLlamaParse && llamaParseAvailable()) {
    try {
      const out = await runViaLlamaParse(input, target, onProgress);
      onProgress(95, 'تحسين النص العربي');
      return finish(out, target);
    } catch (err) {
      logger.warn(
        `LlamaParse pdf->${target} failed (${(err as Error).message}); falling back to Adobe/LibreOffice`,
      );
    }
  }
  if (adobeAvailable()) {
    try {
      const out = await runViaAdobe(input, 'pdf', target, onProgress);
      onProgress(95, 'تحسين النص العربي');
      logger.log(`Adobe pdf->${target} ok (${out.length}b)`);
      return finish(out, target);
    } catch (err) {
      logger.warn(
        `Adobe pdf->${target} ${isAdobeRecoverable(err) ? 'unavailable' : 'failed'} (${(err as Error).message})`,
      );
    }
  }
  if (libreOfficeHandles('pdf', target) && (await libreOfficeAvailable())) {
    try {
      onProgress(30, 'استيراد PDF عبر LibreOffice');
      const out = await runViaLibreOffice(input, 'pdf', target);
      onProgress(92, 'تحسين النص العربي');
      logger.log(`LibreOffice pdf->${target} ok (${out.length}b)`);
      return finish(out, target);
    } catch (err) {
      logger.warn(`LibreOffice pdf->${target} failed (${(err as Error).message})`);
    }
  }
  onProgress(35, 'استخراج المحتوى');
  const blocks = await extract(input, 'pdf');
  onProgress(65, `إنشاء ملف ${target.toUpperCase()}`);
  return finish(await render(blocks, target), target);
}

// docx | pptx | xlsx -> docx | pptx: let the source's own layout engine paginate it into a PDF,
// then recover that PDF into the target app as editable objects.
async function officeToPaged(
  input: Buffer,
  source: ConvertFormat,
  target: 'docx' | 'pptx',
  onProgress: ProgressFn,
): Promise<Buffer> {
  // Preferred: LibreOffice renders a faithful PDF (correct Arabic slides/pages), then pdfToPaged
  // recovers it -- Adobe Export PDF first for its bidi handling, LibreOffice's own PDF import as
  // the fallback.
  if (libreOfficeChains(source, target) && (await libreOfficeAvailable())) {
    try {
      onProgress(15, 'رسم المستند عبر LibreOffice');
      const pdf = await runViaLibreOffice(input, source, 'pdf');
      logger.log(`LibreOffice ${source}->pdf ok (${pdf.length}b), recovering to ${target}`);
      return await pdfToPaged(pdf, target, onProgress);
    } catch (err) {
      logger.warn(`LibreOffice ${source}->${target} chain failed (${(err as Error).message})`);
    }
  }
  // No soffice (e.g. Render): Adobe's own Create PDF + Export PDF round-trip.
  if (adobeAvailable()) {
    try {
      const out = await runViaAdobe(input, source, target, onProgress);
      onProgress(95, 'تحسين النص العربي');
      logger.log(`Adobe ${source}->${target} ok (${out.length}b)`);
      return finish(out, target);
    } catch (err) {
      logger.warn(
        `Adobe ${source}->${target} ${isAdobeRecoverable(err) ? 'unavailable' : 'failed'} (${(err as Error).message})`,
      );
    }
  }
  // Last resort: flat text/table rebuild (no layout).
  onProgress(30, 'استخراج المحتوى');
  const blocks = await extract(input, source);
  onProgress(65, `إنشاء ملف ${target.toUpperCase()}`);
  return finish(await render(blocks, target), target);
}

export async function runConversion(
  input: Buffer,
  source: ConvertFormat,
  target: ConvertFormat,
  onProgress: ProgressFn = noop,
): Promise<Buffer> {
  // Clean up any frozen presentation-form Arabic a user's Office file might already carry, so it
  // never leaks into the output. No-op for a pristine file.
  if (source !== 'pdf') {
    try {
      input = normalizeArabicInOfficeFile(input, 'input');
    } catch {
      /* keep the original bytes */
    }
  }

  if (target === 'pdf') return officeToPdf(input, source, onProgress);

  // Excel target: not a page canvas -- keep the text/table extraction route.
  if (target === 'xlsx') {
    if (source === 'pdf') return pdfToOffice(input, 'xlsx', onProgress);
    onProgress(25, 'استخراج المحتوى');
    const blocks = await extract(input, source);
    onProgress(60, 'إنشاء ملف XLSX');
    return finish(await render(blocks, 'xlsx'), 'xlsx');
  }

  // target is docx | pptx: keep the source's visual structure.
  if (source === 'pdf') {
    return pdfToPaged(input, target, onProgress, { viaPageImage: true, viaLlamaParse: true });
  }
  return officeToPaged(input, source, target, onProgress);
}
