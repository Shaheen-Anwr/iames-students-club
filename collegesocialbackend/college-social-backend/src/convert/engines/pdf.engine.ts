// Block[] -> PDF, drawn from scratch with pdfkit (no headless browser / LibreOffice).
//
// Arabic is shaped + bidi-reordered per line before drawing (see rtl-text.util) and right-aligned;
// Latin lines are left-aligned. Bundled IBM Plex Sans Arabic (matches the app UI) covers Arabic +
// Latin, so no system fonts are needed. Wrapping/tables/page-breaks are handled here.

import { reorderVisual, isRtl, containsArabic } from './rtl-text.util';
import type { Block } from './blocks';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

const FONT_REG = require.resolve(
  '@expo-google-fonts/ibm-plex-sans-arabic/400Regular/IBMPlexSansArabic_400Regular.ttf',
);
const FONT_BOLD = require.resolve(
  '@expo-google-fonts/ibm-plex-sans-arabic/700Bold/IBMPlexSansArabic_700Bold.ttf',
);

const PAGE = { size: 'A4' as const, margin: 56 };
const HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 20, 2: 15, 3: 13 };
const BODY_SIZE = 11.5;
const LINE_GAP = 1.4; // multiple of the font line height
const PARA_GAP = 6;
// IBM Plex Sans Arabic's space is tight next to the dense connected script; a hair of extra
// word-spacing on Arabic lines makes wrapped paragraphs read the way they do in Word.
const RTL_WORD_SPACING = 1.4;

type Doc = any;

function newDoc(): Doc {
  const doc = new PDFDocument({ size: PAGE.size, margin: PAGE.margin, bufferPages: true });
  doc.registerFont('reg', FONT_REG);
  doc.registerFont('bold', FONT_BOLD);
  return doc;
}

function contentWidth(doc: Doc): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

// Greedy word-wrap; measures the FINAL (reshaped + reordered) visual string so widths are exact.
function wrapLines(doc: Doc, text: string, maxWidth: number, wordSpacing = 0): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const measure = (s: string) => {
    const v = reorderVisual(s);
    return doc.widthOfString(v) + (v.match(/ /g) || []).length * wordSpacing;
  };
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function ensureSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function writeText(
  doc: Doc,
  text: string,
  opts: { font?: 'reg' | 'bold'; size?: number; gap?: number; indent?: number; prefix?: string } = {},
): void {
  const { font = 'reg', size = BODY_SIZE, gap = PARA_GAP, indent = 0 } = opts;
  doc.font(font).fontSize(size);
  const rtl = isRtl(text);
  const left = doc.page.margins.left + (rtl ? 0 : indent);
  const width = contentWidth(doc) - indent;
  const lineHeight = doc.currentLineHeight() * LINE_GAP;

  const wordSpacing = rtl ? RTL_WORD_SPACING : 0;
  const first = opts.prefix ? `${opts.prefix}${text}` : text;
  const lines = wrapLines(doc, first, width, wordSpacing);
  for (const raw of lines) {
    ensureSpace(doc, lineHeight);
    const visual = reorderVisual(raw);
    const spaces = (visual.match(/ /g) || []).length;
    const w = doc.widthOfString(visual) + spaces * wordSpacing;
    const x = rtl ? left + width - w : left;
    doc.text(visual, x, doc.y, { lineBreak: false, wordSpacing });
    doc.y += lineHeight;
  }
  doc.y += gap;
}

function writeTable(doc: Doc, rows: string[][], header: boolean): void {
  if (!rows.length) return;
  const cols = Math.max(...rows.map((r) => r.length));
  const rtl = rows.some((r) => r.some((c) => containsArabic(c)));
  const width = contentWidth(doc);
  const colW = width / cols;
  const padX = 5;
  const padY = 4;
  doc.font('reg').fontSize(10);
  const lh = doc.currentLineHeight() * 1.2;

  rows.forEach((row, ri) => {
    const cells = Array.from({ length: cols }, (_, ci) => row[ci] ?? '');
    const wrapped = cells.map((c) => wrapLines(doc, c, colW - padX * 2, rtl ? RTL_WORD_SPACING : 0));
    const rowH = Math.max(1, ...wrapped.map((w) => w.length)) * lh + padY * 2;
    ensureSpace(doc, rowH);
    const top = doc.y;

    const ws = rtl ? RTL_WORD_SPACING : 0;
    cells.forEach((_, ci) => {
      // RTL tables: first column on the right.
      const visualCol = rtl ? cols - 1 - ci : ci;
      const x = doc.page.margins.left + visualCol * colW;
      doc.rect(x, top, colW, rowH).strokeColor('#c9c9c9').lineWidth(0.5).stroke();
      doc.font(header && ri === 0 ? 'bold' : 'reg').fontSize(10);
      wrapped[ci].forEach((ln, li) => {
        const visual = reorderVisual(ln);
        const w = doc.widthOfString(visual) + (visual.match(/ /g) || []).length * ws;
        const tx = rtl ? x + colW - padX - w : x + padX;
        doc.text(visual, tx, top + padY + li * lh, { lineBreak: false, wordSpacing: ws });
      });
    });
    doc.y = top + rowH;
  });
  doc.y += PARA_GAP;
}

export function blocksToPdf(blocks: Block[]): Promise<Buffer> {
  const doc = newDoc();
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  let first = true;
  for (const b of blocks) {
    if (b.type === 'pagebreak') {
      if (!first) doc.addPage();
      continue;
    }
    first = false;
    if (b.type === 'heading') {
      writeText(doc, b.text, { font: 'bold', size: HEADING_SIZE[b.level], gap: PARA_GAP + 2 });
    } else if (b.type === 'para') {
      writeText(doc, b.text);
    } else if (b.type === 'bullet') {
      writeText(doc, b.text, { indent: 16 + b.depth * 14, prefix: '•  ', gap: 3 });
    } else if (b.type === 'table') {
      writeTable(doc, b.rows, b.header);
    }
  }
  if (first) doc.font('reg').fontSize(BODY_SIZE).text('(مستند فارغ)', { align: 'center' });

  doc.end();
  return done;
}
