'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Tooltip } from '@/components/ui/Tooltip';
import { assetUrl, cn, timeAgo } from '@/lib/utils';

/** Relative time with the absolute date on hover. */
export function TimeCell({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const abs = new Date(value).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Tooltip content={abs} side="top">
      <span className="whitespace-nowrap text-muted-foreground">{timeAgo(value)}</span>
    </Tooltip>
  );
}

/** A short monospace id chip (Mongo _id, collegeId). */
export function MonoId({ value, className }: { value: string; className?: string }) {
  return (
    <span dir="ltr" className={cn('font-mono text-xs text-muted-foreground', className)}>
      {value}
    </span>
  );
}

/** Avatar + name (+ optional sub-line) — the "who" column in most panels. */
export function PersonCell({
  name,
  photoUrl,
  sub,
}: {
  name?: string | null;
  photoUrl?: string | null;
  sub?: string | null;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar src={assetUrl(photoUrl)} name={name ?? '؟'} size="sm" />
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{name ?? 'مستخدم محذوف'}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
