'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, Search, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { assetUrl, timeAgo } from '@/lib/utils';
import type { PaginatedQuestions, Question } from '@/lib/types';

const LIMIT = 20;

export function AdminQaPanel() {
  const { showToast } = useToast();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Question | null>(null);

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
      .get<PaginatedQuestions>(`/admin/qa/questions?${query.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setQuestions(res.data);
        setTotal(res.total);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch]);

  async function handleDelete(target: Question) {
    setBusyId(target._id);
    try {
      await api.delete(`/admin/qa/questions/${target._id}`);
      setQuestions((prev) => prev.filter((q) => q._id !== target._id));
      setTotal((prev) => prev - 1);
      showToast('تم حذف السؤال.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف السؤال.', 'error');
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
          placeholder="ابحث بعنوان السؤال أو رمز المقرر"
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
        ) : questions.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">لا توجد أسئلة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-start text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">الكاتب</th>
                  <th className="px-4 py-3 font-medium">السؤال</th>
                  <th className="px-4 py-3 font-medium">الإجابات</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                  <th className="px-4 py-3 font-medium text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => {
                  const isBusy = busyId === q._id;
                  return (
                    <tr key={q._id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={assetUrl(q.author?.photoUrl)} name={q.author?.name ?? '؟'} size="sm" />
                          <p className="truncate font-medium text-foreground">{q.author?.name ?? 'مستخدم محذوف'}</p>
                        </div>
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate text-foreground">{q.title}</p>
                        {q.courseCode && <p className="truncate text-xs text-muted-foreground">{q.courseCode}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-3.5 w-3.5" />
                          {q.answerCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{timeAgo(q.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="حذف السؤال"
                            disabled={isBusy}
                            onClick={() => setPendingDelete(q)}
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
            صفحة {page} من {totalPages} &middot; {total} سؤالًا
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
        title="حذف السؤال"
        message="سيتم حذف إجاباته أيضًا ولا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        loading={pendingDelete !== null && busyId === pendingDelete._id}
      />
    </div>
  );
}
