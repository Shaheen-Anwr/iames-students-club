import type { Column } from './types';

function cell(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function escape(field: string): string {
  return /[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/**
 * Download the given rows as a CSV using each column's `exportValue` (falling back to a plain
 * `cell` render only when it's primitive). Prepends a UTF-8 BOM so Excel opens Arabic correctly.
 * `noExport` columns (selection, actions) are skipped.
 */
export function exportCsv<T>(filename: string, columns: Column<T>[], rows: T[]): void {
  const cols = columns.filter((c) => !c.noExport);
  const header = cols.map((c) => escape(typeof c.header === 'string' ? c.header : c.id));

  const body = rows.map((row) =>
    cols
      .map((c) => {
        if (c.exportValue) return escape(cell(c.exportValue(row)));
        const rendered = c.cell(row);
        return escape(typeof rendered === 'string' || typeof rendered === 'number' ? cell(rendered) : '');
      })
      .join(','),
  );

  const csv = [header.join(','), ...body].join('\r\n');
  // Leading BOM so Excel detects UTF-8 and renders Arabic instead of mojibake.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
