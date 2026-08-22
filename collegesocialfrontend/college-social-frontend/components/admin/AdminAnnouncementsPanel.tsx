'use client';

import { useEffect, useState } from 'react';
import { Pin, Search, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { assetUrl, timeAgo } from '@/lib/utils';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import type { Announcement, PaginatedAnnouncements } from '@/lib/types';

const LIMIT = 20;

export function AdminAnnouncementsPanel() {
  const { showToast } = useToast();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Announcement | null>(null);

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
      .get<PaginatedAnnouncements>(`/admin/announcements?${query.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setAnnouncements(res.data);
        setTotal(res.total);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch]);

  async function handleDelete(target: Announcement) {
    setBusyId(target._id);
    try {
      await api.delete(`/admin/announcements/${target._id}`);
      setAnnouncements((prev) => prev.filter((a) => a._id !== target._id));
      setTotal((prev) => prev - 1);
      showToast('تم حذف الإعلان.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف الإعلان.', 'error');
    } finally {
      setBusyId(null);
      setPendingDelete(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ابحث بعنوان الإعلان"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : announcements.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">لا توجد إعلانات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-start text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">الكاتب</th>
                  <th className="px-4 py-3 font-medium">الإعلان</th>
                  <th className="px-4 py-3 font-medium">النطاق</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                  <th className="px-4 py-3 font-medium text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map((a) => {
                  const isBusy = busyId === a._id;
                  return (
                    <tr key={a._id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={assetUrl(a.author?.photoUrl)} name={a.author?.name ?? '؟'} size="sm" />
                          <p className="truncate font-medium text-foreground">{a.author?.name ?? 'مستخدم محذوف'}</p>
                        </div>
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <p className="flex items-center gap-1 truncate text-foreground">
                          {a.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-accent" />}
                          {a.title}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.department ? DEPARTMENT_LABELS[a.department] : 'كل المنصة'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{timeAgo(a.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="حذف الإعلان"
                            disabled={isBusy}
                            onClick={() => setPendingDelete(a)}
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
            صفحة {page} من {totalPages} &middot; {total} إعلانًا
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
        title="حذف الإعلان"
        message="لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        loading={pendingDelete !== null && busyId === pendingDelete._id}
      />
    </div>
  );
}
