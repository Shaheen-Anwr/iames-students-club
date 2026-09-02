import type { ReactNode } from 'react';

export type ColumnAlign = 'start' | 'end' | 'center';

export interface Column<T> {
  /** Stable id — also the sort key and CSV header fallback. */
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: ColumnAlign;
  /** Fixed width, e.g. `'12rem'` or `80`. */
  width?: string | number;
  className?: string;
  headerClassName?: string;
  /** Enables the sortable header + caret; DataTable sorts the current page by `sortValue`. */
  sortable?: boolean;
  /** Value the client sort compares on (defaults to the raw `cell` output when it's primitive). */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  /** Plain-text value for CSV export (defaults to `String(cell(row))` when it's primitive). */
  exportValue?: (row: T) => string | number | null | undefined;
  /** Hidden from the CSV entirely (selection / action columns). */
  noExport?: boolean;
  /** Hidden by default; toggled on via the column-visibility menu. */
  defaultHidden?: boolean;
}

export type Density = 'comfortable' | 'compact';
