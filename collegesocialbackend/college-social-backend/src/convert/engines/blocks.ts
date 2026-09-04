// A tiny document model that every source is parsed into and every target is generated from. Keeps
// the conversion matrix to "source -> Block[]" + "Block[] -> target" instead of N*M direct paths.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom');

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'para'; text: string }
  | { type: 'bullet'; depth: number; text: string }
  | { type: 'table'; header: boolean; rows: string[][] }
  // A raster image recovered from the source (currently only LlamaParse's pdf->docx/pptx path
  // produces these -- see llamaparse.engine.ts). widthPt/heightPt are the size on the source page,
  // in PDF points (1/72in), used to keep roughly the original proportions in the rendered target.
  | { type: 'image'; data: Buffer; mimeType: string; widthPt: number; heightPt: number }
  | { type: 'pagebreak' };

export interface Slide {
  title: string;
  body: string[];
  images: Extract<Block, { type: 'image' }>[];
}

const HEADING_LEVEL: Record<string, 1 | 2 | 3> = { H1: 1, H2: 2, H3: 3, H4: 3, H5: 3, H6: 3 };

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Parse the HTML intermediate (from mammoth / SheetJS / our own builders) into blocks. */
export function htmlToBlocks(html: string): Block[] {
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  const blocks: Block[] = [];

  const walkList = (listEl: Element, depth: number) => {
    for (const li of Array.from(listEl.children)) {
      if (li.tagName !== 'LI') continue;
      const nested = li.querySelector('ul,ol');
      const own = clean(
        Array.from(li.childNodes)
          .filter((n: any) => !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName)))
          .map((n: any) => n.textContent ?? '')
          .join(' '),
      );
      if (own) blocks.push({ type: 'bullet', depth, text: own });
      if (nested) walkList(nested, depth + 1);
    }
  };

  const walk = (el: Element) => {
    for (const node of Array.from(el.children)) {
      const tag = node.tagName;
      if (HEADING_LEVEL[tag]) {
        const text = clean(node.textContent ?? '');
        if (text) blocks.push({ type: 'heading', level: HEADING_LEVEL[tag], text });
      } else if (tag === 'P' || tag === 'BLOCKQUOTE') {
        const text = clean(node.textContent ?? '');
        if (text) blocks.push({ type: 'para', text });
      } else if (tag === 'UL' || tag === 'OL') {
        walkList(node, 0);
      } else if (tag === 'TABLE') {
        const rows: string[][] = [];
        let header = false;
        for (const tr of Array.from(node.querySelectorAll('tr'))) {
          const cells = Array.from(tr.querySelectorAll('th,td')).map((c) => clean(c.textContent ?? ''));
          if (cells.some(Boolean)) rows.push(cells);
          if (tr.querySelector('th')) header = true;
        }
        if (rows.length) blocks.push({ type: 'table', header, rows });
      } else if (tag === 'HR') {
        blocks.push({ type: 'pagebreak' });
      } else if (node.children.length) {
        walk(node); // DIV / SECTION / ARTICLE wrappers
      } else {
        const text = clean(node.textContent ?? '');
        if (text) blocks.push({ type: 'para', text });
      }
    }
  };

  walk(doc.body);
  return blocks;
}

/**
 * Group a flat block list into slides for a presentation target: every heading starts a new slide,
 * its following paras/bullets become the body. Leading content with no heading gets an untitled
 * slide; a very long body is split so a slide never overflows.
 */
export function blocksToSlides(blocks: Block[], maxLinesPerSlide = 10): Slide[] {
  const slides: Slide[] = [];
  let current: Slide | null = null;
  const push = (title: string) => {
    current = { title, body: [], images: [] };
    slides.push(current);
  };
  for (const b of blocks) {
    if (b.type === 'pagebreak') {
      current = null;
      continue;
    }
    if (b.type === 'heading') {
      push(b.text);
      continue;
    }
    if (!current) push('');
    if (b.type === 'para') current!.body.push(b.text);
    else if (b.type === 'bullet') current!.body.push(`${'  '.repeat(b.depth)}${b.text}`);
    else if (b.type === 'table') for (const r of b.rows) current!.body.push(r.join('  |  '));
    else if (b.type === 'image') current!.images.push(b);
    if (current!.body.length >= maxLinesPerSlide) {
      const title = current!.title;
      current = null;
      push(title);
    }
  }
  return slides.filter((s) => s.title || s.body.length || s.images.length);
}
