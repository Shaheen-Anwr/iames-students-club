// Block[] -> .xlsx via SheetJS. Table blocks become sheets; other blocks are written as single-
// column text rows so nothing is lost. Excel does its own Arabic shaping + bidi, and we flip the
// sheet view to RTL when the content is Arabic.

import type { Block } from './blocks';
import { containsArabic } from './rtl-text.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx');

export function blocksToXlsx(blocks: Block[]): Buffer {
  const wb = XLSX.utils.book_new();
  let anyArabic = false;
  let sheetIdx = 0;

  const addSheet = (rows: string[][], name?: string) => {
    if (!rows.length) return;
    if (rows.some((r) => r.some((c) => containsArabic(c)))) anyArabic = true;
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, (name || `Sheet${++sheetIdx}`).slice(0, 31));
  };

  // Consecutive non-table blocks accumulate into one "content" sheet; each table gets its own.
  let buffer: string[][] = [];
  const flush = () => {
    if (buffer.length) {
      addSheet(buffer);
      buffer = [];
    }
  };
  for (const b of blocks) {
    if (b.type === 'table') {
      flush();
      addSheet(b.rows);
    } else if (b.type === 'heading' || b.type === 'para') {
      buffer.push([b.text]);
    } else if (b.type === 'bullet') {
      buffer.push([`${'  '.repeat(b.depth)}• ${b.text}`]);
    } else if (b.type === 'pagebreak') {
      flush();
    }
  }
  flush();

  if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['']]), 'Sheet1');
  if (anyArabic) {
    wb.Workbook = wb.Workbook || {};
    wb.Workbook.Views = [{ RTL: true }];
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
