import Link from 'next/link';

// Matches how the backend encodes a resolved @mention inline in raw text -- see
// college-social-backend/src/common/utils/tag-parser.util.ts. Captures the display name and the
// user id separately so this never needs a populated `mentions` array to render correctly.
const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-fA-F]{24})\)/;
const COMBINED_RE = /(@\[[^\]]+\]\([0-9a-fA-F]{24}\))|(#[a-zA-Z0-9_]+)|(https?:\/\/[^\s<>()]+)/g;

// Renders caption/comment/message text with @mention tokens turned into profile links, #hashtags
// turned into search links, and bare URLs turned into clickable links. Doesn't wrap the output in
// its own element, so the caller keeps its own container (e.g. a <p className="whitespace-pre-wrap">).
export function TaggedText({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(COMBINED_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));

    if (match[1]) {
      const mention = MENTION_RE.exec(match[1]);
      if (mention) {
        const [, name, id] = mention;
        nodes.push(
          <Link key={key++} href={`/profile/${id}`} className="font-medium text-accent hover:underline">
            @{name}
          </Link>,
        );
      }
    } else if (match[2]) {
      const tag = match[2].slice(1);
      nodes.push(
        <Link key={key++} href={`/search?q=${encodeURIComponent(`#${tag}`)}`} className="text-accent hover:underline">
          {match[2]}
        </Link>,
      );
    } else if (match[3]) {
      // Strip common trailing punctuation that's part of the sentence, not the URL (e.g. "see
      // https://x.com/foo." or "(https://x.com/foo)").
      const trailing = match[3].match(/[.,!?;:)\]]+$/)?.[0] ?? '';
      const href = trailing ? match[3].slice(0, -trailing.length) : match[3];
      nodes.push(
        <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          {href}
        </a>,
      );
      if (trailing) nodes.push(trailing);
    }

    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  return <>{nodes}</>;
}
