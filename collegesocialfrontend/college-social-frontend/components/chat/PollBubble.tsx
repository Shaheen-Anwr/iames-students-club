'use client';

import { motion } from 'framer-motion';
import { BarChart3, Check, Lock } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { haptic } from '@/lib/haptics';
import { assetUrl, cn } from '@/lib/utils';
import type { Message } from '@/lib/types';
import { useChatActions, useChatInfo } from './ChatThreadContext';

// A poll inside a chat bubble: tap to vote (single choice replaces, multiple toggles; tapping your
// pick again retracts it), results animate live as votes land over the socket, and the creator can
// close it. Votes are optimistic -- ChatWindow patches locally before the server echo arrives.
export function PollBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const actions = useChatActions();
  const { currentUserId, participantsById } = useChatInfo();
  const poll = message.poll;
  if (!poll) return null;

  const voters = new Set(poll.options.flatMap((o) => o.voters));
  const total = voters.size;
  const myChoices = poll.options.filter((o) => o.voters.includes(currentUserId)).map((o) => o.id);
  const leader = Math.max(0, ...poll.options.map((o) => o.voters.length));
  const locked = poll.closed || !!message.pending || !!message.failed || message._id.startsWith('tmp_');

  function choose(optionId: string) {
    if (locked) return;
    const next = poll!.multiple
      ? myChoices.includes(optionId)
        ? myChoices.filter((id) => id !== optionId)
        : [...myChoices, optionId]
      : myChoices.includes(optionId)
        ? []
        : [optionId];
    haptic('select');
    actions.vote(message, next);
  }

  return (
    <div className="w-[min(18.5rem,72vw)] px-2.5 pb-1 pt-2" onClick={(e) => e.stopPropagation()}>
      <div className="mb-1 flex items-start gap-2">
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            isOwn ? 'bg-white/20 text-white' : 'bg-accent/[0.12] text-accent',
          )}
        >
          <BarChart3 className="h-4 w-4" />
        </span>
        <p dir="auto" className="min-w-0 flex-1 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">
          {poll.question}
        </p>
      </div>
      <p className={cn('mb-2 ps-9 text-[11.5px]', isOwn ? 'text-white/75' : 'text-muted-foreground')}>
        {poll.closed ? (
          <span className="inline-flex items-center gap-1">
            <Lock className="h-3 w-3" /> انتهى التصويت
          </span>
        ) : poll.multiple ? (
          'اختر خيارًا أو أكثر'
        ) : (
          'اختر خيارًا واحدًا'
        )}
      </p>

      <div className="space-y-1.5">
        {poll.options.map((option) => {
          const count = option.voters.length;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const mine = option.voters.includes(currentUserId);
          const winning = poll.closed && count > 0 && count === leader;
          const faces = option.voters
            .slice(0, 3)
            .map((id) => participantsById.get(id))
            .filter((u): u is NonNullable<typeof u> => !!u);
          return (
            <button
              key={option.id}
              type="button"
              disabled={locked}
              onClick={() => choose(option.id)}
              aria-pressed={mine}
              className={cn(
                'relative flex w-full items-center gap-2 overflow-hidden rounded-xl px-2.5 py-2 text-start text-sm transition-transform',
                !locked && 'active:scale-[0.98]',
                isOwn ? 'bg-white/[0.12] hover:bg-white/[0.18]' : 'bg-foreground/[0.05] hover:bg-foreground/[0.08]',
                locked && 'cursor-default',
              )}
            >
              <motion.span
                aria-hidden
                className={cn(
                  'absolute inset-y-0 start-0 rounded-xl',
                  isOwn ? 'bg-white/25' : mine ? 'bg-accent/25' : 'bg-accent/[0.12]',
                )}
                initial={false}
                animate={{ width: `${pct}%` }}
                transition={{ type: 'spring', stiffness: 220, damping: 30 }}
              />
              <span
                className={cn(
                  'relative flex h-[18px] w-[18px] shrink-0 items-center justify-center border-2 transition-colors',
                  poll.multiple ? 'rounded-md' : 'rounded-full',
                  mine
                    ? isOwn
                      ? 'border-white bg-white text-accent'
                      : 'border-accent bg-accent text-white'
                    : isOwn
                      ? 'border-white/60'
                      : 'border-muted-foreground/50',
                )}
              >
                {mine && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span dir="auto" className={cn('relative min-w-0 flex-1 [overflow-wrap:anywhere]', winning && 'font-bold')}>
                {option.text}
              </span>
              {faces.length > 0 && (
                <span className="relative flex -space-x-1.5 rtl:space-x-reverse">
                  {faces.map((u) => (
                    <Avatar key={u._id} src={assetUrl(u.photoUrl)} name={u.name} size="xs" className="h-4 w-4 text-[7px] ring-1 ring-surface" />
                  ))}
                </span>
              )}
              <span className={cn('relative w-9 shrink-0 text-end text-xs font-semibold tabular-nums', isOwn ? 'text-white' : 'text-foreground/80')}>
                {pct}%
              </span>
            </button>
          );
        })}
      </div>

      <div className={cn('mt-2 flex items-center justify-between gap-2 text-[11.5px]', isOwn ? 'text-white/80' : 'text-muted-foreground')}>
        <button
          type="button"
          onClick={() => actions.showPollVotes(message)}
          disabled={total === 0}
          className="rounded-full px-1 py-0.5 font-medium hover:underline disabled:no-underline"
        >
          {total === 0 ? 'لا أصوات بعد' : total === 1 ? 'صوت واحد · عرض' : `${total} أصوات · عرض`}
        </button>
        {isOwn && !poll.closed && !locked && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('إنهاء الاستطلاع؟ لن يتمكن أحد من التصويت بعد ذلك.')) actions.closePoll(message);
            }}
            className="rounded-full px-1.5 py-0.5 font-medium hover:underline"
          >
            إنهاء الاستطلاع
          </button>
        )}
      </div>
    </div>
  );
}
