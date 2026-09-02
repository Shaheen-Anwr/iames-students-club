'use client';

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { nf } from '@/lib/format';
import { DataTable } from './ui/DataTable';
import { DataTableToolbar } from './ui/DataTableToolbar';
import { Pagination } from './ui/Pagination';
import { DetailDrawer } from './ui/DetailDrawer';
import { exportCsv } from './ui/exportCsv';
import { useTableQuery, type TableSort } from './ui/useTableQuery';
import { useAdminList } from './ui/useAdminList';
import { useColumnPrefs } from './ui/useColumnPrefs';
import type { Column } from './ui/types';

interface ModerationPanelProps<T extends { _id: string }> {
  /** List + item endpoint base, e.g. `/admin/groups` (DELETE `/admin/groups/:id`). */
  path: string;
  /** CSV file name. */
  exportName: string;
  searchPlaceholder: string;
  /** Columns WITHOUT the trailing actions column — this component appends it. */
  columns: Column<T>[];
  emptyIcon: ComponentType<{ className?: string }>;
  emptyTitle: string;
  deleteTitle: string;
  deleteMessage: string;
  /** Enable row selection + a bulk-delete action. */
  bulkDelete?: boolean;
  drawerTitle: (row: T) => string;
  drawerDescription?: (row: T) => string | undefined;
  drawerBody: (row: T) => ReactNode;
  defaultSort?: TableSort;
  limit?: number;
}

export function ModerationPanel<T extends { _id: string }>({
  path,
  exportName,
  searchPlaceholder,
  columns: baseColumns,
  emptyIcon: EmptyIcon,
  emptyTitle,
  deleteTitle,
  deleteMessage,
  bulkDelete,
  drawerTitle,
  drawerDescription,
  drawerBody,
  defaultSort = { id: 'createdAt', dir: 'desc' },
  limit = 20,
}: ModerationPanelProps<T>) {
  const { showToast } = useToast();
  const tq = useTableQuery({ limit, defaultSort });
  const { rows, total, loading, error, retry, removeLocal } = useAdminList<T>(path, tq.queryString);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<T | null>(null);
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSelected(new Set()), [tq.queryString]);

  const columns = useMemo<Column<T>[]>(
    () => [
      ...baseColumns,
      {
        id: '__actions',
        header: '',
        align: 'end',
        noExport: true,
        cell: (row) => (
          <Button
            variant="ghost"
            size="icon"
            title={deleteTitle}
            onClick={() => setPendingDelete(row)}
            className="h-8 w-8 hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [baseColumns, deleteTitle],
  );

  const prefs = useColumnPrefs(columns);

  async function remove(ids: string[]) {
    setBusy(true);
    try {
      await Promise.all(ids.map((id) => api.delete(`${path}/${id}`)));
      removeLocal(ids);
      showToast(ids.length > 1 ? `تم حذف ${nf(ids.length)} عنصرًا.` : 'تم الحذف.');
      setSelected(new Set());
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تنفيذ الحذف.', 'error');
    } finally {
      setBusy(false);
      setPendingDelete(null);
      setBulkOpen(false);
    }
  }

  return (
    <div className="space-y-3">
      <DataTableToolbar
        searchInput={tq.searchInput}
        onSearchChange={tq.setSearchInput}
        searchPlaceholder={searchPlaceholder}
        total={total}
        density={prefs.density}
        onDensityChange={prefs.setDensity}
        columns={columns}
        visibleColumnIds={prefs.visibleColumnIds}
        onVisibleColumnsChange={prefs.setVisibleColumnIds}
        onExport={() => exportCsv(exportName, columns, rows)}
        selectedCount={bulkDelete ? selected.size : 0}
        onClearSelection={() => setSelected(new Set())}
        bulkActions={
          bulkDelete && (
            <Button variant="danger" size="xs" onClick={() => setBulkOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              حذف المحددين
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r._id}
        loading={loading}
        error={error}
        onRetry={retry}
        sort={tq.sort}
        onToggleSort={tq.toggleSort}
        selectable={bulkDelete}
        selectedIds={selected}
        onSelectedChange={setSelected}
        onRowClick={setDetail}
        density={prefs.density}
        visibleColumnIds={prefs.visibleColumnIds}
        emptyState={<EmptyState icon={EmptyIcon} title={emptyTitle} description="لا نتائج مطابقة." />}
      />

      <Pagination page={tq.page} total={total} limit={tq.limit} onPageChange={tq.setPage} />

      <DetailDrawer
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail ? drawerTitle(detail) : ''}
        description={detail ? drawerDescription?.(detail) : undefined}
        footer={
          detail && (
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                setPendingDelete(detail);
                setDetail(null);
              }}
            >
              <Trash2 className="h-4 w-4" />
              {deleteTitle}
            </Button>
          )
        }
      >
        {detail && <div className="space-y-4 text-sm">{drawerBody(detail)}</div>}
      </DetailDrawer>

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove([pendingDelete._id])}
        title={deleteTitle}
        message={deleteMessage}
        confirmLabel="حذف"
        loading={busy}
      />
      {bulkDelete && (
        <ConfirmModal
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          onConfirm={() => remove([...selected])}
          title="حذف المحدد"
          message={`سيتم حذف ${nf(selected.size)} عنصرًا. لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف"
          loading={busy}
        />
      )}
    </div>
  );
}
