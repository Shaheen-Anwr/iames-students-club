'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  KeyRound,
  MailWarning,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Dropdown } from '@/components/ui/Dropdown';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import { nf } from '@/lib/format';
import { ROLE_LABELS, type Role, type User } from '@/lib/types';
import { DataTable } from './ui/DataTable';
import { DataTableToolbar } from './ui/DataTableToolbar';
import { Pagination } from './ui/Pagination';
import { DetailDrawer } from './ui/DetailDrawer';
import { exportCsv } from './ui/exportCsv';
import { useTableQuery } from './ui/useTableQuery';
import { useAdminList } from './ui/useAdminList';
import { useColumnPrefs } from './ui/useColumnPrefs';
import { MonoId, PersonCell, TimeCell } from './ui/cells';
import type { Column } from './ui/types';
import { ResetPasswordModal } from './ResetPasswordModal';

const LIMIT = 20;
const ROLE_OPTIONS: Role[] = ['student', 'professor', 'admin'];

export function AdminUsersPanel() {
  const { user: currentUser, updateLocalUser } = useAuth();
  const { showToast } = useToast();

  const tq = useTableQuery({
    limit: LIMIT,
    defaultSort: { id: 'createdAt', dir: 'desc' },
    filterKeys: ['verified'],
  });
  const { rows, total, loading, error, retry, removeLocal, patchLocal } = useAdminList<User>(
    '/admin/users',
    tq.queryString,
  );

  const unverifiedOnly = tq.filters.verified === 'false';

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<User | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [bulkAction, setBulkAction] = useState<'activate' | 'deactivate' | 'delete' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => setSelected(new Set()), [tq.queryString]);

  // Keep the drawer's copy in sync with optimistic list edits.
  const detailRow = detail ? (rows.find((u) => u._id === detail._id) ?? detail) : null;

  function applyPatch(id: string, patch: Partial<User>) {
    patchLocal(id, patch);
    if (id === currentUser?._id) updateLocalUser(patch);
  }

  async function run(id: string, req: Promise<User>, ok: string, fail: string) {
    setBusyId(id);
    try {
      const updated = await req;
      applyPatch(id, updated);
      showToast(ok);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : fail, 'error');
    } finally {
      setBusyId(null);
    }
  }

  const changeRole = (u: User, role: Role) =>
    run(u._id, api.patch<User>(`/admin/users/${u._id}`, { role }), `أصبح ${u.name} الآن ${ROLE_LABELS[role]}.`, 'تعذّر تحديث الدور.');

  const toggleActive = (u: User) => {
    const next = !(u.isActive ?? true);
    return run(
      u._id,
      api.patch<User>(`/admin/users/${u._id}`, { isActive: next }),
      next ? `تمت إعادة تفعيل ${u.name}.` : `تم إيقاف حساب ${u.name}.`,
      'تعذّر تحديث الحساب.',
    );
  };

  const toggleSuperAdmin = (u: User) => {
    const next = !u.isSuperAdmin;
    return run(
      u._id,
      api.patch<User>(`/admin/users/${u._id}`, { isSuperAdmin: next }),
      next ? `أصبح ${u.name} مديرًا عامًا.` : `أُزيلت صلاحية المدير العام عن ${u.name}.`,
      'تعذّر تحديث صلاحية المدير العام.',
    );
  };

  const verifyEmail = (u: User) =>
    run(u._id, api.patch<User>(`/admin/users/${u._id}/verify-email`), `تم توثيق بريد ${u.name}.`, 'تعذّر توثيق البريد.');

  async function handleDelete(u: User) {
    setBusyId(u._id);
    try {
      await api.delete(`/admin/users/${u._id}`);
      removeLocal(u._id);
      showToast(`تم حذف حساب ${u.name}.`);
      if (detail?._id === u._id) setDetail(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف المستخدم.', 'error');
    } finally {
      setBusyId(null);
      setPendingDelete(null);
    }
  }

  const selectableRows = rows.filter((u) => u._id !== currentUser?._id);

  async function runBulk() {
    if (!bulkAction) return;
    const ids = [...selected];
    setBulkBusy(true);
    try {
      if (bulkAction === 'delete') {
        await Promise.all(ids.map((id) => api.delete(`/admin/users/${id}`)));
        removeLocal(ids);
        showToast(`تم حذف ${nf(ids.length)} حسابًا.`);
      } else {
        const isActive = bulkAction === 'activate';
        const updated = await Promise.all(ids.map((id) => api.patch<User>(`/admin/users/${id}`, { isActive })));
        updated.forEach((u) => applyPatch(u._id, u));
        showToast(isActive ? `تمت إعادة تفعيل ${nf(ids.length)} حسابًا.` : `تم إيقاف ${nf(ids.length)} حسابًا.`);
      }
      setSelected(new Set());
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تنفيذ الإجراء الجماعي.', 'error');
    } finally {
      setBulkBusy(false);
      setBulkAction(null);
    }
  }

  const columns = useMemo<Column<User>[]>(
    () => [
      {
        id: 'user',
        header: 'المستخدم',
        sortable: true,
        sortValue: (u) => u.name,
        cell: (u) => (
          <div className="flex items-center gap-3">
            <PersonCell
              name={u.name}
              photoUrl={u.photoUrl}
              sub={undefined}
            />
            <div className="hidden min-w-0 sm:block">
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground" dir="ltr">
                {u.collegeEmail}
                {u.collegeEmailVerifiedAt && <BadgeCheck className="h-3 w-3 shrink-0 text-success" />}
              </p>
            </div>
            {u._id === currentUser?._id && <span className="text-[10px] text-muted-foreground">(أنت)</span>}
            {u.isSuperAdmin && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                <ShieldCheck className="h-3 w-3" />
                عام
              </span>
            )}
          </div>
        ),
        exportValue: (u) => u.name,
      },
      {
        id: 'collegeId',
        header: 'الرقم الجامعي',
        sortable: true,
        sortValue: (u) => u.collegeId,
        cell: (u) => <MonoId value={u.collegeId} />,
        exportValue: (u) => u.collegeId,
      },
      {
        id: 'role',
        header: 'الدور',
        sortable: true,
        sortValue: (u) => u.role,
        cell: (u) => <span className="text-muted-foreground">{ROLE_LABELS[u.role]}</span>,
        exportValue: (u) => ROLE_LABELS[u.role],
      },
      {
        id: 'status',
        header: 'الحالة',
        sortable: true,
        sortValue: (u) => ((u.isActive ?? true) ? 1 : 0),
        cell: (u) => (
          <Badge variant={(u.isActive ?? true) ? 'success' : 'default'}>{(u.isActive ?? true) ? 'نشط' : 'موقوف'}</Badge>
        ),
        exportValue: (u) => ((u.isActive ?? true) ? 'نشط' : 'موقوف'),
      },
      {
        id: 'email',
        header: 'البريد الجامعي',
        defaultHidden: true,
        cell: (u) => (
          <span dir="ltr" className="text-xs text-muted-foreground">
            {u.collegeEmail}
          </span>
        ),
        exportValue: (u) => u.collegeEmail,
      },
    ],
    [currentUser?._id],
  );

  const prefs = useColumnPrefs(columns);

  return (
    <div className="space-y-3">
      <DataTableToolbar
        searchInput={tq.searchInput}
        onSearchChange={tq.setSearchInput}
        searchPlaceholder="ابحث بالاسم أو الرقم الجامعي أو البريد الإلكتروني"
        total={total}
        density={prefs.density}
        onDensityChange={prefs.setDensity}
        columns={columns}
        visibleColumnIds={prefs.visibleColumnIds}
        onVisibleColumnsChange={prefs.setVisibleColumnIds}
        onExport={() => exportCsv('المستخدمون', columns, rows)}
        filters={
          <button
            onClick={() => tq.setFilter('verified', unverifiedOnly ? null : 'false')}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
              unverifiedOnly
                ? 'border-warning/40 bg-warning/10 text-warning'
                : 'border-strong text-muted-foreground hover:text-foreground',
            )}
          >
            <MailWarning className="h-3.5 w-3.5" />
            بريد غير موثّق
          </button>
        }
        selectedCount={selected.size}
        onClearSelection={() => setSelected(new Set())}
        bulkActions={
          <Dropdown
            menuLabel="إجراء جماعي"
            trigger={
              <span className="inline-flex h-7 items-center gap-1 rounded-md bg-accent/10 px-2.5 text-xs font-medium text-accent hover:bg-accent/15">
                إجراء جماعي
              </span>
            }
            items={[
              { label: 'تفعيل المحددين', icon: UserCheck, onClick: () => setBulkAction('activate') },
              { label: 'إيقاف المحددين', icon: UserX, onClick: () => setBulkAction('deactivate') },
              { label: 'حذف المحددين', icon: Trash2, destructive: true, onClick: () => setBulkAction('delete') },
            ]}
          />
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(u) => u._id}
        loading={loading}
        error={error}
        onRetry={retry}
        sort={tq.sort}
        onToggleSort={tq.toggleSort}
        selectable
        selectedIds={selected}
        onSelectedChange={setSelected}
        isRowSelectable={(u) => u._id !== currentUser?._id}
        onRowClick={setDetail}
        density={prefs.density}
        visibleColumnIds={prefs.visibleColumnIds}
        emptyState={
          <EmptyState
            icon={Users}
            title={unverifiedOnly ? 'لا حسابات بانتظار التوثيق' : 'لا يوجد مستخدمون'}
            description="لا نتائج مطابقة."
          />
        }
      />

      <Pagination page={tq.page} total={total} limit={tq.limit} onPageChange={tq.setPage} />

      <DetailDrawer
        open={!!detailRow}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detailRow?.name}
        description={detailRow ? ROLE_LABELS[detailRow.role] : undefined}
        footer={
          detailRow &&
          detailRow._id !== currentUser?._id && (
            <Button variant="danger" fullWidth onClick={() => setPendingDelete(detailRow)}>
              <Trash2 className="h-4 w-4" />
              حذف الحساب
            </Button>
          )
        }
      >
        {detailRow &&
          (() => {
            const u = detailRow;
            const isSelf = u._id === currentUser?._id;
            const active = u.isActive ?? true;
            const busy = busyId === u._id;
            return (
              <div className="space-y-4 text-sm">
                <PersonCell name={u.name} photoUrl={u.photoUrl} />
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">الرقم الجامعي</dt>
                    <dd>
                      <MonoId value={u.collegeId} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">البريد الجامعي</dt>
                    <dd className="flex items-center gap-1" dir="ltr">
                      <span className="truncate text-foreground">{u.collegeEmail}</span>
                      {u.collegeEmailVerifiedAt && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-success" />}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">أُنشئ</dt>
                    <dd className="text-foreground">
                      <TimeCell value={u.createdAt} />
                    </dd>
                  </div>
                </dl>

                <div className="space-y-3 rounded-xl border border-border/70 p-3">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-foreground">الدور</span>
                    <select
                      value={u.role}
                      disabled={busy || isSelf}
                      onChange={(e) => changeRole(u, e.target.value as Role)}
                      className="h-8 rounded-lg border border-border bg-surface px-2 text-xs font-medium text-foreground disabled:opacity-60"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-foreground">الحساب مفعّل</span>
                    <Switch checked={active} onCheckedChange={() => toggleActive(u)} disabled={busy || isSelf} />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      {u.isSuperAdmin ? <ShieldCheck className="h-3.5 w-3.5 text-accent" /> : <Shield className="h-3.5 w-3.5" />}
                      مدير عام
                    </span>
                    <Switch
                      checked={!!u.isSuperAdmin}
                      onCheckedChange={() => toggleSuperAdmin(u)}
                      disabled={busy || isSelf}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!u.collegeEmailVerifiedAt && (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => verifyEmail(u)}>
                      <BadgeCheck className="h-4 w-4" />
                      توثيق البريد
                    </Button>
                  )}
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setPasswordTarget(u)}>
                    <KeyRound className="h-4 w-4" />
                    كلمة المرور
                  </Button>
                </div>
              </div>
            );
          })()}
      </DetailDrawer>

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
        onConfirm={runBulk}
        title={
          bulkAction === 'delete'
            ? 'حذف الحسابات المحددة'
            : bulkAction === 'activate'
              ? 'تفعيل الحسابات المحددة'
              : 'إيقاف الحسابات المحددة'
        }
        message={`سيُطبَّق هذا الإجراء على ${nf(selected.size)} حساب.${bulkAction === 'delete' ? ' لا يمكن التراجع عن هذا الإجراء.' : ''}`}
        confirmLabel={bulkAction === 'delete' ? 'حذف' : 'تأكيد'}
        destructive={bulkAction === 'delete'}
        loading={bulkBusy}
      />
    </div>
  );
}
