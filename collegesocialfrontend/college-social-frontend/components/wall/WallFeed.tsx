'use client';

import { useEffect, useState } from 'react';
import { Flag, Heart, MessageCircle, MessagesSquare, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn, timeAgo } from '@/lib/utils';
import type { WallComment, WallPost } from '@/lib/types';

const PAGE = 20;
const MAX = 600;
const COMMENT_MAX = 400;
type Sort = 'new' | 'top';

// Deterministic anonymous identity from the 8-hex authorHash -- same author, same face + colour
// everywhere, with no way back to a name.
const FACES = ['🦊', '🦉', '🐼', '🐧', '🐢', '🦁', '🐙', '🦄', '🐝', '🦋', '🐬', '🦔', '🐨', '🦅', '🐳', '🦩'];
const RINGS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
];
function identity(hash: string) {
  const n = parseInt(hash.slice(0, 6) || '0', 16) || 0;
  return { face: FACES[n % FACES.length], ring: RINGS[n % RINGS.length] };
}

export function WallFeed() {
  const { showToast } = useToast();
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [sort, setSort] = useState<Sort>('new');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    api
      .get<WallPost[]>(`/wall?page=1&limit=${PAGE}&sort=${sort}`)
      .then((data) => {
        setPosts(data);
        setHasMore(data.length === PAGE);
      })
      .catch(() => showToast('تعذّر تحميل الجدار', 'error'))
      .finally(() => setLoading(false));
  }, [sort, showToast]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await api.get<WallPost[]>(`/wall?page=${next}&limit=${PAGE}&sort=${sort}`);
      setPosts((p) => [...p, ...data]);
      setPage(next);
      setHasMore(data.length === PAGE);
    } finally {
      setLoadingMore(false);
    }
  }

  const patch = (id: string, fields: Partial<WallPost>) =>
    setPosts((p) => p.map((x) => (x._id === id ? { ...x, ...fields } : x)));

  async function submit() {
    const text = body.trim();
    if (text.length < 2 || posting) return;
    setPosting(true);
    try {
      const created = await api.post<WallPost>('/wall', { body: text });
      setPosts((p) => [created, ...p]);
      setBody('');
      showToast('نُشر على الجدار', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر النشر', 'error');
    } finally {
      setPosting(false);
    }
  }

  async function toggleLike(post: WallPost) {
    patch(post._id, { liked: !post.liked, likeCount: post.likeCount + (post.liked ? -1 : 1) });
    try {
      const res = await api.post<{ liked: boolean; likeCount: number }>(`/wall/${post._id}/like`);
      patch(post._id, res);
    } catch {
      patch(post._id, { liked: post.liked, likeCount: post.likeCount });
    }
  }

  async function report(id: string) {
    if (!confirm('الإبلاغ عن هذا المنشور كمخالف؟')) return;
    try {
      const res = await api.post<{ reported: true; hidden: boolean }>(`/wall/${id}/report`);
      if (res.hidden) setPosts((p) => p.filter((x) => x._id !== id));
      showToast(res.hidden ? 'تم إخفاء المنشور بعد بلاغات كافية' : 'تم إرسال البلاغ، شكرًا', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إرسال البلاغ', 'error');
    }
  }

  async function remove(id: string) {
    if (!confirm('حذف هذا المنشور؟')) return;
    const before = posts;
    setPosts((p) => p.filter((x) => x._id !== id));
    try {
      await api.delete(`/wall/${id}`);
    } catch (err) {
      setPosts(before);
      showToast(err instanceof ApiError ? err.message : 'تعذّر الحذف', 'error');
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <MessagesSquare className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">الجدار</h1>
          <p className="text-xs text-muted-foreground">منشورات مجهولة داخل كليتك — كن لطيفًا، كل منشور يُراجَع آليًا.</p>
        </div>
      </div>

      {/* Composer */}
      <Card className="p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX))}
          rows={3}
          placeholder="اكتب شيئًا… لن يظهر اسمك."
          className="w-full resize-none rounded-xl bg-surface-2/50 px-3 py-2.5 text-sm text-foreground outline-none ring-1 ring-inset ring-transparent placeholder:text-muted-foreground focus:bg-surface focus:ring-accent/30"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className={cn('text-[11px]', body.length > MAX - 40 ? 'text-warning' : 'text-muted-foreground')}>
            <bdi dir="ltr">{body.length}/{MAX}</bdi>
          </span>
          <Button size="sm" onClick={submit} disabled={body.trim().length < 2} loading={posting}>
            <Send className="h-3.5 w-3.5" />
            نشر
          </Button>
        </div>
      </Card>

      <Segmented
        options={[
          { value: 'new', label: 'الأحدث' },
          { value: 'top', label: 'الأكثر إعجابًا' },
        ]}
        value={sort}
        onChange={setSort}
        size="sm"
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="الجدار فارغ" description="كن أول من يكتب شيئًا." />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <WallPostCard
              key={post._id}
              post={post}
              onLike={() => toggleLike(post)}
              onReport={() => report(post._id)}
              onRemove={() => remove(post._id)}
              onCommentCount={(n) => patch(post._id, { commentCount: n })}
            />
          ))}

          {hasMore && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" loading={loadingMore} onClick={loadMore}>
                عرض المزيد
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WallPostCard({
  post,
  onLike,
  onReport,
  onRemove,
  onCommentCount,
}: {
  post: WallPost;
  onLike: () => void;
  onReport: () => void;
  onRemove: () => void;
  onCommentCount: (n: number) => void;
}) {
  const { showToast } = useToast();
  const { face, ring } = identity(post.authorHash);

  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<WallComment[] | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  async function toggleThread() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) {
      setLoadingComments(true);
      try {
        setComments(await api.get<WallComment[]>(`/wall/${post._id}/comments`));
      } catch {
        setComments([]);
      } finally {
        setLoadingComments(false);
      }
    }
  }

  async function sendComment() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const c = await api.post<WallComment>(`/wall/${post._id}/comments`, { body: text });
      setComments((list) => [...(list ?? []), c]);
      setDraft('');
      onCommentCount(post.commentCount + 1);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إرسال التعليق', 'error');
    } finally {
      setSending(false);
    }
  }

  async function deleteComment(id: string) {
    const before = comments;
    setComments((list) => (list ?? []).filter((c) => c._id !== id));
    onCommentCount(Math.max(0, post.commentCount - 1));
    try {
      await api.delete(`/wall/comments/${id}`);
    } catch {
      setComments(before);
      onCommentCount(post.commentCount);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base', ring)}>
          {face}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{post.mine ? 'أنت (مجهول)' : 'طالب مجهول'}</span>
            <span>{timeAgo(post.createdAt)}</span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground text-pretty">{post.body}</p>

          <div className="mt-2.5 flex items-center gap-3">
            <button
              type="button"
              onClick={onLike}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors',
                post.liked ? 'bg-danger/10 text-danger' : 'text-muted-foreground hover:bg-surface-2',
              )}
            >
              <Heart className={cn('h-3.5 w-3.5', post.liked && 'fill-current')} />
              {post.likeCount > 0 && post.likeCount}
            </button>

            <button
              type="button"
              onClick={toggleThread}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors',
                open ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-surface-2',
              )}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {post.commentCount > 0 ? post.commentCount : 'تعليق'}
            </button>

            {post.mine ? (
              <button
                type="button"
                onClick={onRemove}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
                حذف
              </button>
            ) : (
              <button
                type="button"
                onClick={onReport}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-warning/10 hover:text-warning"
              >
                <Flag className="h-3.5 w-3.5" />
                إبلاغ
              </button>
            )}
          </div>

          {open && (
            <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
              {loadingComments ? (
                <div className="flex justify-center py-3">
                  <Spinner className="h-4 w-4" />
                </div>
              ) : (
                (comments ?? []).map((c) => {
                  const ci = identity(c.authorHash);
                  return (
                    <div key={c._id} className="flex items-start gap-2">
                      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs', ci.ring)}>
                        {ci.face}
                      </span>
                      <div className="min-w-0 flex-1 rounded-xl bg-surface-2/50 px-2.5 py-1.5">
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{c.body}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{timeAgo(c.createdAt)}</span>
                          {c.mine && (
                            <button type="button" onClick={() => deleteComment(c._id)} className="hover:text-danger">
                              حذف
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {!loadingComments && (comments ?? []).length === 0 && (
                <p className="py-1 text-center text-xs text-muted-foreground">لا تعليقات بعد.</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, COMMENT_MAX))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendComment();
                    }
                  }}
                  placeholder="أضف تعليقًا…"
                  className="h-9 min-w-0 flex-1 rounded-full bg-surface-2/60 px-3 text-xs text-foreground outline-none ring-1 ring-inset ring-transparent placeholder:text-muted-foreground focus:ring-accent/30"
                />
                <Button size="xs" onClick={sendComment} disabled={!draft.trim()} loading={sending}>
                  إرسال
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
