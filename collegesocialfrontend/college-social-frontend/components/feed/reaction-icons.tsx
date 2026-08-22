import { Angry, EyeOff, Frown, HeartHandshake, PartyPopper, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { ReactionType } from '@/lib/types';

// Icon-based reactions instead of native emoji glyphs -- unicode emoji render through whatever
// font the OS/browser falls back to, which is wildly inconsistent across devices (this is what
// made the reaction strip look broken/mismatched on some phones). Icons are drawn by us, so they
// render identically everywhere.
export const REACTION_ICONS: Record<ReactionType, React.ComponentType<{ className?: string }>> = {
  like: ThumbsUp,
  dislike: ThumbsDown,
  care: HeartHandshake,
  support: PartyPopper,
  not_interested: EyeOff,
  sad: Frown,
  angry: Angry,
};

export const REACTION_COLORS: Record<ReactionType, { text: string; bg: string }> = {
  like: { text: 'text-sky-500', bg: 'bg-sky-500/15' },
  dislike: { text: 'text-red-500', bg: 'bg-red-500/15' },
  care: { text: 'text-rose-500', bg: 'bg-rose-500/15' },
  support: { text: 'text-amber-500', bg: 'bg-amber-500/15' },
  not_interested: { text: 'text-slate-400', bg: 'bg-slate-400/15' },
  sad: { text: 'text-indigo-400', bg: 'bg-indigo-400/15' },
  angry: { text: 'text-orange-600', bg: 'bg-orange-600/15' },
};

export function ReactionIcon({ type, className }: { type: ReactionType; className?: string }) {
  const Icon = REACTION_ICONS[type];
  return <Icon className={className} />;
}
