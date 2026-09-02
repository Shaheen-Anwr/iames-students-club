'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AiConversationsList } from '@/components/ai/AiConversationsList';

export default function AiLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetail = pathname !== '/ai';

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div
        className={cn(
          'flex flex-col border-e border-border bg-surface lg:w-80 lg:shrink-0',
          isDetail && 'hidden lg:flex',
        )}
      >
        <AiConversationsList />
      </div>
      {/* min-w-0 is load-bearing: without it this flex child refuses to shrink below its content's
          intrinsic width (wide tables / long lines), so the chat overflows the viewport on mobile. */}
      <div className={cn('min-h-0 min-w-0 flex-1 flex-col', isDetail ? 'flex' : 'hidden lg:flex')}>{children}</div>
    </div>
  );
}
