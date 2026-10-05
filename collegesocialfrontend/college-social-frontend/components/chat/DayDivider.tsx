'use client';

import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

// A sticky day separator ("اليوم" / "أمس" / weekday / date) that floats over the thread while
// its day's messages scroll under it. With `onPick`, tapping it opens a date picker to jump to
// any day in the conversation's history.
export function DayDivider({ label, onPick }: { label: string; onPick?: () => void }) {
  return (
    <div className="pointer-events-none sticky top-2 z-10 my-3 flex justify-center">
      <button
        type="button"
        onClick={onPick}
        disabled={!onPick}
        title={onPick ? 'الانتقال إلى تاريخ' : undefined}
        className={cn(
          'group pointer-events-auto flex items-center gap-1.5 rounded-full bg-surface/85 px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-elev-1 ring-1 ring-border/50 backdrop-blur-md transition-colors',
          onPick && 'hover:text-accent',
        )}
      >
        {label}
        {onPick && <CalendarDays className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />}
      </button>
    </div>
  );
}

// "Unread messages" marker at the boundary where the reader left off.
export function UnreadDivider() {
  return (
    <div className="my-3 flex items-center gap-2 px-2">
      <span className="h-px flex-1 bg-gradient-to-l from-accent/40 to-transparent" />
      <span className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent ring-1 ring-accent/20">
        رسائل غير مقروءة
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-accent/40 to-transparent" />
    </div>
  );
}
