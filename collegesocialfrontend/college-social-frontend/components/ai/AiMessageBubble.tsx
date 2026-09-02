'use client';

import { memo, useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, AlertCircle, AlertTriangle, Paperclip, FileStack } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { cldOptimize } from '@/lib/images';
import { ViewablePhoto } from '@/components/ui/ViewablePhoto';
import type { AiMessage } from '@/lib/types';
import { AiAvatar } from './AiAvatar';
import { AiMarkdown } from './AiMarkdown';

// Total time (ms) spent revealing a freshly-arrived assistant reply, independent of its length --
// keeps the "typing" feel snappy instead of turning long answers into a slow read-along.
const REVEAL_DURATION = 700;
const REVEAL_TICK = 16;

// Memoized so a parent re-render (e.g. AiChatPanel's streaming state changing per token) doesn't
// re-run every prior bubble's render logic -- only the bubble whose own props actually changed
// re-renders. Requires callback props (onRetry/onRegenerate) to be stable references; see
// AiChatPanel's useCallback-wrapped handlers.
export const AiMessageBubble = memo(function AiMessageBubble({
  message,
  live,
  onLiveDone,
  failed,
  onRetry,
  canRegenerate,
  onRegenerate,
}: {
  message: AiMessage;
  live?: boolean;
  onLiveDone?: () => void;
  failed?: boolean;
  onRetry?: () => void;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
}) {
  const isUser = message.role === 'user';
  const isStub = !isUser && !!message.stub;
  const [displayText, setDisplayText] = useState(live ? '' : message.text);
  const [revealing, setRevealing] = useState(!!live);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!live) {
      setDisplayText(message.text);
      setRevealing(false);
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplayText(message.text);
      setRevealing(false);
      onLiveDone?.();
      return;
    }
    setRevealing(true);
    let i = 0;
    const totalTicks = Math.max(1, Math.round(REVEAL_DURATION / REVEAL_TICK));
    const step = Math.max(1, Math.ceil(message.text.length / totalTicks));
    const id = setInterval(() => {
      i += step;
      if (i >= message.text.length) {
        setDisplayText(message.text);
        setRevealing(false);
        clearInterval(id);
        onLiveDone?.();
      } else {
        setDisplayText(message.text.slice(0, i));
      }
    }, REVEAL_TICK);
    return () => clearInterval(id);
    // Only re-run when the message identity changes, not on every text/callback re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message._id, live]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable -- silently ignore
    }
  }

  return (
    <div className={cn('group/msg flex items-end gap-2 animate-slide-up', isUser && 'flex-row-reverse')}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white shadow-soft">
          <AiAvatar size={18} />
        </div>
      )}
      <div
        className={cn(
          'flex min-w-0 flex-col gap-1',
          isUser ? 'max-w-[85%] items-end sm:max-w-[80%]' : 'max-w-[calc(100%-2.5rem)] items-start sm:max-w-[85%]',
        )}
      >
        {message.sharedPostId && (
          <span className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2/70 px-3 py-1.5 text-xs text-muted-foreground">
            <FileStack className="h-3.5 w-3.5" />
            منشور مُرفق
          </span>
        )}
        {message.attachmentUrl &&
          (message.attachmentType === 'image' ? (
            <ViewablePhoto src={cldOptimize(message.attachmentUrl, { width: 1600 })} alt="" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cldOptimize(message.attachmentUrl, { width: 800 })}
                alt=""
                className="max-h-48 max-w-full rounded-xl border border-border object-cover"
              />
            </ViewablePhoto>
          ) : (
            <a
              href={message.attachmentUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2/70 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Paperclip className="h-3.5 w-3.5" />
              ملف مرفق
            </a>
          ))}
        {isStub && (
          <span className="flex items-center gap-1 px-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            المساعد الذكي غير مُفعّل بعد على الخادم
          </span>
        )}
        <div
          className={cn(
            'relative min-w-0 max-w-full animate-bubble-in break-words [overflow-wrap:anywhere] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
            // The assistant path renders Markdown, which controls its own spacing -- `pre-wrap`
            // there would double every blank line. The user path is plain text and needs it.
            isUser
              ? cn(
                  'whitespace-pre-wrap rounded-bl-md bg-gradient-accent text-white shadow-soft',
                  failed && 'opacity-60 ring-2 ring-danger/60',
                )
              : isStub
                ? 'rounded-br-md border border-amber-500/30 border-s-2 border-s-amber-500/60 bg-amber-500/10 text-foreground backdrop-blur-sm'
                : 'rounded-br-md border border-s-2 border-border border-s-accent/50 bg-surface-2/60 text-foreground backdrop-blur-sm',
          )}
        >
          {isUser ? (
            displayText
          ) : (
            <>
              <AiMarkdown text={displayText} />
              {revealing && <span className="ms-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-accent align-middle" />}
            </>
          )}

          {!isUser && !revealing && (
            <button
              type="button"
              onClick={handleCopy}
              title="نسخ"
              className="absolute -top-3 end-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground opacity-0 shadow-soft transition-all group-hover/msg:opacity-100 hover:text-foreground active:scale-90"
            >
              {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>

        {!!message.sources?.length && (
          <div className="flex flex-wrap gap-1 px-1">
            {message.sources.map((source, i) => (
              <span
                key={i}
                className="rounded-full border border-border bg-surface-2/70 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {source.label}
              </span>
            ))}
          </div>
        )}

        {!!message.actions?.length && (
          <div className="flex flex-wrap gap-1 px-1">
            {message.actions.map((action, i) => (
              <span
                key={i}
                className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] text-accent"
              >
                {action}
              </span>
            ))}
          </div>
        )}

        {failed ? (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1 px-1 text-[11px] font-medium text-danger transition-colors hover:text-danger/80"
          >
            <AlertCircle className="h-3 w-3" />
            تعذّر الإرسال · إعادة المحاولة
            <RefreshCw className="h-3 w-3" />
          </button>
        ) : (
          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] text-muted-foreground">{timeAgo(message.createdAt)}</span>
            {canRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                title="إعادة توليد الرد"
                className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-accent"
              >
                <RefreshCw className="h-3 w-3" />
                إعادة التوليد
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
