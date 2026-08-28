'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Heart, Send, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { ReelComment } from '@/lib/types';

interface Props {
  reelId: string | null;
  onClose: () => void;
  onCountChange: (delta: number) => void;
}

export function ReelCommentsSheet({ reelId, onClose, onCountChange }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!reelId || loadedFor.current === reelId) return;
    loadedFor.current = reelId;
    setLoading(true);
    setComments([]);
    api
      .get<ReelComment[]>(`/reels/${reelId}/comments?limit=50`)
      .then(setComments)
      .catch(() => showToast('تعذّر تحميل التعليقات.', 'error'))
      .finally(() => setLoading(false));
  }, [reelId, showToast]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reelId || !text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const created = await api.post<ReelComment>(`/reels/${reelId}/comments`, { text: text.trim() });
      setComments((prev) => [created, ...prev]);
      onCountChange(1);
      setText('');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إضافة التعليق.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleLike(c: ReelComment) {
    setComments((prev) =>
      prev.map((x) =>
        x.id === c.id
          ? { ...x, likedByMe: !x.likedByMe, likeCount: x.likeCount + (x.likedByMe ? -1 : 1) }
          : x,
      ),
    );
    try {
      await api.post(`/reels/comments/${c.id}/like`);
    } catch {
      // revert
      setComments((prev) =>
        prev.map((x) =>
          x.id === c.id
            ? { ...x, likedByMe: c.likedByMe, likeCount: c.likeCount }
            : x,
        ),
      );
    }
  }

  async function remove(c: ReelComment) {
    const removed = 1 + c.replyCount;
    setComments((prev) => prev.filter((x) => x.id !== c.id));
    onCountChange(-removed);
    try {
      await api.delete(`/reels/comments/${c.id}`);
    } catch {
      showToast('تعذّر حذف التعليق.', 'error');
    }
  }

  return (
    <Sheet open={!!reelId} onOpenChange={(o) => !o && onClose()} title="التعليقات" className="h-[75vh]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pe-1 scrollbar-thin">
          {loading ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <Skeleton className="h-12 flex-1 rounded-2xl" />
              </div>
            ))
          ) : comments.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">لا توجد تعليقات بعد. كن أول من يعلّق.</p>
          ) : (
            comments.map((c) => {
              const mine = !!user && (user._id === c.author?.id || user.role === 'admin');
              return (
                <div key={c.id} className="flex gap-3">
                  <Link href={c.author ? `/profile/${c.author.id}` : '#'} className="shrink-0">
                    <Avatar src={assetUrl(c.author?.photoUrl)} name={c.author?.name ?? 'مستخدم'} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="rounded-2xl bg-surface-2 px-3 py-2">
                      <p className="text-xs font-semibold text-foreground">{c.author?.name ?? 'مستخدم'}</p>
                      <p className="whitespace-pre-wrap break-words text-sm text-foreground">{c.text}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-4 ps-2 text-[11px] text-muted-foreground">
                      <span>{timeAgo(c.createdAt)}</span>
                      <button
                        onClick={() => toggleLike(c)}
                        className={cn('flex items-center gap-1', c.likedByMe && 'text-rose-500')}
                      >
                        <Heart className={cn('h-3.5 w-3.5', c.likedByMe && 'fill-rose-500')} />
                        {c.likeCount > 0 && c.likeCount}
                      </button>
                      {mine && (
                        <button onClick={() => remove(c)} className="flex items-center gap-1 hover:text-rose-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={submit} className="mt-3 flex items-end gap-2 border-t border-border pt-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="أضف تعليقًا…"
            rows={1}
            className="max-h-28 min-h-[40px] flex-1 resize-none rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(e as unknown as React.FormEvent);
              }
            }}
          />
          <button
            type="submit"
            disabled={!text.trim() || submitting}
            aria-label="إرسال"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </Sheet>
  );
}
