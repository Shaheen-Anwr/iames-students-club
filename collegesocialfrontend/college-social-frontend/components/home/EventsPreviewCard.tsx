'use client';

import Link from 'next/link';
import { Calendar, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiQuery } from '@/lib/query';
import type { CampusEvent } from '@/lib/types';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ar', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('ar', { hour: 'numeric', minute: '2-digit' });
}

// Upcoming campus events near you (already شعبة-scoped server-side) -- a small preview card, full
// list at /events. Self-fetching, zero props, same convention as OnlineNow/FriendActivity.
export function EventsPreviewCard() {
  const { data: events = [], isPending } = useApiQuery<'/events', CampusEvent[]>('/events?scope=upcoming&limit=3');

  return (
    <Card className="p-4">
      <SectionHeader
        icon={Calendar}
        title="فعاليات الحرم الجامعي"
        action={
          <Link href="/events" className="text-muted-foreground hover:text-accent">
            عرض الكل
          </Link>
        }
      />
      {isPending ? null : events.length === 0 ? (
        <EmptyState icon={Calendar} title="لا فعاليات قادمة" description="سيظهر هنا أي فعالية جديدة." className="py-6" />
      ) : (
        <div className="space-y-2.5">
          {events.map((e) => (
            <Link
              key={e._id}
              href="/events"
              className="block rounded-xl border border-border/60 bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-accent/40"
            >
              <p className="truncate text-sm font-medium text-foreground">{e.title}</p>
              <p className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatWhen(e.startsAt)}
                </span>
                {e.location && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {e.location}
                  </span>
                )}
              </p>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
