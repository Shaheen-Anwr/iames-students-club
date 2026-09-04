// Post-processes the docx/pptx LibreOffice produces via writer_pdf_import / impress_pdf_import
// (see libreoffice.engine.ts + engines/index.ts's pdfToPaged) for defects specific to that one
// import path -- none show up in Adobe's or LlamaParse's output, so this is deliberately never
// called from anywhere else:
//
//   * A PDF that fakes bold by overpainting each line 2-6x at slightly-offset positions (common
//     when the embedded font has no real bold weight) gets imported as that many literal duplicate
//     paragraphs in a row -- writer_pdf_import/impress_pdf_import have no de-overprint step, unlike
//     our own pdfToBlocks() extractor which already collapses this (see extract.engine.ts).
//   * Neither import filter reliably marks Arabic paragraphs RTL: impress_pdf_import (pptx) drops
//     paragraph-level RTL/alignment info entirely (no <a:pPr rtl="1"> at all), and writer_pdf_import
//     (docx) writes an explicit but disabled <w:bidi w:val="0"/> on every paragraph regardless of
//     content -- confirmed by inspecting real converted output, not just checking the tag is present.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');
import { containsArabic } from './rtl-text.util';

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

const DOCX_PARA_RE = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
const PPTX_PARA_RE = /<a:p\b[^>]*>[\s\S]*?<\/a:p>/g;
const TEXT_NODE_RE = /<[wa]:t(?:\s[^>]*)?>([^<]*)<\/[wa]:t>/g;

function paraText(xml: string): string {
  let out = '';
  let m: RegExpExecArray | null;
  TEXT_NODE_RE.lastIndex = 0;
  while ((m = TEXT_NODE_RE.exec(xml))) out += decodeXml(m[1]);
  return out.trim();
}

// Drops a paragraph whose text exactly matches the immediately preceding *kept* paragraph's text --
// the overprint signature. A length floor avoids collapsing legitimately-repeated short table
// cells/labels (e.g. a "5" rating column); real overprinted lines (titles, body text) run well past
// it. Paragraph boundaries never nest in OOXML, so a non-greedy match can't cross one.
function dedupeOverprintParagraphs(xml: string, paraRe: RegExp): string {
  let prevText = '';
  return xml.replace(paraRe, (para) => {
    const text = paraText(para);
    if (text.length >= 3 && text === prevText) return '';
    prevText = text;
    return para;
  });
}

// Forces <w:bidi/>/<w:rtl w:val="1"/>/<w:jc w:val="right"/> into a docx paragraph's <w:pPr> when its
// text is Arabic -- writer_pdf_import writes a <w:bidi> element on every paragraph, but always
// w:val="0" (disabled) regardless of content, so it must be corrected rather than merely added.
function injectDocxBidi(para: string): string {
  if (!containsArabic(paraText(para))) return para;

  const paired = para.match(/<w:pPr(\s[^>]*)?>([\s\S]*?)<\/w:pPr>/);
  if (paired) {
    const [whole, attrs = '', inner] = paired;
    let body = /<w:bidi\b[^/]*\/>/.test(inner) ? inner.replace(/<w:bidi\b[^/]*\/>/, '<w:bidi/><w:rtl w:val="1"/>') : `<w:bidi/><w:rtl w:val="1"/>${inner}`;
    body = /<w:jc\b[^/]*\/>/.test(body) ? body.replace(/<w:jc\b[^/]*\/>/, '<w:jc w:val="right"/>') : `${body}<w:jc w:val="right"/>`;
    return para.replace(whole, `<w:pPr${attrs}>${body}</w:pPr>`);
  }

  const selfClosed = para.match(/<w:pPr(\s[^>]*)?\/>/);
  if (selfClosed) {
    const [whole, attrs = ''] = selfClosed;
    return para.replace(whole, `<w:pPr${attrs}><w:bidi/><w:rtl w:val="1"/><w:jc w:val="right"/></w:pPr>`);
  }

  return para.replace(/^(<w:p\b[^>]*>)/, '$1<w:pPr><w:bidi/><w:rtl w:val="1"/><w:jc w:val="right"/></w:pPr>');
}

// Injects rtl="1"/algn="r" into a pptx paragraph's <a:pPr> (creating one if absent) when its text is
// Arabic and it isn't already marked RTL.
function injectPptxRtl(para: string): string {
  if (!containsArabic(paraText(para))) return para;

  const pPrMatch = para.match(/<a:pPr([^>]*?)(\/?)>/);
  if (!pPrMatch) {
    return para.replace(/^(<a:p\b[^>]*>)/, '$1<a:pPr rtl="1" algn="r"/>');
  }
  const [whole, rawAttrs, selfClose] = pPrMatch;
  if (/\brtl=/.test(rawAttrs)) return para; // already has an explicit rtl attribute -- leave it

  const withAlgn = /\balgn=/.test(rawAttrs) ? rawAttrs.replace(/\balgn="[^"]*"/, 'algn="r"') : `${rawAttrs} algn="r"`;
  const newOpen = `<a:pPr${withAlgn} rtl="1"${selfClose}>`;
  return para.replace(whole, newOpen);
}

export function fixLibreOfficePdfImport(buf: Buffer, target: 'docx' | 'pptx'): Buffer {
  let zip: any;
  try {
    zip = new AdmZip(buf);
  } catch {
    return buf;
  }

  let changed = false;
  for (const entry of zip.getEntries()) {
    const isDocxBody = target === 'docx' && entry.entryName === 'word/document.xml';
    const isPptxSlide = target === 'pptx' && /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName);
    if (!isDocxBody && !isPptxSlide) continue;

    let xml: string = entry.getData().toString('utf8');
    xml = dedupeOverprintParagraphs(xml, isDocxBody ? DOCX_PARA_RE : PPTX_PARA_RE);
    if (isDocxBody) xml = xml.replace(DOCX_PARA_RE, injectDocxBidi);
    if (isPptxSlide) xml = xml.replace(PPTX_PARA_RE, injectPptxRtl);

    const original = entry.getData().toString('utf8');
    if (xml !== original) {
      zip.updateFile(entry.entryName, Buffer.from(xml, 'utf8'));
      changed = true;
    }
  }
  return changed ? zip.toBuffer() : buf;
}
