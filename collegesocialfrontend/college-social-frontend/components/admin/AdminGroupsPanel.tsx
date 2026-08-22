'use client';

import { useEffect, useState } from 'react';
import { Search, Trash2, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn, timeAgo } from '@/lib/utils';
import type { PaginatedGroups, StudyGroup } from '@/lib/types';

const LIMIT = 20;

export function AdminGroupsPanel() {
  const { showToast } = useToast();

  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StudyGroup | null>(null);

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
      .get<PaginatedGroups>(`/admin/groups?${query.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setGroups(res.data);
        setTotal(res.total);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch]);

  async function handleDelete(target: StudyGroup) {
    setBusyId(target._id);
    try {
      await api.delete(`/admin/groups/${target._id}`);
      setGroups((prev) => prev.filter((g) => g._id !== target._id));
      setTotal((prev) => prev - 1);
      showToast('تم حذف المجموعة.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف المجموعة.', 'error');
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
          placeholder="ابحث باسم المجموعة"
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
        ) : groups.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">لا توجد مجموعات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-start text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">المجموعة</th>
                  <th className="px-4 py-3 font-medium">النوع</th>
                  <th className="px-4 py-3 font-medium">الأعضاء</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                  <th className="px-4 py-3 font-medium text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const isBusy = busyId === g._id;
                  return (
                    <tr key={g._id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <p className="truncate font-medium text-foreground">{g.name}</p>
                        {g.description && <p className="truncate text-xs text-muted-foreground">{g.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                            g.visibility === 'public' ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted-foreground',
                          )}
                        >
                          {g.visibility === 'public' ? 'عامة' : 'خاصة'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {g.members.length}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{timeAgo(g.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="حذف المجموعة"
                            disabled={isBusy}
                            onClick={() => setPendingDelete(g)}
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
            صفحة {page} من {totalPages} &middot; {total} مجموعة
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
        title="حذف المجموعة"
        message="سيتم حذف قنواتها ورسائلها أيضًا ولا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        loading={pendingDelete !== null && busyId === pendingDelete._id}
      />
    </div>
  );
}
