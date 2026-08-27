import { cn } from '@/lib/utils';

// Determinate upload/progress bar -- `percent` is 0-100. Used wherever a long-running upload
// (lecture PDFs/videos, post attachments) needs visible feedback instead of just a spinner.
export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
