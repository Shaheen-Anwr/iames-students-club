'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { nf } from '@/lib/format';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Prev / next pager with a "صفحة X من Y · N سجل" label. RTL: chevrons point the reading way. */
export function Pagination({ page, total, limit, onPageChange, className }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;

  return (
    <div className={cn('flex items-center justify-between gap-3 text-xs text-muted-foreground', className)}>
      <p className="tabular-nums">
        صفحة {nf(page)} من {nf(totalPages)} · {nf(total)} سجل
      </p>
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="الصفحة السابقة"
        >
          <ChevronRight className="h-4 w-4" />
          السابق
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="الصفحة التالية"
        >
          التالي
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
