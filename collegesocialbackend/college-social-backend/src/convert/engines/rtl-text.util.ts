// Arabic / RTL text handling for the from-scratch PDF renderer.
//
// A PDF bakes final glyph positions -- the reader does no reshaping or bidi -- so we must do both
// before drawing: (1) contextual shaping (letters -> initial/medial/final/isolated presentation
// forms) and (2) the Unicode Bidirectional Algorithm (reorder to visual order, mirror brackets).
// pdfkit/fontkit draw the resulting string left-to-right as-is.
//
// Approach that keeps indices aligned through both steps:
//   * shapePerIndex(): reshape each Arabic-letter run in LOGICAL order, emitting one output slot
//     per input code unit ('' where a LAM+ALEF ligature absorbed the alef) so the array length
//     matches the input exactly.
//   * reorderVisual(): bidi-js getReorderedIndices() gives the visual permutation of the ORIGINAL
//     string; we apply it to the shaped slots, substituting mirrored brackets from bidi-js.
//
// Pure Arabic paragraphs and headings come out correct. Dense mixed Arabic+Latin+punctuation on a
// single line can still have minor punctuation-placement quirks -- documented as best-effort.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bidiFactory = require('bidi-js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ArabicShaper } = require('arabic-persian-reshaper');

const bidi = bidiFactory();

// Any Arabic-block code point (main + supplements + presentation forms A/B).
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
// Arabic *letters* only (drives run detection for shaping); excludes digits, punctuation, marks.
const ARABIC_LETTER_RE = /[ء-يٮ-ۓەۮۯۺ-ۼۿ]/;
const ARABIC_MARK_RE = /[ً-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭـ]/; // tashkeel + tatweel
const LAM = 0x0644;
const ALEFS = new Set([0x0627, 0x0623, 0x0625, 0x0622]);

export function containsArabic(text: string): boolean {
  return ARABIC_RE.test(text);
}

/** True when the paragraph's resolved base direction is right-to-left. */
export function isRtl(text: string): boolean {
  const paras = bidi.getEmbeddingLevels(text).paragraphs;
  if (paras && paras[0]) return (paras[0].level & 1) === 1;
  return ARABIC_RE.test(text);
}

// One shaped output slot per input code unit; '' where a LAM+ALEF ligature merged two inputs.
function shapePerIndex(text: string): string[] {
  const out: string[] = new Array(text.length).fill('');
  let i = 0;
  while (i < text.length) {
    if (!ARABIC_LETTER_RE.test(text[i]) && !ARABIC_MARK_RE.test(text[i])) {
      out[i] = text[i];
      i += 1;
      continue;
    }
    let j = i;
    while (j < text.length && (ARABIC_LETTER_RE.test(text[j]) || ARABIC_MARK_RE.test(text[j]))) j += 1;
    const shaped = [...ArabicShaper.convertArabic(text.slice(i, j))];
    let k = i;
    let s = 0;
    while (k < j) {
      const cp = text.charCodeAt(k);
      if (cp === LAM && k + 1 < j && ALEFS.has(text.charCodeAt(k + 1))) {
        out[k] = shaped[s] ?? '';
        out[k + 1] = '';
        k += 2;
        s += 1;
      } else {
        out[k] = shaped[s] ?? text[k];
        k += 1;
        s += 1;
      }
    }
    i = j;
  }
  return out;
}

/**
 * Logical string -> visual-order string ready to draw left-to-right with pdfkit. A string with no
 * Arabic is returned unchanged.
 */
export function reorderVisual(text: string): string {
  if (!text || !ARABIC_RE.test(text)) return text;
  const embedding = bidi.getEmbeddingLevels(text);
  const shaped = shapePerIndex(text);
  const mirrored: Map<number, string> = bidi.getMirroredCharactersMap(text, embedding);
  let out = '';
  for (const idx of bidi.getReorderedIndices(text, embedding)) {
    out += mirrored.has(idx) ? mirrored.get(idx) : shaped[idx];
  }
  return out;
}
