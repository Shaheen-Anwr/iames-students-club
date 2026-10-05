// WhatsApp-style lightweight formatting for chat messages:
//   *bold*  _italic_  ~strike~  `inline code`  ```code block```  and "> quote" lines.
// Pure parser (no React) so it's unit-testable; components/chat/FormattedText.tsx renders it.
//
// Rules mirror WhatsApp's: a marker only opens at the start of the text or after a non-word
// character, its content can't start/end with a space or span lines, and it only closes before
// the end of the text or a non-word character -- so snake_case_words, 2*3*4 and file_names.txt
// stay untouched. URLs and @mention tokens are protected: no marker inside them ever matches.
// (No regex lookbehind anywhere -- Safari < 16.4 throws on it at parse time.)

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'bold' | 'italic' | 'strike'; children: InlineNode[] };

export type BlockNode =
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'quote'; children: InlineNode[] }
  | { type: 'codeblock'; text: string; lang: string | null };

const CODE_BLOCK_RE = /```([A-Za-z0-9+#.-]{0,20})[ \t]*\n?([\s\S]*?)```/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;
// URLs and `@[Name](24-hex-id)` mention tokens -- kept intact for TaggedText to linkify.
const PROTECTED_RE = /(@\[[^\]]+\]\((?:[0-9a-fA-F]{24}|rafed)\))|(https?:\/\/[^\s<>()]+)/g;

const MARKERS: { char: string; type: 'bold' | 'italic' | 'strike' }[] = [
  { char: '*', type: 'bold' },
  { char: '_', type: 'italic' },
  { char: '~', type: 'strike' },
];

// Arabic + Arabic Supplement blocks (U+0600-U+06FF, U+0750-U+077F), built from code points so
// the source carries no raw/invisible characters.
const ARABIC_CHAR_RE = new RegExp(
  `[${String.fromCharCode(0x0600)}-${String.fromCharCode(0x06ff)}${String.fromCharCode(0x0750)}-${String.fromCharCode(0x077f)}]`,
);

// A "word" character for marker boundaries: letters (Latin + Arabic), digits, underscore.
function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[A-Za-z0-9_]/.test(ch) || ARABIC_CHAR_RE.test(ch);
}

function protectedRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  PROTECTED_RE.lastIndex = 0;
  for (const m of text.matchAll(PROTECTED_RE)) {
    const start = m.index ?? 0;
    ranges.push([start, start + m[0].length]);
  }
  return ranges;
}

function inRanges(pos: number, ranges: [number, number][]): boolean {
  return ranges.some(([s, e]) => pos >= s && pos < e);
}

interface Span {
  start: number; // index of the opening marker
  end: number; // index of the closing marker
  type: 'bold' | 'italic' | 'strike';
}

// Earliest valid emphasis span in `text`, or null.
function findSpan(text: string, ranges: [number, number][]): Span | null {
  let best: Span | null = null;
  for (const { char, type } of MARKERS) {
    let from = 0;
    while (from < text.length) {
      const open = text.indexOf(char, from);
      if (open === -1) break;
      from = open + 1;
      if (best && open >= best.start) break;
      if (inRanges(open, ranges)) continue;
      // Opening boundary: start of text or a non-word char that isn't the same marker.
      const before = text[open - 1];
      if (open > 0 && (isWordChar(before) || before === char)) continue;
      const first = text[open + 1];
      if (!first || /\s/.test(first) || first === char) continue;

      // Closing marker: same line, preceded by non-space, followed by end / non-word char.
      let close = open + 2;
      let found = -1;
      while (close < text.length) {
        const ch = text[close];
        if (ch === '\n') break;
        if (ch === char && !inRanges(close, ranges)) {
          const prev = text[close - 1];
          const after = text[close + 1];
          if (prev && !/\s/.test(prev) && (after === undefined || !isWordChar(after))) {
            found = close;
            break;
          }
        }
        close++;
      }
      if (found !== -1) {
        if (!best || open < best.start) best = { start: open, end: found, type };
        break;
      }
    }
  }
  return best;
}

function parseEmphasis(text: string, depth = 0): InlineNode[] {
  if (!text) return [];
  if (depth > 3) return [{ type: 'text', text }];
  const ranges = protectedRanges(text);
  const span = findSpan(text, ranges);
  if (!span) return [{ type: 'text', text }];
  const nodes: InlineNode[] = [];
  if (span.start > 0) nodes.push({ type: 'text', text: text.slice(0, span.start) });
  nodes.push({ type: span.type, children: parseEmphasis(text.slice(span.start + 1, span.end), depth + 1) });
  nodes.push(...parseEmphasis(text.slice(span.end + 1), depth));
  return nodes;
}

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  INLINE_CODE_RE.lastIndex = 0;
  for (const m of text.matchAll(INLINE_CODE_RE)) {
    const at = m.index ?? 0;
    // A backtick inside a URL isn't code (rare, but keep links whole).
    if (inRanges(at, protectedRanges(text))) continue;
    if (at > last) nodes.push(...parseEmphasis(text.slice(last, at)));
    nodes.push({ type: 'code', text: m[1] });
    last = at + m[0].length;
  }
  if (last < text.length) nodes.push(...parseEmphasis(text.slice(last)));
  return mergeText(nodes);
}

function mergeText(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (node.type === 'text' && prev?.type === 'text') prev.text += node.text;
    else out.push(node);
  }
  return out;
}

// Text outside code blocks -> paragraphs and "> " quote groups, one block per run of lines.
function parseLines(text: string): BlockNode[] {
  const blocks: BlockNode[] = [];
  const lines = text.split('\n');
  let buffer: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (!buffer.length) return;
    const joined = buffer.join('\n');
    if (joined.trim()) blocks.push({ type: 'paragraph', children: parseInline(joined) });
    buffer = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    blocks.push({ type: 'quote', children: parseInline(quote.join('\n')) });
    quote = [];
  };

  for (const line of lines) {
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q && line.trim() !== '>') {
      flushParagraph();
      quote.push(q[1]);
    } else {
      flushQuote();
      buffer.push(line);
    }
  }
  flushParagraph();
  flushQuote();
  return blocks;
}

export function parseChatFormatting(input: string): BlockNode[] {
  const text = input ?? '';
  const blocks: BlockNode[] = [];
  let last = 0;
  CODE_BLOCK_RE.lastIndex = 0;
  for (const m of text.matchAll(CODE_BLOCK_RE)) {
    const at = m.index ?? 0;
    const code = m[2].replace(/\n$/, '');
    if (!code.trim()) continue;
    if (at > last) blocks.push(...parseLines(text.slice(last, at).replace(/\n$/, '')));
    blocks.push({ type: 'codeblock', text: code, lang: m[1] || null });
    last = at + m[0].length;
    if (text[last] === '\n') last++;
  }
  if (last < text.length) blocks.push(...parseLines(text.slice(last)));
  return blocks;
}

/** True when the text uses any formatting syntax at all (cheap pre-check for the fast path). */
export function hasFormatting(text: string): boolean {
  return /[*_~`]|(^|\n)\s*>/.test(text);
}

/** Strips formatting markers for plain-text surfaces (previews, notifications, clipboard). */
export function stripFormatting(text: string): string {
  const flatten = (nodes: InlineNode[]): string =>
    nodes.map((n) => (n.type === 'text' || n.type === 'code' ? n.text : flatten(n.children))).join('');
  return parseChatFormatting(text)
    .map((b) => (b.type === 'codeblock' ? b.text : flatten(b.children)))
    .join('\n');
}
