'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Search, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { Assignment, PaginatedAssignments } from '@/lib/types';

const LIMIT = 20;

export function AdminAssignmentsPanel() {
  const { showToast } = useToast();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Assignment | null>(null);

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
      .get<PaginatedAssignments>(`/admin/assignments?${query.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setAssignments(res.data);
        setTotal(res.total);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch]);

  async function handleDelete(target: Assignment) {
    setBusyId(target._id);
    try {
      await api.delete(`/admin/assignments/${target._id}`);
      setAssignments((prev) => prev.filter((a) => a._id !== target._id));
      setTotal((prev) => prev - 1);
      showToast('تم حذف الواجب.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف الواجب.', 'error');
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
          placeholder="ابحث بعنوان الواجب أو رمز المقرر"
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
        ) : assignments.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">لا توجد واجبات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-start text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">المُنشئ</th>
                  <th className="px-4 py-3 font-medium">الواجب</th>
                  <th className="px-4 py-3 font-medium">الاستحقاق</th>
                  <th className="px-4 py-3 font-medium">الإنجاز</th>
                  <th className="px-4 py-3 font-medium text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const isBusy = busyId === a._id;
                  const overdue = new Date(a.dueDate) < new Date();
                  return (
                    <tr key={a._id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={assetUrl(a.createdBy?.photoUrl)} name={a.createdBy?.name ?? '؟'} size="sm" />
                          <p className="truncate font-medium text-foreground">{a.createdBy?.name ?? 'مستخدم محذوف'}</p>
                        </div>
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate text-foreground">{a.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.courseCode}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-sm', overdue ? 'text-danger' : 'text-muted-foreground')}>
                          {new Date(a.dueDate).toLocaleDateString('ar-EG')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {a.completedBy.length}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="حذف الواجب"
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
            صفحة {page} من {totalPages} &middot; {total} واجبًا
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
        title="حذف الواجب"
        message="لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        loading={pendingDelete !== null && busyId === pendingDelete._id}
      />
    </div>
  );
}
