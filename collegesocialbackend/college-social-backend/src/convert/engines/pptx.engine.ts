// Block[] -> .pptx via pptxgenjs. PowerPoint does its own Arabic shaping + bidi on open, so we
// only set rtlMode / right alignment for Arabic text. Blocks are grouped into slides in blocks.ts.

import type { Block } from './blocks';
import { blocksToSlides } from './blocks';
import { containsArabic } from './rtl-text.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PptxGenJS = require('pptxgenjs');

export async function blocksToPptx(blocks: Block[]): Promise<Buffer> {
  const slides = blocksToSlides(blocks);
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  const list = slides.length ? slides : [{ title: '', body: [] as string[] }];
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
        s.body.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
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
  }

  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
