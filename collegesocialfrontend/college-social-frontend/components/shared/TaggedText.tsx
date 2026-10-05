import Link from 'next/link';
import { cn } from '@/lib/utils';

// Matches how the backend encodes a resolved @mention inline in raw text -- see
// college-social-backend/src/common/utils/tag-parser.util.ts. Captures the display name and the
// user id separately so this never needs a populated `mentions` array to render correctly.
const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-fA-F]{24})\)/;
const COMBINED_RE = /(@\[[^\]]+\]\([0-9a-fA-F]{24}\))|(#[a-zA-Z0-9_]+)|(https?:\/\/[^\s<>()]+)/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Wraps every case-insensitive occurrence of `highlight` in a <mark> (in-chat search hits).
function highlighted(text: string, highlight: string | undefined, keyPrefix: string): React.ReactNode {
  const term = highlight?.trim();
  if (!term || !text) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, 'gi'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={`${keyPrefix}-${i}`} className="rounded-sm bg-amber-300/80 px-0.5 text-inherit dark:bg-amber-400/60">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

// Renders caption/comment/message text with @mention tokens turned into profile links, #hashtags
// turned into search links, and bare URLs turned into clickable links. Doesn't wrap the output in
// its own element, so the caller keeps its own container (e.g. a <p className="whitespace-pre-wrap">).
//
// `tone="inverted"` is for text sitting on an accent-coloured surface (own chat bubbles), where
// accent-coloured links would vanish into the background. `highlight` marks search matches in
// the plain-text runs.
export function TaggedText({
  text,
  highlight,
  tone = 'default',
}: {
  text: string;
  highlight?: string;
  tone?: 'default' | 'inverted';
}) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  const linkTone =
    tone === 'inverted' ? 'text-white underline decoration-white/50 underline-offset-2' : 'text-accent';

  for (const match of text.matchAll(COMBINED_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(highlighted(text.slice(lastIndex, index), highlight, `t${key++}`));

    if (match[1]) {
      const mention = MENTION_RE.exec(match[1]);
      if (mention) {
        const [, name, id] = mention;
        nodes.push(
          <Link key={key++} href={`/profile/${id}`} className={cn('font-medium hover:underline', linkTone)}>
            @{name}
          </Link>,
        );
      }
    } else if (match[2]) {
      const tag = match[2].slice(1);
      nodes.push(
        <Link key={key++} href={`/search?q=${encodeURIComponent(`#${tag}`)}`} className={cn('hover:underline', linkTone)}>
          {match[2]}
        </Link>,
      );
    } else if (match[3]) {
      // Strip common trailing punctuation that's part of the sentence, not the URL (e.g. "see
      // https://x.com/foo." or "(https://x.com/foo)").
      const trailing = match[3].match(/[.,!?;:)\]]+$/)?.[0] ?? '';
      const href = trailing ? match[3].slice(0, -trailing.length) : match[3];
      nodes.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn('break-words hover:underline', linkTone)}
        >
          {href}
        </a>,
      );
      if (trailing) nodes.push(trailing);
    }

    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(highlighted(text.slice(lastIndex), highlight, `t${key++}`));

  return <>{nodes}</>;
}
