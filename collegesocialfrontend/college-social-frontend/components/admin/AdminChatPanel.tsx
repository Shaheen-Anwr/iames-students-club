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
import { timeAgo } from '@/lib/utils';
import type { AdminConversationSummary, PaginatedAdminConversations } from '@/lib/types';

const LIMIT = 20;

// Deliberately metadata-only -- no message content is ever fetched or shown here. See
// ChatService's admin section on the backend for why.
export function AdminChatPanel() {
  const { showToast } = useToast();

  const [conversations, setConversations] = useState<AdminConversationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminConversationSummary | null>(null);

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
      .get<PaginatedAdminConversations>(`/admin/chat/conversations?${query.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setConversations(res.data);
        setTotal(res.total);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch]);

  async function handleDelete(target: AdminConversationSummary) {
    setBusyId(target._id);
    try {
      await api.delete(`/admin/chat/conversations/${target._id}`);
      setConversations((prev) => prev.filter((c) => c._id !== target._id));
      setTotal((prev) => prev - 1);
      showToast('تم حذف المحادثة.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف المحادثة.', 'error');
    } finally {
      setBusyId(null);
      setPendingDelete(null);
    }
  }

  function conversationLabel(c: AdminConversationSummary): string {
    if (c.isGroup) return c.name || 'مجموعة بدون اسم';
    return c.participants.map((p) => p?.name ?? 'مستخدم محذوف').join('، ');
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
        ) : conversations.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">لا توجد محادثات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-start text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">المحادثة</th>
                  <th className="px-4 py-3 font-medium">النوع</th>
                  <th className="px-4 py-3 font-medium">آخر نشاط</th>
                  <th className="px-4 py-3 font-medium text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((c) => {
                  const isBusy = busyId === c._id;
                  return (
                    <tr key={c._id} className="border-b border-border last:border-0">
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate font-medium text-foreground">{conversationLabel(c)}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.isGroup ? (
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {c.participants.length} أعضاء
                          </span>
                        ) : (
                          'محادثة فردية'
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.lastMessageAt ? timeAgo(c.lastMessageAt) : timeAgo(c.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="حذف المحادثة"
                            disabled={isBusy}
                            onClick={() => setPendingDelete(c)}
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
            صفحة {page} من {totalPages} &middot; {total} محادثة
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
        title="حذف المحادثة"
        message="سيتم حذف رسائلها أيضًا ولا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        loading={pendingDelete !== null && busyId === pendingDelete._id}
      />
    </div>
  );
}
