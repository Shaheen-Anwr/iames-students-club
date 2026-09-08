'use client';

// A sticky day separator ("اليوم" / "أمس" / weekday / date) that floats over the thread while
// its day's messages scroll under it.
export function DayDivider({ label }: { label: string }) {
  return (
    <div className="sticky top-1 z-10 my-2 flex justify-center">
      <span className="rounded-full bg-surface/85 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-soft backdrop-blur-sm">
        {label}
      </span>
    </div>
  );
}

// "Unread messages" marker at the boundary where the reader left off.
export function UnreadDivider() {
  return (
    <div className="my-2 flex items-center gap-2 px-2">
      <span className="h-px flex-1 bg-accent/30" />
      <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
        رسائل غير مقروءة
      </span>
      <span className="h-px flex-1 bg-accent/30" />
    </div>
  );
}
