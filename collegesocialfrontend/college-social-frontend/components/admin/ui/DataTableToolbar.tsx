'use client';

import { type ReactNode } from 'react';
import { Columns3, Download, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/utils';
import { nf } from '@/lib/format';
import { transitions } from '@/lib/motion';
import type { Column, Density } from './types';

interface DataTableToolbarProps<T> {
  searchInput: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  /** Total matching records (for the count label). */
  total?: number;
  density: Density;
  onDensityChange: (d: Density) => void;
  columns: Column<T>[];
  visibleColumnIds: Set<string>;
  onVisibleColumnsChange: (s: Set<string>) => void;
  onExport?: () => void;
  /** Filter chips / selects rendered inline after the search box. */
  filters?: ReactNode;
  /** Selection → bulk-action bar. */
  selectedCount?: number;
  onClearSelection?: () => void;
  bulkActions?: ReactNode;
  className?: string;
}

export function DataTableToolbar<T>({
  searchInput,
  onSearchChange,
  searchPlaceholder = 'ابحث…',
  total,
  density,
  onDensityChange,
  columns,
  visibleColumnIds,
  onVisibleColumnsChange,
  onExport,
  filters,
  selectedCount = 0,
  onClearSelection,
  bulkActions,
  className,
}: DataTableToolbarProps<T>) {
  const toggleable = columns.filter((c) => c.id !== '__select' && c.id !== '__actions');

  function toggleColumn(id: string) {
    const next = new Set(visibleColumnIds);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    onVisibleColumnsChange(next);
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="ps-9"
          />
        </div>

        {filters}

        <div className="ms-auto flex items-center gap-2">
          {typeof total === 'number' && (
            <span className="hidden text-xs text-muted-foreground sm:inline">{nf(total)} سجل</span>
          )}

          <Segmented
            size="sm"
            value={density}
            onChange={(v) => onDensityChange(v as Density)}
            options={[
              { value: 'comfortable', label: 'مريح' },
              { value: 'compact', label: 'مضغوط' },
            ]}
          />

          <Dropdown
            menuLabel="إظهار الأعمدة"
            align="end"
            trigger={
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-strong bg-surface px-2.5 text-sm font-medium text-foreground hover:bg-surface-2">
                <Columns3 className="h-4 w-4" />
                <span className="hidden sm:inline">الأعمدة</span>
              </span>
            }
            items={toggleable.map((c) => ({
              label: `${visibleColumnIds.has(c.id) ? '✓  ' : '     '}${
                typeof c.header === 'string' ? c.header : c.id
              }`,
              onClick: () => toggleColumn(c.id),
            }))}
          />

          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">تصدير CSV</span>
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={transitions.snappy}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/[0.07] px-3 py-2">
              <span className="text-sm font-semibold text-foreground">{nf(selectedCount)} محدد</span>
              <div className="flex flex-wrap items-center gap-1.5">{bulkActions}</div>
              {onClearSelection && (
                <button
                  onClick={onClearSelection}
                  className="ms-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  إلغاء التحديد
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
