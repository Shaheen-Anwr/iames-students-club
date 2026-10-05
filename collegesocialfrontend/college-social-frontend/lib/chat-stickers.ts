// Stable references travel with the message; clients resolve them without a third-party CDN.
export const STICKER_PACKS = [
  { id: 'campus', name: 'يوم الجامعة', stickers: [
    { id: 'study', emoji: '📚', label: 'وقت المذاكرة' },
    { id: 'coffee', emoji: '☕', label: 'استراحة قهوة' },
    { id: 'graduate', emoji: '🎓', label: 'نجاح' },
    { id: 'brain', emoji: '🧠', label: 'فكرة عبقرية' },
    { id: 'sleep', emoji: '😴', label: 'محتاج أنام' },
    { id: 'deadline', emoji: '⏰', label: 'موعد التسليم' },
  ] },
  { id: 'reactions', name: 'ردود سريعة', stickers: [
    { id: 'party', emoji: '🥳', label: 'مبروك' },
    { id: 'love', emoji: '🥰', label: 'كل الحب' },
    { id: 'laugh', emoji: '😂', label: 'ضحك' },
    { id: 'wow', emoji: '🤩', label: 'مذهل' },
    { id: 'thanks', emoji: '🙏', label: 'شكرًا' },
    { id: 'strong', emoji: '💪', label: 'قدها' },
  ] },
] as const;

export function builtinSticker(url: string): { emoji: string; label: string } | undefined {
  const [packId, stickerId] = url.replace(/^sticker:/, '').split('/');
  return url.startsWith('sticker:')
    ? STICKER_PACKS.find((pack) => pack.id === packId)?.stickers.find((sticker) => sticker.id === stickerId)
    : undefined;
}
