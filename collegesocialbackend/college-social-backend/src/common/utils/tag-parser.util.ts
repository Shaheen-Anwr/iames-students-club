// Mentions are encoded inline in raw text as `@[Display Name](userId)` -- inserted by the
// frontend's mention picker, never typed by hand. There's no unique `username` field on User (only
// `name`/`collegeId`, and names can collide), so the picker resolves a specific user up front and
// embeds their id directly rather than relying on fuzzy name matching at parse time.
export const MENTION_TOKEN_RE = /@\[[^\]]+\]\(([0-9a-fA-F]{24})\)/g;

// Plain `#word` hashtags, letters/digits/underscore only (matches how Instagram/Twitter scope a tag).
export const HASHTAG_RE = /#([a-zA-Z0-9_]+)/g;

// Raw regex capture only -- callers must validate these ids actually belong to existing users
// before trusting/persisting/notifying against them.
export function extractMentionIds(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(MENTION_TOKEN_RE)) ids.add(match[1]);
  return [...ids];
}

export function parseHashtags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(HASHTAG_RE)) tags.add(match[1].toLowerCase());
  return [...tags];
}
