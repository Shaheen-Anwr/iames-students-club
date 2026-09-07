'use client';

import { WifiOff } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { Button } from './Button';

// The standard "the fetch failed" state -- so a network error never masquerades as an empty list
// (icon + wording distinct from EmptyState's "nothing here yet"). Pair with a list hook's
// `isError` / `refetch`.
export function LoadError({
  onRetry,
  retrying,
  title = 'تعذّر تحميل البيانات',
  message = 'تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.',
  className,
}: {
  onRetry?: () => void;
  retrying?: boolean;
  title?: string;
  message?: string;
  className?: string;
}) {
  return (
    <EmptyState
      icon={WifiOff}
      title={title}
      description={message}
      className={className}
      action={
        onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} loading={retrying}>
            إعادة المحاولة
          </Button>
        )
      }
    />
  );
}
