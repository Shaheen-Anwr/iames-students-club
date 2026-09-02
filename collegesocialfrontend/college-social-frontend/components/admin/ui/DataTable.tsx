'use client';

import { useMemo, useRef, type ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import type { Column, Density } from './types';
import type { TableSort } from './useTableQuery';

const ALIGN: Record<string, string> = { start: 'text-start', end: 'text-end', center: 'text-center' };

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  sort?: TableSort | null;
  onToggleSort?: (id: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  isRowSelectable?: (row: T) => boolean;
  onRowClick?: (row: T) => void;
  density?: Density;
  /** Visible column ids. Omit to show every column that isn't `defaultHidden`. */
  visibleColumnIds?: Set<string>;
  emptyState?: ReactNode;
  skeletonRows?: number;
  minWidth?: number | string;
  className?: string;
}

function primitive(value: ReactNode): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  sort,
  onToggleSort,
  selectable,
  selectedIds,
  onSelectedChange,
  isRowSelectable = () => true,
  onRowClick,
  density = 'comfortable',
  visibleColumnIds,
  emptyState,
  skeletonRows = 8,
  minWidth = 720,
  className,
}: DataTableProps<T>) {
  const cols = useMemo(
    () => columns.filter((c) => (visibleColumnIds ? visibleColumnIds.has(c.id) : !c.defaultHidden)),
    [columns, visibleColumnIds],
  );
  const lastIndexRef = useRef<number | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortable) return rows;
    const val = (row: T) => {
      if (col.sortValue) return col.sortValue(row) ?? '';
      return primitive(col.cell(row)) ?? '';
    };
    const dir = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av instanceof Date || bv instanceof Date) {
        return (new Date(av as never).getTime() - new Date(bv as never).getTime()) * dir;
      }
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'ar') * dir;
    });
  }, [rows, sort, columns]);

  const selectableRows = rows.filter(isRowSelectable);
  const allSelected =
    selectable && selectableRows.length > 0 && selectableRows.every((r) => selectedIds?.has(rowKey(r)));

  const cellPad = density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-3';
  const textSize = density === 'compact' ? 'text-xs' : 'text-[13px]';

  function toggleAll() {
    if (!onSelectedChange) return;
    onSelectedChange(allSelected ? new Set() : new Set(selectableRows.map(rowKey)));
  }

  function toggleOne(row: T, index: number, shift: boolean) {
    if (!onSelectedChange || !selectedIds) return;
    const next = new Set(selectedIds);
    const id = rowKey(row);
    const add = !next.has(id);

    if (shift && lastIndexRef.current != null) {
      const [lo, hi] = [lastIndexRef.current, index].sort((a, b) => a - b);
      for (let i = lo; i <= hi; i++) {
        const r = sorted[i];
        if (r && isRowSelectable(r)) add ? next.add(rowKey(r)) : next.delete(rowKey(r));
      }
    } else {
      add ? next.add(id) : next.delete(id);
    }
    lastIndexRef.current = index;
    onSelectedChange(next);
  }

  function handleRowClick(e: React.MouseEvent, row: T) {
    if (!onRowClick) return;
    if ((e.target as HTMLElement).closest('button,a,input,select,[role="button"],label')) return;
    onRowClick(row);
  }

  const colSpan = cols.length + (selectable ? 1 : 0);

  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-border/80 bg-surface shadow-elev-1', className)}>
      <table className="w-full text-start" style={{ minWidth }}>
        <thead className="sticky top-0 z-[1] bg-surface">
          <tr className="border-b border-border">
            {selectable && (
              <th className={cn('w-10', cellPad)}>
                <input
                  type="checkbox"
                  checked={!!allSelected}
                  onChange={toggleAll}
                  disabled={selectableRows.length === 0}
                  aria-label="تحديد الكل"
                  className="h-4 w-4 rounded border-border accent-accent"
                />
              </th>
            )}
            {cols.map((c) => {
              const active = sort?.id === c.id;
              const SortIcon = !active ? ChevronsUpDown : sort?.dir === 'desc' ? ArrowDown : ArrowUp;
              return (
                <th
                  key={c.id}
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(
                    'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
                    ALIGN[c.align ?? 'start'],
                    c.headerClassName,
                  )}
                >
                  {c.sortable && onToggleSort ? (
                    <button
                      type="button"
                      onClick={() => onToggleSort(c.id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded transition-colors hover:text-foreground',
                        active && 'text-foreground',
                      )}
                    >
                      {c.header}
                      <SortIcon className="h-3 w-3" />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {error ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-14">
                <div className="flex flex-col items-center gap-3 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-danger/10 text-danger">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {error instanceof Error ? error.message : 'تعذّر تحميل البيانات.'}
                  </p>
                  {onRetry && (
                    <Button variant="outline" size="sm" onClick={onRetry}>
                      إعادة المحاولة
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ) : loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                {selectable && (
                  <td className={cellPad}>
                    <Skeleton className="h-4 w-4 rounded" />
                  </td>
                )}
                {cols.map((c) => (
                  <td key={c.id} className={cellPad}>
                    <Skeleton className={cn('h-3.5 rounded', i % 3 === 0 ? 'w-1/2' : 'w-3/4')} />
                  </td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={colSpan}>
                {emptyState ?? <EmptyState title="لا توجد نتائج" description="جرّب تعديل البحث أو عوامل التصفية." />}
              </td>
            </tr>
          ) : (
            sorted.map((row, index) => {
              const id = rowKey(row);
              const selRow = isRowSelectable(row);
              return (
                <tr
                  key={id}
                  onClick={(e) => handleRowClick(e, row)}
                  className={cn(
                    'border-b border-border/60 last:border-0 transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-surface-2',
                    selectedIds?.has(id) && 'bg-accent/[0.06]',
                  )}
                >
                  {selectable && (
                    <td className={cellPad}>
                      {selRow && (
                        <input
                          type="checkbox"
                          checked={!!selectedIds?.has(id)}
                          onClick={(e) => toggleOne(row, index, (e as React.MouseEvent).shiftKey)}
                          onChange={() => {}}
                          aria-label="تحديد الصف"
                          className="h-4 w-4 rounded border-border accent-accent"
                        />
                      )}
                    </td>
                  )}
                  {cols.map((c) => (
                    <td
                      key={c.id}
                      className={cn(cellPad, textSize, 'text-foreground', ALIGN[c.align ?? 'start'], c.className)}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
