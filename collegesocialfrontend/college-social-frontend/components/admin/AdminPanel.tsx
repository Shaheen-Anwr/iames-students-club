'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, ChevronDown, KeyRound, MailWarning, Search, Trash2, UserX, UserCheck } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Dropdown } from '@/components/ui/Dropdown';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn } from '@/lib/utils';
import { ROLE_LABELS, type PaginatedUsers, type Role, type User } from '@/lib/types';
import { ResetPasswordModal } from './ResetPasswordModal';

const LIMIT = 20;
const ROLE_OPTIONS: Role[] = ['student', 'professor', 'admin'];

interface AdminPanelProps {
  // Lets AdminOverview's "pending verification" tile deep-link straight into a pre-filtered
  // view; uncontrolled (plain internal state) when the admin opens this tab on its own.
  unverifiedOnly?: boolean;
  onUnverifiedOnlyChange?: (value: boolean) => void;
}

export function AdminPanel({ unverifiedOnly: unverifiedOnlyProp, onUnverifiedOnlyChange }: AdminPanelProps = {}) {
  const { user: currentUser, updateLocalUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [unverifiedOnlyState, setUnverifiedOnlyState] = useState(false);
  const unverifiedOnly = unverifiedOnlyProp ?? unverifiedOnlyState;
  const setUnverifiedOnly = onUnverifiedOnlyChange ?? setUnverifiedOnlyState;
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'activate' | 'deactivate' | 'delete' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Debounce free-typed search input before it drives a request.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  // Any new search term or filter change restarts pagination at page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, unverifiedOnly]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (debouncedSearch) query.set('search', debouncedSearch);
    if (unverifiedOnly) query.set('verified', 'false');

    api
      .get<PaginatedUsers>(`/admin/users?${query.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setUsers(res.data);
        setTotal(res.total);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, unverifiedOnly]);

  useEffect(() => {
    setSelected(new Set());
  }, [page, debouncedSearch, unverifiedOnly]);

  function patchLocal(id: string, patch: Partial<User>) {
    setUsers((prev) => prev.map((u) => (u._id === id ? { ...u, ...patch } : u)));
    if (id === currentUser?._id) updateLocalUser(patch);
  }

  async function handleRoleChange(target: User, role: Role) {
    setBusyId(target._id);
    try {
      const updated = await api.patch<User>(`/admin/users/${target._id}`, { role });
      patchLocal(target._id, updated);
      showToast(`أصبح ${target.name} الآن ${ROLE_LABELS[role]}.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تحديث الدور.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleActive(target: User) {
    const nextActive = !(target.isActive ?? true);
    setBusyId(target._id);
    try {
      const updated = await api.patch<User>(`/admin/users/${target._id}`, { isActive: nextActive });
      patchLocal(target._id, updated);
      showToast(nextActive ? `تمت إعادة تفعيل ${target.name}.` : `تم إيقاف حساب ${target.name}.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تحديث الحساب.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleVerifyEmail(target: User) {
    setBusyId(target._id);
    try {
      const updated = await api.patch<User>(`/admin/users/${target._id}/verify-email`);
      patchLocal(target._id, updated);
      showToast(`تم توثيق بريد ${target.name}.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر توثيق البريد.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(target: User) {
    setBusyId(target._id);
    try {
      await api.delete(`/admin/users/${target._id}`);
      setUsers((prev) => prev.filter((u) => u._id !== target._id));
      setTotal((prev) => prev - 1);
      showToast(`تم حذف حساب ${target.name}.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف المستخدم.', 'error');
    } finally {
      setBusyId(null);
      setPendingDelete(null);
    }
  }

  const selectableUsers = users.filter((u) => u._id !== currentUser?._id);
  const allSelected = selectableUsers.length > 0 && selectableUsers.every((u) => selected.has(u._id));

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(selectableUsers.map((u) => u._id)));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkAction() {
    if (!bulkAction) return;
    const ids = [...selected];
    setBulkBusy(true);
    try {
      if (bulkAction === 'delete') {
        await Promise.all(ids.map((id) => api.delete(`/admin/users/${id}`)));
        setUsers((prev) => prev.filter((u) => !selected.has(u._id)));
        setTotal((prev) => prev - ids.length);
        showToast(`تم حذف ${ids.length} حسابًا.`);
      } else {
        const isActive = bulkAction === 'activate';
        const updated = await Promise.all(ids.map((id) => api.patch<User>(`/admin/users/${id}`, { isActive })));
        setUsers((prev) => prev.map((u) => updated.find((x) => x._id === u._id) ?? u));
        showToast(isActive ? `تمت إعادة تفعيل ${ids.length} حسابًا.` : `تم إيقاف ${ids.length} حسابًا.`);
      }
      setSelected(new Set());
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تنفيذ الإجراء الجماعي.', 'error');
    } finally {
      setBulkBusy(false);
      setBulkAction(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="ابحث بالاسم أو الرقم الجامعي أو البريد الإلكتروني"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <button
          onClick={() => setUnverifiedOnly(!unverifiedOnly)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            unverifiedOnly
              ? 'border-warning/40 bg-warning/10 text-warning'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <MailWarning className="h-3.5 w-3.5" />
          بريد غير موثّق فقط
        </button>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-1.5">
            <span className="text-sm font-medium text-foreground">{selected.size} محدد</span>
            <Dropdown
              trigger={
                <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-accent hover:bg-accent/10">
                  إجراء جماعي
                  <ChevronDown className="h-3.5 w-3.5" />
                </span>
              }
              items={[
                { label: 'تفعيل المحددين', icon: UserCheck, onClick: () => setBulkAction('activate') },
                { label: 'إيقاف المحددين', icon: UserX, onClick: () => setBulkAction('deactivate') },
                { label: 'حذف المحددين', icon: Trash2, destructive: true, onClick: () => setBulkAction('delete') },
              ]}
            />
          </div>
        )}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {unverifiedOnly ? 'لا توجد حسابات بانتظار توثيق البريد.' : 'لا يوجد مستخدمون.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-start text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      disabled={selectableUsers.length === 0}
                      className="h-4 w-4 rounded border-border accent-accent"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">المستخدم</th>
                  <th className="px-4 py-3 font-medium">الرقم الجامعي</th>
                  <th className="px-4 py-3 font-medium">الدور</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3 font-medium text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u._id === currentUser?._id;
                  const isBusy = busyId === u._id;
                  const active = u.isActive ?? true;
                  return (
                    <tr key={u._id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        {!isSelf && (
                          <input
                            type="checkbox"
                            checked={selected.has(u._id)}
                            onChange={() => toggleSelect(u._id)}
                            className="h-4 w-4 rounded border-border accent-accent"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar src={assetUrl(u.photoUrl)} name={u.name} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {u.name} {isSelf && <span className="text-xs font-normal text-muted-foreground">(أنت)</span>}
                            </p>
                            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <bdi dir="ltr">{u.collegeEmail}</bdi>
                              {u.collegeEmailVerifiedAt && (
                                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="بريد موثّق" />
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.collegeId}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          disabled={isBusy || isSelf}
                          onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                          className={cn(
                            'h-8 rounded-lg border border-border bg-surface px-2 text-xs font-medium text-foreground',
                            'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
                            (isBusy || isSelf) && 'cursor-not-allowed opacity-60',
                          )}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={active ? 'success' : 'default'}>{active ? 'نشط' : 'موقوف'}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!u.collegeEmailVerifiedAt && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="توثيق البريد الجامعي مباشرة"
                              disabled={isBusy}
                              onClick={() => handleVerifyEmail(u)}
                            >
                              <BadgeCheck className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="إعادة تعيين كلمة المرور"
                            disabled={isBusy}
                            onClick={() => setPasswordTarget(u)}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={active ? 'إيقاف الحساب' : 'إعادة تفعيل الحساب'}
                            disabled={isBusy || isSelf}
                            onClick={() => handleToggleActive(u)}
                          >
                            {active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="حذف الحساب"
                            disabled={isBusy || isSelf}
                            onClick={() => setPendingDelete(u)}
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
            صفحة {page} من {totalPages} &middot; {total} مستخدمًا
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

      <ResetPasswordModal user={passwordTarget} onClose={() => setPasswordTarget(null)} />

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && handleDelete(pendingDelete)}
        title="حذف الحساب"
        message={pendingDelete ? `هل تريد حذف حساب ${pendingDelete.name}؟ لا يمكن التراجع عن هذا الإجراء.` : ''}
        confirmLabel="حذف"
        loading={pendingDelete !== null && busyId === pendingDelete._id}
      />

      <ConfirmModal
        open={bulkAction !== null}
        onClose={() => setBulkAction(null)}
        onConfirm={handleBulkAction}
        title={bulkAction === 'delete' ? 'حذف الحسابات المحددة' : bulkAction === 'activate' ? 'تفعيل الحسابات المحددة' : 'إيقاف الحسابات المحددة'}
        message={`سيُطبَّق هذا الإجراء على ${selected.size} حساب.${bulkAction === 'delete' ? ' لا يمكن التراجع عن هذا الإجراء.' : ''}`}
        confirmLabel={bulkAction === 'delete' ? 'حذف' : 'تأكيد'}
        destructive={bulkAction === 'delete'}
        loading={bulkBusy}
      />
    </div>
  );
}
