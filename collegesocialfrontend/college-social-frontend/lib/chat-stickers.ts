import { STICKER_CATALOG } from './sticker-catalog';
import { TEXT_STICKERS, type TextSticker } from './text-stickers';
import { assetUrl } from './utils';

// A sticker message carries one reference in its attachment `url`:
//   sticker:3d/<id>     -- 3D artwork, served from /stickers/3d/<id>.webp (Fluent Emoji, MIT)
//   sticker:anim/<id>   -- animated artwork, /stickers/anim/<id>.webp (Noto Emoji Animation, CC BY 4.0)
//   sticker:text/<id>   -- an Arabic text sticker drawn with CSS (lib/text-stickers.ts)
//   sticker:campus|reactions/<id> -- the first emoji-only packs (kept so old messages still render)
//   anything else       -- a user-made sticker image (uploaded; resolved through assetUrl)

export type ResolvedSticker =
  | { kind: 'image'; src: string; label: string; animated: boolean }
  | { kind: 'text'; sticker: TextSticker; label: string }
  | { kind: 'emoji'; emoji: string; label: string };

const LEGACY_EMOJI: Record<string, { emoji: string; label: string }> = {
  'campus/study': { emoji: '📚', label: 'وقت المذاكرة' },
  'campus/coffee': { emoji: '☕', label: 'استراحة قهوة' },
  'campus/graduate': { emoji: '🎓', label: 'نجاح' },
  'campus/brain': { emoji: '🧠', label: 'فكرة عبقرية' },
  'campus/sleep': { emoji: '😴', label: 'محتاج أنام' },
  'campus/deadline': { emoji: '⏰', label: 'موعد التسليم' },
  'reactions/party': { emoji: '🥳', label: 'مبروك' },
  'reactions/love': { emoji: '🥰', label: 'كل الحب' },
  'reactions/laugh': { emoji: '😂', label: 'ضحك' },
  'reactions/wow': { emoji: '🤩', label: 'مذهل' },
  'reactions/thanks': { emoji: '🙏', label: 'شكرًا' },
  'reactions/strong': { emoji: '💪', label: 'قدها' },
};

const LABELS = new Map(STICKER_CATALOG.flatMap((pack) => pack.items.map((item) => [item.ref, item.label] as const)));
const TEXT_BY_ID = new Map(TEXT_STICKERS.map((t) => [t.id, t]));

export function textStickerRef(sticker: TextSticker): string {
  return `sticker:text/${sticker.id}`;
}

export function resolveSticker(url: string, name?: string | null): ResolvedSticker {
  if (url.startsWith('sticker:')) {
    const path = url.slice('sticker:'.length);
    const [set, id] = path.split('/');
    if ((set === '3d' || set === 'anim') && id) {
      return { kind: 'image', src: `/stickers/${set}/${id}.webp`, label: LABELS.get(url) ?? name ?? 'ملصق', animated: set === 'anim' };
    }
    if (set === 'text') {
      const sticker = TEXT_BY_ID.get(id);
      if (sticker) return { kind: 'text', sticker, label: sticker.text };
    }
    const legacy = LEGACY_EMOJI[path];
    return legacy ? { kind: 'emoji', ...legacy } : { kind: 'emoji', emoji: '🏷️', label: name ?? 'ملصق' };
  }
  return { kind: 'image', src: assetUrl(url) ?? url, label: name || 'ملصق', animated: false };
}

// --- recently used (per device) ---------------------------------------------------------------

const RECENT_KEY = 'chat:recentStickers';
const RECENT_MAX = 24;

export function readRecentStickers(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberSticker(url: string): void {
  try {
    const next = [url, ...readRecentStickers().filter((u) => u !== url)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

// --- search -----------------------------------------------------------------------------------

// Arabic-aware normalisation: drop diacritics/tatweel and unify alef/yaa/taa-marbuta forms, so a
// search typed without hamzas or with ه for ة still finds the sticker.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

export function searchStickers(query: string): string[] {
  const q = normalize(query);
  if (!q) return [];
  const hits: string[] = [];
  for (const sticker of TEXT_STICKERS) {
    if (normalize(sticker.text).includes(q)) hits.push(textStickerRef(sticker));
  }
  for (const pack of STICKER_CATALOG) {
    for (const item of pack.items) {
      if (normalize(item.label).includes(q) || item.ref.includes(q)) hits.push(item.ref);
    }
  }
  return [...new Set(hits)].slice(0, 80);
}
