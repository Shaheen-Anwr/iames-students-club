import { Skeleton } from '@/components/ui/Skeleton';

// Renders in the conversation pane (inside ChatLayout) while a thread's route + messages load.
export default function ChatLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3.5">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>

      {/* messages */}
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 bg-surface-2 px-4 py-5 sm:px-6">
        {[
          { own: false, w: 'w-40' },
          { own: false, w: 'w-56' },
          { own: true, w: 'w-48' },
          { own: false, w: 'w-32' },
          { own: true, w: 'w-60' },
          { own: true, w: 'w-36' },
        ].map((m, i) => (
          <div key={i} className={m.own ? 'flex justify-end' : 'flex justify-start'}>
            <Skeleton className={`h-10 rounded-2xl ${m.w}`} />
          </div>
        ))}
      </div>

      {/* composer */}
      <div className="border-t border-border bg-surface px-4 py-3">
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
    </div>
  );
}
