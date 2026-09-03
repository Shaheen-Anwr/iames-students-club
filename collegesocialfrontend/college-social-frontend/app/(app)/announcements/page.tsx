'use client';

import { useEffect, useState } from 'react';
import { Megaphone, Pin, Plus, ThumbsUp, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { Announcement } from '@/lib/types';
import { CreateAnnouncementModal } from '@/components/announcements/CreateAnnouncementModal';

const PAGE_SIZE = 20;

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const canPost = user?.role === 'professor' || user?.role === 'admin';

  useEffect(() => {
    api
      .get<Announcement[]>(`/announcements?page=1&limit=${PAGE_SIZE}`)
      .then((data) => {
        setAnnouncements(data);
        setHasMore(data.length === PAGE_SIZE);
      })
      .finally(() => setLoading(false));
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    const nextPage = page + 1;
    const data = await api.get<Announcement[]>(`/announcements?page=${nextPage}&limit=${PAGE_SIZE}`);
    setAnnouncements((prev) => [...prev, ...data]);
    setPage(nextPage);
    setHasMore(data.length === PAGE_SIZE);
    setLoadingMore(false);
  }

  function handleCreated(announcement: Announcement) {
    setAnnouncements((prev) => [announcement, ...prev]);
  }

  async function toggleLike(id: string) {
    const me = user?._id;
    if (!me) return;
    setAnnouncements((prev) =>
      prev.map((a) => {
        if (a._id !== id) return a;
        const likes = a.likes ?? [];
        return { ...a, likes: likes.includes(me) ? likes.filter((u) => u !== me) : [...likes, me] };
      }),
    );
    try {
      await api.post(`/announcements/${id}/like`);
    } catch {
      // revert on failure
      setAnnouncements((prev) =>
        prev.map((a) => {
          if (a._id !== id) return a;
          const likes = a.likes ?? [];
          return { ...a, likes: likes.includes(me) ? likes.filter((u) => u !== me) : [...likes, me] };
        }),
      );
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('هل تريد حذف هذا الإعلان؟')) return;
    try {
      await api.delete(`/announcements/${id}`);
      setAnnouncements((prev) => prev.filter((a) => a._id !== id));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف الإعلان', 'error');
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">الإعلانات</h1>
        {canPost && (
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            نشر إعلان
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <Megaphone className="h-8 w-8" />
          <p className="text-sm">لا توجد إعلانات بعد.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const canDelete = user?.role === 'admin' || a.author?._id === user?._id;
            return (
              <Card key={a._id} className="p-4">
                <div className="flex items-start gap-2">
                  {a.pinned && <Pin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{a.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Avatar src={assetUrl(a.author?.photoUrl)} name={a.author?.name ?? '؟'} size="xs" />
                      <p className="text-xs text-muted-foreground">
                        {a.author?.name ?? 'مستخدم محذوف'} · {timeAgo(a.createdAt)}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleLike(a._id)}
                        className={cn(
                          'ms-auto flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors',
                          (a.likes ?? []).includes(user?._id ?? '')
                            ? 'bg-accent/10 text-accent'
                            : 'text-muted-foreground hover:bg-surface-2',
                        )}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        {(a.likes?.length ?? 0) > 0 && a.likes!.length}
                      </button>
                    </div>
                  </div>
                  {canDelete && (
                    <button onClick={() => handleDelete(a._id)} className="shrink-0 text-muted-foreground hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" loading={loadingMore} onClick={loadMore}>
                عرض المزيد
              </Button>
            </div>
          )}
        </div>
      )}

      <CreateAnnouncementModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
    </div>
  );
}
