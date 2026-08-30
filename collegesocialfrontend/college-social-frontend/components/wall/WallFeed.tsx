'use client';

import { useEffect, useState } from 'react';
import { Flag, Heart, MessagesSquare, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn, timeAgo } from '@/lib/utils';
import type { WallPost } from '@/lib/types';

const PAGE = 20;
const MAX = 600;
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

  async function submit() {
    const text = body.trim();
    if (text.length < 2 || posting) return;
    setPosting(true);
    try {
      const created = await api.post<WallPost>('/wall', { body: text });
      setPosts((p) => (sort === 'new' ? [created, ...p] : [created, ...p]));
      setBody('');
      showToast('نُشر على الجدار', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر النشر', 'error');
    } finally {
      setPosting(false);
    }
  }

  async function toggleLike(post: WallPost) {
    // optimistic
    setPosts((p) =>
      p.map((x) =>
        x._id === post._id
          ? { ...x, liked: !x.liked, likeCount: x.likeCount + (x.liked ? -1 : 1) }
          : x,
      ),
    );
    try {
      const res = await api.post<{ liked: boolean; likeCount: number }>(`/wall/${post._id}/like`);
      setPosts((p) => p.map((x) => (x._id === post._id ? { ...x, ...res } : x)));
    } catch {
      setPosts((p) =>
        p.map((x) =>
          x._id === post._id
            ? { ...x, liked: post.liked, likeCount: post.likeCount }
            : x,
        ),
      );
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
          {posts.map((post) => {
            const { face, ring } = identity(post.authorHash);
            return (
              <Card key={post._id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base', ring)}>
                    {face}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {post.mine ? 'أنت (مجهول)' : 'طالب مجهول'}
                      </span>
                      <span>{timeAgo(post.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground text-pretty">
                      {post.body}
                    </p>
                    <div className="mt-2.5 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleLike(post)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors',
                          post.liked ? 'bg-danger/10 text-danger' : 'text-muted-foreground hover:bg-surface-2',
                        )}
                      >
                        <Heart className={cn('h-3.5 w-3.5', post.liked && 'fill-current')} />
                        {post.likeCount > 0 && post.likeCount}
                      </button>
                      {post.mine ? (
                        <button
                          type="button"
                          onClick={() => remove(post._id)}
                          className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          حذف
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => report(post._id)}
                          className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-warning/10 hover:text-warning"
                        >
                          <Flag className="h-3.5 w-3.5" />
                          إبلاغ
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}

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
