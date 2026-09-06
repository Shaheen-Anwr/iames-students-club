// Structural PDF manipulation -- merge, images->pdf, split, reorder, rotate, pages(extract/delete),
// watermark -- all via pdf-lib. These copy/edit PDF page objects directly rather than re-rendering,
// so existing Arabic text survives byte-for-byte; no Adobe quota, no system binary.

import { readFileSync } from 'fs';
import { PDFDocument, degrees, rgb } from 'pdf-lib';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fontkit = require('@pdf-lib/fontkit');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import type { ProgressFn } from '../formats';
import { containsArabic, reorderVisual } from './rtl-text.util';

const FONT_REG = require.resolve(
  '@expo-google-fonts/ibm-plex-sans-arabic/400Regular/IBMPlexSansArabic_400Regular.ttf',
);

export type PdfTool = 'merge' | 'images-to-pdf' | 'split' | 'reorder' | 'rotate' | 'pages' | 'watermark';

export interface PdfToolParams {
  order?: number[]; // reorder: new page order, as 0-based source indices
  rotations?: Record<string, number>; // rotate: 0-based page index (string key) -> delta degrees (+/-90/180/270)
  keep?: number[]; // pages: 0-based indices to keep (extract = the selection, delete = its complement)
  groups?: number[][]; // split: 0-based indices per output file
  text?: string; // watermark
  opacity?: number; // watermark, 0-1
  fontSize?: number; // watermark
  rotationDeg?: number; // watermark text rotation, default -45
}

async function toBuffer(doc: PDFDocument): Promise<Buffer> {
  return Buffer.from(await doc.save());
}

async function merge(inputs: Buffer[], onProgress: ProgressFn): Promise<Buffer> {
  const out = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i += 1) {
    const src = await PDFDocument.load(inputs[i]);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
    onProgress(20 + Math.round(((i + 1) / inputs.length) * 60), `دمج الملف ${i + 1} من ${inputs.length}`);
  }
  return toBuffer(out);
}

async function imagesToPdf(inputs: Buffer[], onProgress: ProgressFn): Promise<Buffer> {
  const out = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i += 1) {
    // Normalize to PNG + apply EXIF orientation -- pdf-lib only embeds PNG/JPEG directly, and a raw
    // JPEG with EXIF rotation would otherwise render sideways (pdf-lib doesn't read EXIF at all).
    const png = await sharp(inputs[i]).rotate().png().toBuffer();
    const img = await out.embedPng(png);
    // 96dpi screen-pixel -> PDF point conversion, matching the same convention used for LlamaParse
    // image blocks in docx.engine.ts, so a page comes out a sensible physical size.
    const wPt = img.width * (72 / 96);
    const hPt = img.height * (72 / 96);
    const page = out.addPage([wPt, hPt]);
    page.drawImage(img, { x: 0, y: 0, width: wPt, height: hPt });
    onProgress(20 + Math.round(((i + 1) / inputs.length) * 60), `إضافة الصورة ${i + 1} من ${inputs.length}`);
  }
  return toBuffer(out);
}

async function split(input: Buffer, groups: number[][], onProgress: ProgressFn): Promise<Buffer[]> {
  const src = await PDFDocument.load(input);
  const outputs: Buffer[] = [];
  for (let i = 0; i < groups.length; i += 1) {
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, groups[i]);
    for (const p of pages) out.addPage(p);
    outputs.push(await toBuffer(out));
    onProgress(20 + Math.round(((i + 1) / groups.length) * 60), `إنشاء الملف ${i + 1} من ${groups.length}`);
  }
  return outputs;
}

async function reorder(input: Buffer, order: number[], onProgress: ProgressFn): Promise<Buffer> {
  const src = await PDFDocument.load(input);
  onProgress(40, 'إعادة ترتيب الصفحات');
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, order);
  for (const p of pages) out.addPage(p);
  return toBuffer(out);
}

async function rotate(input: Buffer, rotations: Record<string, number>, onProgress: ProgressFn): Promise<Buffer> {
  const doc = await PDFDocument.load(input);
  onProgress(40, 'تدوير الصفحات');
  for (const [key, delta] of Object.entries(rotations)) {
    const index = Number(key);
    const page = doc.getPage(index);
    if (!page) continue;
    const current = page.getRotation().angle;
    page.setRotation(degrees(((current + delta) % 360 + 360) % 360));
  }
  return toBuffer(doc);
}

async function pages(input: Buffer, keep: number[], onProgress: ProgressFn): Promise<Buffer> {
  const src = await PDFDocument.load(input);
  onProgress(40, 'تحديد الصفحات');
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, keep);
  for (const p of copied) out.addPage(p);
  return toBuffer(out);
}

async function watermark(
  input: Buffer,
  opts: { text: string; opacity?: number; fontSize?: number; rotationDeg?: number },
  onProgress: ProgressFn,
): Promise<Buffer> {
  const doc = await PDFDocument.load(input);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync(FONT_REG));
  const size = opts.fontSize ?? 48;
  const opacity = opts.opacity ?? 0.25;
  const rotation = opts.rotationDeg ?? -45;
  // pdf-lib's drawText has no Arabic shaping/bidi of its own (unlike Word/PowerPoint, which do their
  // own shaping on open) -- reorderVisual() pre-shapes + reorders to a left-to-right-drawable string,
  // the same trick pdf.engine.ts's from-scratch PDF renderer already relies on for correct Arabic.
  const drawText = containsArabic(opts.text) ? reorderVisual(opts.text) : opts.text;
  const textWidth = font.widthOfTextAtSize(drawText, size);

  const total = doc.getPageCount();
  for (let i = 0; i < total; i += 1) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    page.drawText(drawText, {
      x: width / 2 - textWidth / 2,
      y: height / 2,
      size,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity,
      rotate: degrees(rotation),
    });
    onProgress(20 + Math.round(((i + 1) / total) * 60), `إضافة العلامة المائية للصفحة ${i + 1} من ${total}`);
  }
  return toBuffer(doc);
}

// Dispatch: PDF bytes (or several, for merge/images-to-pdf) + tool-specific params -> one output
// buffer, or several (split -- the caller zips them, see convert-queue.service.ts).
export async function runPdfTool(
  tool: PdfTool,
  inputs: Buffer[],
  params: PdfToolParams,
  onProgress: ProgressFn,
): Promise<Buffer | Buffer[]> {
  onProgress(10, 'قراءة الملف');
  switch (tool) {
    case 'merge':
      return merge(inputs, onProgress);
    case 'images-to-pdf':
      return imagesToPdf(inputs, onProgress);
    case 'split':
      if (!params.groups?.length) throw new Error('لم يتم تحديد تقسيم الصفحات');
      return split(inputs[0], params.groups, onProgress);
    case 'reorder':
      if (!params.order?.length) throw new Error('لم يتم تحديد ترتيب الصفحات');
      return reorder(inputs[0], params.order, onProgress);
    case 'rotate':
      if (!params.rotations) throw new Error('لم يتم تحديد زوايا الدوران');
      return rotate(inputs[0], params.rotations, onProgress);
    case 'pages':
      if (!params.keep?.length) throw new Error('لم يتم تحديد الصفحات');
      return pages(inputs[0], params.keep, onProgress);
    case 'watermark':
      if (!params.text?.trim()) throw new Error('لم يتم تحديد نص العلامة المائية');
      return watermark(inputs[0], params as { text: string; opacity?: number; fontSize?: number; rotationDeg?: number }, onProgress);
    default:
      throw new Error(`أداة غير معروفة: ${tool}`);
  }
}
