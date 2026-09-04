// Block[] -> .docx. We emit clean HTML and let @turbodocx/html-to-docx build the OOXML; Word (and
// LibreOffice / Google Docs) then does its own Arabic shaping + bidi when the file is opened, so
// RTL text is correct by construction. We only need to set the document/paragraph direction so
// alignment lands on the right for Arabic content.

import type { Block } from './blocks';
import { containsArabic } from './rtl-text.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const htmlToDocx = require('@turbodocx/html-to-docx');

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function dirAttr(text: string): string {
  return containsArabic(text) ? ' dir="rtl" style="text-align:right"' : '';
}

// PDF points -> CSS px at the standard 96dpi html-to-docx assumes for an <img> width/height style,
// so an image keeps roughly its original on-page size instead of html-to-docx's default of probing
// the JPEG's raw pixel dimensions (which, for a small cropped figure, print at native resolution and
// come out far too large).
const ptToPx = (pt: number): number => Math.max(1, Math.round((pt * 96) / 72));

function blocksToHtml(blocks: Block[]): { html: string; rtl: boolean } {
  let rtl = false;
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'pagebreak') {
      parts.push('<p style="page-break-after:always"></p>');
    } else if (b.type === 'heading') {
      rtl = rtl || containsArabic(b.text);
      parts.push(`<h${b.level}${dirAttr(b.text)}>${esc(b.text)}</h${b.level}>`);
    } else if (b.type === 'para') {
      rtl = rtl || containsArabic(b.text);
      parts.push(`<p${dirAttr(b.text)}>${esc(b.text)}</p>`);
    } else if (b.type === 'bullet') {
      rtl = rtl || containsArabic(b.text);
      const pad = b.depth * 24;
      parts.push(`<p${dirAttr(b.text)} style="margin-${containsArabic(b.text) ? 'right' : 'left'}:${24 + pad}px">•&nbsp;&nbsp;${esc(b.text)}</p>`);
    } else if (b.type === 'table') {
      const tRtl = b.rows.some((r) => r.some((c) => containsArabic(c)));
      rtl = rtl || tRtl;
      const rowsHtml = b.rows
        .map((r, ri) => {
          const tag = b.header && ri === 0 ? 'th' : 'td';
          const cells = r
            .map((c) => `<${tag} style="border:1px solid #999;padding:4px 8px">${esc(c)}</${tag}>`)
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      parts.push(
        `<table${tRtl ? ' dir="rtl"' : ''} style="border-collapse:collapse;width:100%">${rowsHtml}</table>`,
      );
    } else if (b.type === 'image') {
      const b64 = b.data.toString('base64');
      parts.push(
        `<p><img src="data:${b.mimeType};base64,${b64}" style="width:${ptToPx(b.widthPt)}px;height:${ptToPx(b.heightPt)}px" /></p>`,
      );
    }
  }
  const body = parts.join('\n') || '<p></p>';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body${rtl ? ' dir="rtl"' : ''}>${body}</body></html>`;
  return { html, rtl };
}

export async function blocksToDocx(blocks: Block[]): Promise<Buffer> {
  const { html, rtl } = blocksToHtml(blocks);
  const out = await htmlToDocx(html, null, {
    table: { row: { cantSplit: true } },
    footer: false,
    header: false,
    margins: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
    // html-to-docx only emits <w:bidi/>/<w:rtl/> on paragraphs when this is set at the document
    // level -- the per-element dir="rtl" attributes from dirAttr() above only affect alignment.
    // Without it, Word treats every paragraph as LTR and mis-shapes/mis-orders Arabic runs.
    direction: rtl ? 'rtl' : 'ltr',
  });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
