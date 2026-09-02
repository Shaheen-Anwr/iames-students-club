// "Bruteforce" pdf -> docx | pptx: don't try to recover the layout, reproduce it exactly.
//
// Every PDF page is rendered to a high-resolution raster (MuPDF compiled to WASM -- runs on
// Render's plain Node runtime, no Poppler / LibreOffice / native canvas needed) and dropped
// full-bleed onto a same-size Word page / PowerPoint slide. The page's real text is tucked behind
// the image as an invisible layer, so the output is still selectable and Ctrl+F searchable even
// though the body is a picture.
//
// OPT-IN via CONVERT_PDF_PAGE_IMAGE=1. It's the only path that guarantees "looks exactly like the
// PDF" for designed, multi-column, RTL decks, but the output is a wall of pictures: it renders
// faithfully only in desktop Word / LibreOffice -- mobile Office viewers (Google Docs, Drive
// preview, WPS, Files "Quick Look") ignore the hidden-text flag and mangle it. So the DEFAULT
// pdf->docx / pdf->pptx path is now editable-text recovery (LlamaParse / Adobe), which reflows
// correctly everywhere. Flip this on only where every reader is on desktop.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Logger } = require('@nestjs/common');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PptxGenJS = require('pptxgenjs');

import type { ProgressFn } from '../formats';

const logger = new Logger('PageImageEngine');

// mupdf's entry is ESM with top-level await -- tsc emits CommonJS here, so build the dynamic
// import through `new Function` to keep it a genuine runtime import() (same trick as pdf-extract).
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importESM = new Function('s', 'return import(s)') as (s: string) => Promise<any>;
let mupdfPromise: Promise<any> | null = null;
function loadMupdf(): Promise<any> {
  if (!mupdfPromise) mupdfPromise = importESM('mupdf').then((m: any) => m.default ?? m);
  return mupdfPromise;
}

export function pageImageAvailable(): boolean {
  // Page-image reproduction is opt-in now (see the file header): editable-text recovery is the
  // default because the page-image .docx/.pptx only renders right in desktop Word / LibreOffice.
  // `CONVERT_PDF_KEEP_TEXT=1` is still honoured as a no-op alias for "give me editable text".
  return process.env.CONVERT_PDF_PAGE_IMAGE === '1' && process.env.CONVERT_PDF_KEEP_TEXT !== '1';
}

const DPI = Math.min(300, Math.max(96, Number(process.env.CONVERT_PDF_IMAGE_DPI) || 144));
const MAX_PAGES = Math.min(500, Math.max(1, Number(process.env.CONVERT_PDF_IMAGE_MAX_PAGES) || 300));

const EMU_PER_PT = 12700;
const TWIP_PER_PT = 20;

interface RenderedPage {
  png: Buffer;
  wPt: number; // page width in PDF points
  hPt: number;
  text: string; // plain text for the hidden layer
}

async function renderPages(input: Buffer, onProgress: ProgressFn): Promise<RenderedPage[]> {
  const mupdf = await loadMupdf();
  const doc = mupdf.Document.openDocument(new Uint8Array(input), 'application/pdf');
  try {
    const total: number = doc.countPages();
    if (!total) throw new Error('pdf has no pages');
    if (total > MAX_PAGES) throw new Error(`pdf has ${total} pages (limit ${MAX_PAGES})`);

    const scale = DPI / 72;
    const out: RenderedPage[] = [];
    for (let i = 0; i < total; i += 1) {
      const page = doc.loadPage(i);
      try {
        const [x0, y0, x1, y1] = page.getBounds();
        const wPt = Math.abs(x1 - x0);
        const hPt = Math.abs(y1 - y0);

        const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
        let png: Buffer;
        try {
          png = Buffer.from(pix.asPNG());
        } finally {
          pix.destroy();
        }

        let text = '';
        try {
          text = page.toStructuredText('preserve-whitespace').asText() || '';
        } catch {
          /* text layer is a nice-to-have */
        }

        out.push({ png, wPt, hPt, text });
      } finally {
        page.destroy?.();
      }
      onProgress(10 + Math.round(((i + 1) / total) * 55), `رسم صفحة ${i + 1} من ${total}`);
    }
    return out;
  } finally {
    doc.destroy?.();
  }
}

// Strip the C0 control chars XML 1.0 forbids (all except TAB/LF/CR). Built from char codes so no
// raw control bytes live in this source file.
const XML_BAD_CTRL = new RegExp(
  `[${[0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
    .map((c) => `\\u${c.toString(16).padStart(4, '0')}`)
    .join('')}]`,
  'g',
);
const xml = (s: string): string =>
  s
    .replace(XML_BAD_CTRL, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// A page-sized inline image. Inline (not floating) is the most portable across Word / Google Docs
// / WPS; with zero page margins, an ~1pt run font and no trailing paragraph the image fills the
// sheet without spilling a blank page after it.
function inlineDrawing(id: number, cx: number, cy: number): string {
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="page${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="page${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

function buildDocx(pages: RenderedPage[]): Buffer {
  const zip = new AdmZip();

  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Default Extension="png" ContentType="image/png"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`,
    ),
  );
  zip.addFile(
    '_rels/.rels',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`,
    ),
  );

  const rels: string[] = [];
  pages.forEach((p, idx) => {
    const n = idx + 1;
    zip.addFile(`word/media/page${n}.png`, p.png);
    rels.push(
      `<Relationship Id="rIdImg${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page${n}.png"/>`,
    );
  });
  zip.addFile(
    'word/_rels/document.xml.rels',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
    ),
  );

  // Page size follows the first page (decks are uniform); margins collapse to nothing so the
  // wallpaper image lines up with the paper edge.
  const first = pages[0];
  const pgW = Math.round(first.wPt * TWIP_PER_PT);
  const pgH = Math.round(first.hPt * TWIP_PER_PT);
  const orient = first.wPt > first.hPt ? ' w:orient="landscape"' : '';

  const body = pages
    .map((p, idx) => {
      const n = idx + 1;
      const cx = Math.round(p.wPt * EMU_PER_PT);
      const cy = Math.round(p.hPt * EMU_PER_PT);
      // The searchable text layer behind the page image. Belt-and-braces so a viewer that
      // renders it anyway (Google Docs / Drive preview / WPS / mobile "Quick Look" all ignore
      // <w:vanish/>) still shows next to nothing rather than a full-size wall of OCR text over
      // the page: hidden + white + 1pt for BOTH Latin (w:sz) and complex-script/Arabic
      // (w:szCs -- without it Arabic stays at the default ~10pt no matter what w:sz says).
      const hidden = p.text.trim()
        ? `<w:r><w:rPr><w:vanish/><w:color w:val="FFFFFF"/><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:t xml:space="preserve">${xml(
            p.text.replace(/\s+/g, ' ').trim(),
          )}</w:t></w:r>`
        : '';
      const pageBreak =
        idx < pages.length - 1
          ? `<w:r><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:br w:type="page"/></w:r>`
          : '';
      return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>${inlineDrawing(
        n,
        cx,
        cy,
      )}</w:r>${hidden}${pageBreak}</w:p>`;
    })
    .join('');

  const doc =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<w:body>${body}` +
    `<w:sectPr><w:pgSz w:w="${pgW}" w:h="${pgH}"${orient}/>` +
    `<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>` +
    `</w:sectPr></w:body></w:document>`;
  zip.addFile('word/document.xml', Buffer.from(doc));

  return zip.toBuffer();
}

async function buildPptx(pages: RenderedPage[]): Promise<Buffer> {
  const pptx = new PptxGenJS();
  const first = pages[0];
  // pptxgenjs works in inches; clamp to its 56" ceiling.
  const wIn = Math.min(56, first.wPt / 72);
  const hIn = Math.min(56, first.hPt / 72);
  pptx.defineLayout({ name: 'PDFPAGE', width: wIn, height: hIn });
  pptx.layout = 'PDFPAGE';

  for (const p of pages) {
    const slide = pptx.addSlide();
    slide.addImage({
      data: `data:image/png;base64,${p.png.toString('base64')}`,
      x: 0,
      y: 0,
      w: wIn,
      h: hIn,
    });
  }

  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

// PDF bytes -> a .docx / .pptx that reproduces every page as an image. Throws on any failure so
// the caller falls through to the editable-text pipeline.
export async function pdfToPageImageFile(
  input: Buffer,
  target: 'docx' | 'pptx',
  onProgress: ProgressFn,
): Promise<Buffer> {
  onProgress(8, 'رسم صفحات المستند');
  const pages = await renderPages(input, onProgress);
  onProgress(70, `إنشاء ملف ${target.toUpperCase()}`);
  const out = target === 'docx' ? buildDocx(pages) : await buildPptx(pages);
  onProgress(96, 'إنهاء الملف');
  logger.log(`page-image pdf->${target} ok (${out.length}b, ${pages.length} page(s) @ ${DPI}dpi)`);
  return out;
}
