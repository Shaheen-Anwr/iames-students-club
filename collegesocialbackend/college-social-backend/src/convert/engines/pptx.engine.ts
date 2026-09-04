// Block[] -> .pptx via pptxgenjs. PowerPoint does its own Arabic shaping + bidi on open, so we
// only set rtlMode / right alignment for Arabic text. Blocks are grouped into slides in blocks.ts.

import type { Block, Slide } from './blocks';
import { blocksToSlides } from './blocks';
import { containsArabic } from './rtl-text.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PptxGenJS = require('pptxgenjs');

// Slide is 13.33in x 7.5in (LAYOUT_WIDE). Images are appended in a strip along the bottom rather
// than interleaved with the text -- LlamaParse doesn't report an image's reading-order position
// relative to the text items on its page (see llamaparse.engine.ts), only its on-page x/y, so exact
// placement isn't recoverable; a bottom strip at least keeps every image visible instead of dropped.
const IMAGE_STRIP_Y = 6.3;
const IMAGE_STRIP_MAX_H = 1.0;
const IMAGE_GAP = 0.15;
const SLIDE_RIGHT_MARGIN = 12.83;

function addImageStrip(slide: any, images: Extract<Block, { type: 'image' }>[]): void {
  let x = 0.5;
  for (const img of images) {
    const wIn = img.widthPt / 72;
    const hIn = img.heightPt / 72;
    if (!(wIn > 0) || !(hIn > 0)) continue;
    const scale = Math.min(IMAGE_STRIP_MAX_H / hIn, 1);
    const w = wIn * scale;
    const h = hIn * scale;
    if (x + w > SLIDE_RIGHT_MARGIN) break; // out of room in this row -- rest silently skipped
    slide.addImage({ data: `data:${img.mimeType};base64,${img.data.toString('base64')}`, x, y: IMAGE_STRIP_Y, w, h });
    x += w + IMAGE_GAP;
  }
}

export async function blocksToPptx(blocks: Block[]): Promise<Buffer> {
  const slides = blocksToSlides(blocks);
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  const list: Slide[] = slides.length ? slides : [{ title: '', body: [], images: [] }];
  for (const s of list) {
    const slide = pptx.addSlide();
    const rtlTitle = containsArabic(s.title);
    if (s.title) {
      slide.addText(s.title, {
        x: 0.5,
        y: 0.3,
        w: 12.33,
        h: 1,
        fontSize: 28,
        bold: true,
        rtlMode: rtlTitle,
        align: rtlTitle ? 'right' : 'left',
      });
    }
    if (s.body.length) {
      const rtlBody = s.body.some((t) => containsArabic(t));
      slide.addText(
        // pptxgenjs derives each paragraph's rtl="1" from *this* per-item options object (only the
        // first run of each line is checked) -- the shared options below never reach it, so rtlMode
        // must be set here too or every bullet renders LTR regardless of the outer setting.
        s.body.map((t) => ({ text: t, options: { bullet: true, breakLine: true, rtlMode: rtlBody, align: rtlBody ? 'right' : 'left' } })),
        {
          x: 0.5,
          y: s.title ? 1.5 : 0.5,
          w: 12.33,
          h: 5.5,
          fontSize: 16,
          rtlMode: rtlBody,
          align: rtlBody ? 'right' : 'left',
          valign: 'top',
        },
      );
    }
    if (s.images.length) addImageStrip(slide, s.images);
  }

  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
