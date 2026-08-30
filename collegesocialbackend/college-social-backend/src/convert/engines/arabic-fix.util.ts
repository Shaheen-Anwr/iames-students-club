// Corrects two systematic defects that some Arabic PDFs bake into their font ToUnicode maps, so
// every extractor (Poppler, PDF.js, LibreOffice) inherits them:
//
//   1. Word-initial definite article before a hamzated alef is mis-ordered:
//        "اال..." -> "الا...",  "األ..." -> "الأ...",  "اإل..." -> "الإ..."
//      No Arabic word starts "اا"/"األ"/"اإل", so this is safe to apply generically (also after a
//      و/ف/ب/ك/ل clitic or leading punctuation).
//
//   2. The letter ر (and, at a word's end, ن) is emitted one position out of order:
//        "استراتيجية" -> "اسرتاتيجية",  "المحاضرة" -> "المحارضة",  "الموظفين" -> "الموظفني"
//      A blind letter-swap would corrupt valid words (رضا, المهني, مرتبط), so this is a CURATED
//      whitelist of bare stems that are never valid Arabic, matched with an optional و/ف/ب/ك/ل +
//      ال prefix, plus the one substring ("سرتات") that is likewise never valid.

const AR_RANGE = /[؀-ۿ]/;
const CLITIC_RE = /^([وفبكل])(.+)/;

// broken bare stem -> correct bare stem (no leading ال / clitic)
const STEM_FIXES: Record<string, string> = {
  محارضة: 'محاضرة',
  محارضات: 'محاضرات',
  عارشة: 'عاشرة',
  رتكزي: 'تركيز',
  سيرباني: 'سيبراني',
  مبارش: 'مباشر',
  مبارشة: 'مباشرة',
  مبارشين: 'مباشرين',
  رشكة: 'شركة',
  رشكات: 'شركات',
  إلكرتوني: 'إلكتروني',
  إلكرتونية: 'إلكترونية',
  مؤرش: 'مؤشر',
  مؤرشات: 'مؤشرات',
  فرتة: 'فترة',
  فرتات: 'فترات',
  رضورة: 'ضرورة',
  رضوري: 'ضروري',
  متغرية: 'متغيرة',
  متغريات: 'متغيرات',
  برش: 'بشر',
  برشي: 'بشري',
  برشية: 'بشرية',
  نرش: 'نشر',
  رشيحة: 'شريحة',
  تحفزي: 'تحفيز',
  استرشاف: 'استشراف',
  استرشافي: 'استشرافي',
  تمكني: 'تمكين',
  تحسني: 'تحسين',
  تحسنيات: 'تحسينات',
  تأمني: 'تأمين',
  تعيني: 'تعيين',
  عاملني: 'عاملين',
  موظفني: 'موظفين',
  مرشحني: 'مرشحين',
  متقدمني: 'متقدمين',
  متدربني: 'متدربين',
  مستفيدني: 'مستفيدين',
  مشاركني: 'مشاركين',
  محرتفني: 'محترفين',
  طرفني: 'طرفين',
  اثنني: 'اثنين',
};
const STEM_KEYS = Object.keys(STEM_FIXES).sort((a, b) => b.length - a.length);
const STEM_RE = new RegExp(`^(ال)?(${STEM_KEYS.join('|')})$`);

function fixArticlePrefix(tok: string): string {
  if (/^اال/.test(tok)) return 'الا' + tok.slice(3);
  if (/^األ/.test(tok)) return 'الأ' + tok.slice(3);
  if (/^اإل/.test(tok)) return 'الإ' + tok.slice(3);
  return tok;
}

function fixCore(tok: string): string {
  if (!AR_RANGE.test(tok)) return tok;
  const m = CLITIC_RE.exec(tok);
  if (m && AR_RANGE.test(m[2])) {
    const inner = fixCore(m[2]);
    if (inner !== m[2]) return m[1] + inner;
  }
  const pref = fixArticlePrefix(tok);
  if (pref !== tok) return pref;
  const sm = STEM_RE.exec(tok);
  if (sm) return (sm[1] ?? '') + STEM_FIXES[sm[2]];
  return tok;
}

// Peel leading/trailing punctuation, digits and stray marks (incl. Arabic comma ، which is inside
// the Arabic block), fix the Arabic-letter core, reattach -- so "،الاستدامة", ".الرتكزي",
// "365وتحسني" are still reached. LETTER = Arabic letters + tatweel + tashkeel + superscript alef.
const LETTER = '\\u0621-\\u064A\\u0640\\u064B-\\u0652\\u0670\\u0671-\\u06D3';
const TOKEN_CORE_RE = new RegExp(`^([^${LETTER}]*)([${LETTER}](?:.*[${LETTER}])?)([^${LETTER}]*)$`);
function fixToken(tok: string): string {
  const m = TOKEN_CORE_RE.exec(tok);
  return m ? m[1] + fixCore(m[2]) + m[3] : tok;
}

// A stray space injected inside a word before a final ي-run ("التدر يب" -> "التدريب",
// "فر يد" -> "فريد"): only when the left fragment ends in ر, where this font's bug occurs.
const SPLIT_YEH_RE = /([ء-ي]*ر) +(ي[ء-ي]{1,3})(?![ء-ي])/g;
// Same bug with ش, for the recurring word it produces: "الرش يحة" -> "الشريحة".
const SPLIT_SHIN_RE = /((?:ال)?)رش +يح(ات|ة)?(?![ء-ي])/g;

export function fixArabicArtifacts(text: string): string {
  if (!text || !AR_RANGE.test(text)) return text;
  let out = text
    .split(/(\s+)/)
    .map((t) => (/^\s*$/.test(t) ? t : fixToken(t)))
    .join('');
  out = out.replace(/سرتات/g, 'سترات');
  out = out.replace(SPLIT_SHIN_RE, (_m: string, al: string, suf?: string) => `${al}شريح${suf ?? 'ة'}`);
  out = out.replace(SPLIT_YEH_RE, '$1$2');
  out = out.replace(/([ء-ي])ً([ء-ي]) +ا(?![ء-ي])/g, '$1$2ًا');
  return out;
}
