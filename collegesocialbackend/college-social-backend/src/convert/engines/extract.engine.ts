// Source bytes -> Block[] (see blocks.ts). One extractor per accepted input format. None of these
// need a headless browser or LibreOffice.

import type { Block } from './blocks';
import { htmlToBlocks } from './blocks';
import { pdfToPages } from './pdf-extract.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mammoth = require('mammoth');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_: string, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_: string, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

export async function docxToBlocks(input: Buffer): Promise<Block[]> {
  const { value } = await mammoth.convertToHtml({ buffer: input });
  const blocks = htmlToBlocks(value || '');
  if (!blocks.length) throw new Error('لم يُعثر على نص في ملف Word.');
  return blocks;
}

export function xlsxToBlocks(input: Buffer): Block[] {
  const wb = XLSX.read(input, { type: 'buffer' });
  const blocks: Block[] = [];
  wb.SheetNames.forEach((name: string, i: number) => {
    const sheet = wb.Sheets[name];
    if (!sheet) return;
    const rows: string[][] = XLSX.utils
      .sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
      .map((r: any[]) => r.map((c) => (c == null ? '' : String(c))));
    if (!rows.length) return;
    if (i > 0) blocks.push({ type: 'pagebreak' });
    if (wb.SheetNames.length > 1) blocks.push({ type: 'heading', level: 2, text: name });
    blocks.push({ type: 'table', header: true, rows });
  });
  if (!blocks.length) throw new Error('لا يحتوي ملف Excel على بيانات قابلة للقراءة.');
  return blocks;
}

export function pptxToBlocks(input: Buffer): Block[] {
  const zip = new AdmZip(input);
  const slideEntries = zip
    .getEntries()
    .filter((e: any) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort(
      (a: any, b: any) =>
        Number(a.entryName.match(/slide(\d+)\.xml/)[1]) - Number(b.entryName.match(/slide(\d+)\.xml/)[1]),
    );
  if (!slideEntries.length) throw new Error('لم يُعثر على شرائح في ملف PowerPoint.');

  const blocks: Block[] = [];
  slideEntries.forEach((entry: any, i: number) => {
    const xml: string = entry.getData().toString('utf8');
    // Each <a:p> is a paragraph; join its <a:t> runs.
    const paras = [...xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
      .map((m) =>
        [...m[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
          .map((t) => decodeXml(t[1]))
          .join('')
          .trim(),
      )
      .filter(Boolean);
    if (i > 0) blocks.push({ type: 'pagebreak' });
    const title = paras.shift() ?? `شريحة ${i + 1}`;
    blocks.push({ type: 'heading', level: 2, text: title });
    for (const p of paras) blocks.push({ type: 'bullet', depth: 0, text: p });
  });
  return blocks;
}

const SENTENCE_END = /[.!؟:]["')\]]?$/;

// A wrapped continuation line: the previous line is flowing prose that didn't finish, and this one
// keeps going. Kept conservative so slide bullets / headings / table rows stay separate blocks.
function isContinuation(prev: string, cur: string): boolean {
  return prev.length > 55 && cur.length > 40 && !SENTENCE_END.test(prev);
}

function classify(text: string): Block {
  const words = text.split(/\s+/).length;
  if (words <= 8 && text.length <= 60 && !SENTENCE_END.test(text) && !/[،؛]/.test(text)) {
    return { type: 'heading', level: 2, text };
  }
  return { type: 'para', text };
}

export async function pdfToBlocks(input: Buffer): Promise<Block[]> {
  const pages = await pdfToPages(input);
  const blocks: Block[] = [];

  pages.forEach((page, pi) => {
    if (pi > 0 && page.lines.length) blocks.push({ type: 'pagebreak' });
    let buf = '';
    const flush = () => {
      const text = buf.replace(/\s+/g, ' ').trim();
      if (text) blocks.push(classify(text));
      buf = '';
    };
    for (const line of page.lines) {
      if (!line) {
        flush();
        continue;
      }
      if (buf && isContinuation(buf, line)) {
        buf += ' ' + line;
      } else {
        flush();
        buf = line;
      }
      if (SENTENCE_END.test(line)) flush();
    }
    flush();
  });

  // Drop consecutive duplicate blocks (fake-bold overprint paints each line 2-4x).
  const deduped: Block[] = [];
  for (const b of blocks) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.type === b.type && 'text' in prev && 'text' in b && prev.text === b.text) continue;
    deduped.push(b);
  }

  if (!deduped.length) {
    throw new Error('لا يوجد نص قابل للاستخراج في ملف PDF (قد يكون صورًا ممسوحة ضوئيًا).');
  }
  return deduped;
}
