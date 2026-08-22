'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, Search, Sparkles, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { assetUrl, timeAgo } from '@/lib/utils';
import type { PaginatedPosts, Post } from '@/lib/types';

const LIMIT = 20;

export function AdminPostsPanel() {
  const { showToast } = useToast();

  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Post | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (debouncedSearch) query.set('search', debouncedSearch);

    api
      .get<PaginatedPosts>(`/admin/posts?${query.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setPosts(res.data);
        setTotal(res.total);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch]);

  useEffect(() => {
    setSelected(new Set());
  }, [page, debouncedSearch]);

  function toggleSelectAll() {
    setSelected(posts.length > 0 && posts.every((p) => selected.has(p._id)) ? new Set() : new Set(posts.map((p) => p._id)));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((id) => api.delete(`/admin/posts/${id}`)));
      setPosts((prev) => prev.filter((p) => !selected.has(p._id)));
      setTotal((prev) => prev - ids.length);
      showToast(`تم حذف ${ids.length} منشورًا.`);
      setSelected(new Set());
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف المنشورات المحددة.', 'error');
    } finally {
      setBulkBusy(false);
      setBulkDeleteOpen(false);
    }
  }

  async function handleDelete(target: Post) {
    setBusyId(target._id);
    try {
      await api.delete(`/admin/posts/${target._id}`);
      setPosts((prev) => prev.filter((p) => p._id !== target._id));
      setTotal((prev) => prev - 1);
      showToast('تم حذف المنشور.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف المنشور.', 'error');
    } finally {
      setBusyId(null);
      setPendingDelete(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="ابحث بنص المنشور أو رمز المقرر"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-1.5">
            <span className="text-sm font-medium text-foreground">{selected.size} محدد</span>
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف المحددين
            </button>
          </div>
        )}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : posts.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">لا توجد منشورات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-start text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={posts.length > 0 && posts.every((p) => selected.has(p._id))}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-border accent-accent"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">الكاتب</th>
                  <th className="px-4 py-3 font-medium">المحتوى</th>
                  <th className="px-4 py-3 font-medium">التفاعل</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                  <th className="px-4 py-3 font-medium text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => {
                  const isBusy = busyId === p._id;
                  return (
                    <tr key={p._id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(p._id)}
                          onChange={() => toggleSelect(p._id)}
                          className="h-4 w-4 rounded border-border accent-accent"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={assetUrl(p.author?.photoUrl)} name={p.author?.name ?? '؟'} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{p.author?.name ?? 'مستخدم محذوف'}</p>
                            {p.courseCode && <p className="truncate text-xs text-muted-foreground">{p.courseCode}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <p className="line-clamp-2 text-foreground">{p.caption || <span className="text-muted-foreground">(بدون نص)</span>}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5" />
                            {p.reactions.length}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3.5 w-3.5" />
                            {p.commentCount}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{timeAgo(p.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="حذف المنشور"
                            disabled={isBusy}
                            onClick={() => setPendingDelete(p)}
                            className="hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            صفحة {page} من {totalPages} &middot; {total} منشورًا
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              السابق
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              التالي
            </Button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && handleDelete(pendingDelete)}
        title="حذف المنشور"
        message="سيتم حذف تعليقاته أيضًا ولا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        loading={pendingDelete !== null && busyId === pendingDelete._id}
      />

      <ConfirmModal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="حذف المنشورات المحددة"
        message={`سيتم حذف ${selected.size} منشورًا وتعليقاتها. لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        loading={bulkBusy}
      />
    </div>
  );
}
