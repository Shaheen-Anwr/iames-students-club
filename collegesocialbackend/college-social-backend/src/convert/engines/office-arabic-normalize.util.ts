// Post-processes a generated Office file (.docx/.pptx/.xlsx) so its Arabic text is clean, editable
// Unicode -- even when the upstream engine (Adobe, LibreOffice) faithfully carried over a broken
// PDF font encoding. An Office file is a zip of XML; we rewrite the text nodes of the text-bearing
// parts in place, leaving all layout / styling / structure untouched:
//
//   * Arabic Presentation Forms + ligatures (U+FB50-U+FDFF, U+FE70-U+FEFF) -> base letters, via
//     Unicode NFKD compatibility decomposition (so the text is selectable, searchable and
//     re-shapeable by Word instead of frozen isolated glyphs / two-letter ligatures).
//   * runs the engine stored in VISUAL (reversed) order -- detected from a leading final-form
//     glyph -- flipped back to logical order before decomposing.
//   * the systematic ر/ن transposition + "الا"/"الأ" mis-ordering some PDF fonts bake in
//     (see arabic-fix.util).
//   * a stray space injected inside a word before a broken "...ًا" ending ("استثما رًا").
//   * stray bidi control characters.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');
import { fixArabicArtifacts } from './arabic-fix.util';

const PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻿]/;
const ARABIC = /[؀-ۿ]/;
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩؜]/g;
const SPLIT_TANWEEN_ALEF = /([ء-ي])\s+([ء-ي]?ًا)(?=\s|$|[^ء-ي])/g;

// FINAL-form Arabic presentation letters (U+FE8x-U+FEFx). A word can only *end* with one of these,
// so a run whose first letter is a final form was stored right-to-left (visual order) and must be
// reversed before it's decomposed to base letters.
const FINAL_FORMS = new Set(
  [
    0xfe8a, 0xfe8c, 0xfe8e, 0xfe90, 0xfe94, 0xfe96, 0xfe9a, 0xfe9e, 0xfea2, 0xfea6, 0xfeaa, 0xfeac,
    0xfeae, 0xfeb0, 0xfeb2, 0xfeb6, 0xfeba, 0xfebe, 0xfec2, 0xfec6, 0xfeca, 0xfece, 0xfed2, 0xfed6,
    0xfeda, 0xfede, 0xfee2, 0xfee6, 0xfeea, 0xfeee, 0xfef0, 0xfef2, 0xfefc,
  ].map((c) => String.fromCharCode(c)),
);
const PRESENTATION_LETTER = /[ﺀ-ﻼ]/;

// If (almost) every multi-letter Arabic word in a text node begins with a FINAL-form glyph, the
// engine stored that whole run right-to-left -- flip it (chars + word order) back to logical.
// Deliberately conservative: a node with any genuinely-logical Arabic word is left alone rather
// than risk half-mangling it (a cleanly-decomposed but reversed heading is the lesser evil).
function fixVisualOrder(s: string): string {
  const words = (s.match(/[ﺀ-ﻼ]{2,}/g) ?? []) as string[];
  if (words.length < 2) return s;
  const reversedLooking = words.filter((w) => FINAL_FORMS.has([...w][0])).length;
  return reversedLooking / words.length >= 0.85 ? [...s].reverse().join('') : s;
}

// docx body/headers/footers/notes, pptx slides + notes, xlsx shared strings.
const TEXT_PART_RE =
  /^(word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml|ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml|xl\/sharedStrings\.xml)$/;
// <w:t ...>text</w:t> | <a:t>text</a:t> | <t ...>text</t>
const TEXT_NODE_RE = /(<(w:t|a:t|t)(?:\s[^>]*)?>)([^<]*)(<\/\2>)/g;

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
function encodeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 'output': full clean-up of an engine's result (assume it may carry a broken PDF font encoding).
// 'input':  only the structural fixes safe to run on a user's own Office file before it goes to an
//           engine -- decompose frozen presentation-form glyphs / ligatures, strip bidi controls.
//           The PDF-font-specific ر/ن corrections (arabic-fix) are NOT applied here, so a pristine
//           Word doc is guaranteed untouched.
export type NormalizeMode = 'input' | 'output';

function normalizeText(rawXmlText: string, mode: NormalizeMode): string {
  let s = decodeXml(rawXmlText);
  if (!ARABIC.test(s) && !PRESENTATION_FORMS.test(s)) return rawXmlText;
  if (PRESENTATION_FORMS.test(s)) {
    // Flip visually-stored runs to logical order, then NFKD turns every Arabic presentation form
    // + two-letter ligature into its base letters.
    s = fixVisualOrder(s).normalize('NFKD').replace(SPLIT_TANWEEN_ALEF, '$1$2');
  }
  s = s.replace(BIDI_CONTROLS, '');
  if (mode === 'output') s = fixArabicArtifacts(s);
  return encodeXml(s);
}

export function normalizeArabicInOfficeFile(buf: Buffer, mode: NormalizeMode = 'output'): Buffer {
  let zip: any;
  try {
    zip = new AdmZip(buf);
  } catch {
    return buf; // not a zip we understand -- leave it
  }
  let changed = false;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !TEXT_PART_RE.test(entry.entryName)) continue;
    const xml: string = entry.getData().toString('utf8');
    // 'input' mode only ever needs to act on files that actually contain frozen presentation forms.
    if (mode === 'input' ? !PRESENTATION_FORMS.test(xml) : !ARABIC.test(xml) && !PRESENTATION_FORMS.test(xml)) continue;
    const out = xml.replace(TEXT_NODE_RE, (_m, open, _tag, txt, close) => open + normalizeText(txt, mode) + close);
    if (out !== xml) {
      zip.updateFile(entry.entryName, Buffer.from(out, 'utf8'));
      changed = true;
    }
  }
  return changed ? zip.toBuffer() : buf;
}
