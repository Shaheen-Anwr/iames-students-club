'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Copy, MessageSquarePlus, RefreshCw, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { aiErrorMessage, chatApi } from '@/lib/chat-api';
import { useToast } from '@/lib/toast-context';
import type { ChatSummary } from '@/lib/types';

type Scope = 'unread' | 'recent';

// Summaries already generated this session, per conversation + scope + newest message: reopening
// the sheet with nothing new is instant and doesn't spend another AI call.
const summaryCache = new Map<string, ChatSummary>();

// "Catch me up" -- an on-demand AI digest of what you missed (or of the recent conversation):
// one-line gist, key points, and the to-dos / dates / decisions buried in the thread.
export function AiSummaryModal({
  open,
  onClose,
  conversationId,
  firstUnreadId,
  unreadCount,
  lastMessageId,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  /** First unread message at open -- enables the "unread only" scope. */
  firstUnreadId: string | null;
  unreadCount: number;
  /** Newest message in the thread -- part of the cache key, so a new message invalidates it. */
  lastMessageId: string | null;
  /** Put the summary into the composer (e.g. to share it with the group). */
  onInsert?: (text: string) => void;
}) {
  const { showToast } = useToast();
  const [scope, setScope] = useState<Scope>(firstUnreadId ? 'unread' : 'recent');
  const [summary, setSummary] = useState<ChatSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (which: Scope, { force = false }: { force?: boolean } = {}) => {
      const key = `${conversationId}|${which}|${which === 'unread' ? firstUnreadId : ''}|${lastMessageId ?? ''}`;
      const cached = summaryCache.get(key);
      if (cached && !force) {
        setError(null);
        setLoading(false);
        setSummary(cached);
        return;
      }
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      setSummary(null);
      try {
        const result = await chatApi.ai.summary(conversationId, which === 'unread' ? firstUnreadId : null);
        if (id !== requestId.current) return; // a newer request (scope switch) superseded this one
        summaryCache.set(key, result);
        setSummary(result);
      } catch (err) {
        if (id === requestId.current) setError(aiErrorMessage(err, 'تعذّر إنشاء الملخص، حاول مجددًا.'));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [conversationId, firstUnreadId, lastMessageId],
  );

  useEffect(() => {
    if (!open) return;
    const initial: Scope = firstUnreadId ? 'unread' : 'recent';
    setScope(initial);
    void load(initial);
    // Re-run only when the sheet opens; scope switches call load() directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const asText = (s: ChatSummary) =>
    [
      `✨ ${s.headline}`,
      '',
      ...s.bullets.map((b) => `• ${b}`),
      ...(s.actionItems.length ? ['', 'للمتابعة:', ...s.actionItems.map((a) => `☐ ${a}`)] : []),
    ].join('\n');

  function copy() {
    if (!summary) return;
    void navigator.clipboard
      ?.writeText(asText(summary))
      .then(() => showToast('تم نسخ الملخص.'))
      .catch(() => showToast('تعذّر النسخ.', 'error'));
  }

  return (
    <Modal open={open} onClose={onClose} title="ملخص ذكي" className="max-w-lg">
      <div className="space-y-4">
        {firstUnreadId && (
          <Segmented<Scope>
            fullWidth
            size="sm"
            value={scope}
            onChange={(v) => {
              setScope(v);
              void load(v);
            }}
            options={[
              { value: 'unread', label: `غير المقروءة (${unreadCount})` },
              { value: 'recent', label: 'آخر الرسائل' },
            ]}
          />
        )}

        <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-surface p-4">
          {/* Aurora wash -- the app's AI surface language. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60">
            <div className="absolute -start-10 -top-16 h-40 w-40 animate-aurora-1 rounded-full bg-accent/25 blur-3xl" />
            <div className="absolute -bottom-16 -end-10 h-40 w-40 animate-aurora-2 rounded-full bg-accent-2/20 blur-3xl" />
          </div>

          <div className="relative">
            {loading ? (
              <div className="space-y-3 py-1">
                <p className="flex items-center gap-2 bg-[linear-gradient(90deg,rgb(var(--muted-foreground)),rgb(var(--accent)),rgb(var(--muted-foreground)))] bg-[length:200%_100%] bg-clip-text text-sm font-medium text-transparent animate-shimmer">
                  <Sparkles className="h-4 w-4 text-accent" /> يقرأ المحادثة ويلخّصها…
                </p>
                {[92, 78, 85, 60].map((w, i) => (
                  <div key={i} className="h-3 animate-pulse rounded-full bg-surface-3" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : error ? (
              <div className="space-y-3 py-2 text-center">
                <p className="text-sm text-danger">{error}</p>
                <Button size="sm" variant="subtle" onClick={() => void load(scope)}>
                  <RefreshCw className="h-3.5 w-3.5" /> إعادة المحاولة
                </Button>
              </div>
            ) : summary ? (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <p className="flex items-start gap-2 text-[15px] font-bold leading-relaxed text-foreground">
                  <Sparkles className="mt-1 h-4 w-4 shrink-0 text-accent" />
                  <span dir="auto">{summary.headline}</span>
                </p>
                {summary.bullets.length > 0 && (
                  <ul className="space-y-1.5 ps-1">
                    {summary.bullets.map((b, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 * i }}
                        className="flex gap-2 text-sm leading-relaxed text-foreground/90"
                      >
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <span dir="auto">{b}</span>
                      </motion.li>
                    ))}
                  </ul>
                )}
                {summary.actionItems.length > 0 && (
                  <div className="rounded-xl bg-accent/[0.06] p-3">
                    <p className="mb-1.5 text-xs font-semibold text-accent">للمتابعة</p>
                    <ul className="space-y-1.5">
                      {summary.actionItems.map((a, i) => (
                        <li key={i} className="flex gap-2 text-sm text-foreground">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                          <span dir="auto">{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {summary ? `يغطي ${summary.count} رسالة · ` : ''}مولّد بالذكاء الاصطناعي وقد يخطئ. تُرسل نصوص الرسائل إلى خدمة الذكاء الاصطناعي لإنشائه.
          </p>
          {summary && (
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" onClick={copy} aria-label="نسخ الملخص" title="نسخ الملخص">
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => void load(scope, { force: true })}
                aria-label="إعادة التوليد"
                title="إعادة التوليد"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        {summary && onInsert && summary.count > 0 && (
          <Button
            variant="subtle"
            fullWidth
            onClick={() => {
              onInsert(asText(summary));
              onClose();
            }}
          >
            <MessageSquarePlus className="h-4 w-4" /> إدراج الملخص في رسالة
          </Button>
        )}
      </div>
    </Modal>
  );
}
