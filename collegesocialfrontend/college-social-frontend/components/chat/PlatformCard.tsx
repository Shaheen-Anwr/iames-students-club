'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpLeft, BookOpen, CalendarDays, Check, ClipboardList, ShoppingBag } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatFullDate } from '@/lib/chat-helpers';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn } from '@/lib/utils';
import type { CampusEvent, ChatCard } from '@/lib/types';

const ICONS = { post: BookOpen, assignment: ClipboardList, event: CalendarDays, listing: ShoppingBag, status: BookOpen };
const LABELS = { post: 'منشور من المنصة', assignment: 'واجب', event: 'فعالية', listing: 'السوق', status: 'رد على حالة' };

export function PlatformCard({ card, isOwn = false }: { card: ChatCard; isOwn?: boolean }) {
  const [going, setGoing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const Icon = ICONS[card.kind] ?? BookOpen;
  // Cards are built by the server; still allow only app-relative navigation at this boundary.
  const href = card.href.startsWith('/') && !card.href.startsWith('//') ? card.href : '/chat';
  const when = card.meta?.dueAt ?? card.meta?.startsAt;

  async function rsvp() {
    setBusy(true);
    try {
      const event = await api.post<CampusEvent>(`/events/${card.refId}/rsvp`);
      setGoing(event.going);
      showToast(event.going ? 'تم تأكيد حضورك.' : 'تم إلغاء حضورك.');
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'تعذّر تحديث الحضور.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('m-1 w-[min(18rem,70vw)] overflow-hidden rounded-xl border', isOwn ? 'border-white/20 bg-white/10' : 'border-accent/15 bg-accent/5')}
      onClick={(event) => event.stopPropagation()}>
      <Link href={href} className="block transition-opacity hover:opacity-80">
        {card.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(card.imageUrl) ?? ''} alt="" className="h-32 w-full object-cover" loading="lazy" />
        )}
        <div className="space-y-1.5 p-3">
          <p className={cn('flex items-center gap-1.5 text-[11px]', isOwn ? 'text-white/80' : 'text-accent')}>
            <Icon className="h-3.5 w-3.5" />{LABELS[card.kind]}<ArrowUpLeft className="ms-auto h-3.5 w-3.5" />
          </p>
          <p dir="auto" className="text-sm font-semibold">{card.title}</p>
          {card.subtitle && <p className={cn('text-xs', isOwn ? 'text-white/75' : 'text-muted-foreground')}>{card.subtitle}</p>}
          {typeof when === 'string' && <p className="text-[11px]">{card.kind === 'assignment' ? 'التسليم: ' : ''}{formatFullDate(when)}</p>}
        </div>
      </Link>
      {card.kind === 'event' && (
        <button type="button" disabled={busy} onClick={() => void rsvp()}
          className={cn('flex w-full items-center justify-center gap-1.5 border-t p-2 text-xs font-semibold disabled:opacity-50', isOwn ? 'border-white/20 hover:bg-white/10' : 'border-accent/15 text-accent hover:bg-accent/10')}>
          {going && <Check className="h-3.5 w-3.5" />}{busy ? 'جارٍ التحديث…' : going ? 'سأحضر · إلغاء' : 'تأكيد الحضور'}
        </button>
      )}
    </div>
  );
}
