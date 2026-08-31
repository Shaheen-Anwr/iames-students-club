'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { CalendarPlus, Clock3, MapPin, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { useApiQuery } from '@/lib/query';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { CampusEvent } from '@/lib/types';

type Scope = 'upcoming' | 'past';

export function EventsBoard() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>('upcoming');
  const [createOpen, setCreateOpen] = useState(false);

  const eventsKey = ['/events', scope] as const;
  const { data: events = [], isPending: loading } = useApiQuery<'/events', CampusEvent[]>(
    `/events?scope=${scope}&limit=50`,
    { key: [...eventsKey] },
  );
  const patchList = (fn: (list: CampusEvent[]) => CampusEvent[]) =>
    qc.setQueryData<CampusEvent[]>([...eventsKey], (list) => fn(list ?? []));

  async function rsvp(ev: CampusEvent) {
    patchList((list) =>
      list.map((x) =>
        x._id === ev._id ? { ...x, going: !x.going, attendeeCount: x.attendeeCount + (x.going ? -1 : 1) } : x,
      ),
    );
    try {
      const res = await api.post<{ going: boolean; attendeeCount: number }>(`/events/${ev._id}/rsvp`);
      patchList((list) =>
        list.map((x) =>
          x._id === ev._id ? { ...x, ...res, full: x.capacity != null && res.attendeeCount >= x.capacity } : x,
        ),
      );
    } catch (err) {
      patchList((list) =>
        list.map((x) => (x._id === ev._id ? { ...x, going: ev.going, attendeeCount: ev.attendeeCount } : x)),
      );
      showToast(err instanceof ApiError ? err.message : 'تعذّر تحديث الحضور', 'error');
    }
  }

  async function remove(id: string) {
    if (!confirm('حذف هذه الفعالية؟')) return;
    const before = events;
    patchList((list) => list.filter((x) => x._id !== id));
    try {
      await api.delete(`/events/${id}`);
    } catch (err) {
      patchList(() => before);
      showToast(err instanceof ApiError ? err.message : 'تعذّر الحذف', 'error');
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">الفعاليات</h1>
          <p className="text-xs text-muted-foreground">فعاليات ولقاءات الأندية داخل كليتك.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <CalendarPlus className="h-4 w-4" />
          فعالية جديدة
        </Button>
      </div>

      <Segmented
        options={[
          { value: 'upcoming', label: 'قادمة' },
          { value: 'past', label: 'سابقة' },
        ]}
        value={scope}
        onChange={setScope}
        size="sm"
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title={scope === 'upcoming' ? 'لا فعاليات قادمة' : 'لا فعاليات سابقة'}
          description={scope === 'upcoming' ? 'أنشئ أول فعالية لكليتك.' : undefined}
        />
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <EventCard key={ev._id} event={ev} onRsvp={() => rsvp(ev)} onDelete={() => remove(ev._id)} past={scope === 'past'} />
          ))}
        </div>
      )}

      <CreateEventModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(ev) => {
          setCreateOpen(false);
          if (scope === 'upcoming') {
            patchList((list) => [ev, ...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
          }
          showToast('أُنشئت الفعالية', 'success');
        }}
      />
    </div>
  );
}

function EventCard({
  event,
  onRsvp,
  onDelete,
  past,
}: {
  event: CampusEvent;
  onRsvp: () => void;
  onDelete: () => void;
  past: boolean;
}) {
  const start = new Date(event.startsAt);
  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-accent/10 text-accent">
          <span className="text-lg font-bold leading-none">{format(start, 'd')}</span>
          <span className="text-[11px]">{format(start, 'MMM', { locale: ar })}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{event.title}</p>
          {event.organizer && (
            <span className="mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
              {event.organizer}
            </span>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              {format(start, 'EEEE، d MMMM · HH:mm', { locale: ar })}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {event.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {event.attendeeCount}
              {event.capacity != null && `/${event.capacity}`}
            </span>
          </div>
          {event.description && (
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{event.description}</p>
          )}
          {!past && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant={event.going ? 'subtle' : 'primary'}
                onClick={onRsvp}
                disabled={!event.going && event.full}
              >
                {event.going ? 'سأحضر ✓' : event.full ? 'اكتمل العدد' : 'سأحضر'}
              </Button>
              {event.mine && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  حذف
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function CreateEventModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (ev: CampusEvent) => void;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [capacity, setCapacity] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setTitle('');
    setOrganizer('');
    setLocation('');
    setStartsAt('');
    setEndsAt('');
    setCapacity('');
    setDescription('');
  }

  async function submit() {
    if (!title.trim() || !startsAt || busy) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        organizer: organizer.trim() || undefined,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        startsAt: new Date(startsAt).toISOString(),
      };
      if (endsAt) payload.endsAt = new Date(endsAt).toISOString();
      const cap = Number(capacity);
      if (Number.isInteger(cap) && cap > 0) payload.capacity = cap;

      const ev = await api.post<CampusEvent>('/events', payload);
      onCreated(ev);
      reset();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إنشاء الفعالية', 'error');
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    'h-10 w-full rounded-lg border border-border bg-surface-2/50 px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

  return (
    <Modal open={open} onClose={onClose} title="فعالية جديدة" className="max-w-lg">
      <div className="space-y-3">
        <Input placeholder="عنوان الفعالية" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="الجهة المنظِّمة / النادي (اختياري)" value={organizer} onChange={(e) => setOrganizer(e.target.value)} />
        <Input placeholder="المكان (اختياري)" value={location} onChange={(e) => setLocation(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">تبدأ</span>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={cn(fieldClass)} dir="ltr" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">تنتهي (اختياري)</span>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={cn(fieldClass)} dir="ltr" />
          </label>
        </div>
        <Input
          type="number"
          min={1}
          placeholder="الحد الأقصى للحضور (اختياري)"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="تفاصيل (اختياري)"
          className="w-full resize-none rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <Button fullWidth onClick={submit} loading={busy} disabled={!title.trim() || !startsAt}>
          نشر الفعالية
        </Button>
      </div>
    </Modal>
  );
}
