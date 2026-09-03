'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Coffee, Flame, Plus, Timer, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useApiQuery } from '@/lib/query';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn } from '@/lib/utils';
import type { StudyRoomDetail, StudyRoomListItem } from '@/lib/types';

// "بعد 25 دقيقة" / "بعد 3 ساعات" / weekday + time for further out.
function startsInLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'الآن';
  const min = Math.round(ms / 60000);
  if (min < 60) return `بعد ${min} دقيقة`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `بعد ${hrs} ساعة`;
  return new Date(iso).toLocaleString('ar', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

export function RoomsBoard() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: rooms = [], isPending: loading } = useApiQuery<'/rooms', StudyRoomListItem[]>('/rooms', {
    refetchInterval: 10_000,
  });
  const { data: mine } = useApiQuery<'/rooms/me', { roomStreak: number }>('/rooms/me', {
    key: ['/rooms/me'],
    staleTime: 60_000,
  });

  const { live, scheduled } = useMemo(() => {
    const now = Date.now();
    const sched = rooms
      .filter((r) => r.scheduledFor && new Date(r.scheduledFor).getTime() > now)
      .sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime());
    const liveRooms = rooms.filter((r) => !r.scheduledFor || new Date(r.scheduledFor).getTime() <= now);
    return { live: liveRooms, scheduled: sched };
  }, [rooms]);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
            غرف المذاكرة
            {(mine?.roomStreak ?? 0) > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                <Flame className="h-3.5 w-3.5 fill-warning/30" />
                {mine!.roomStreak} يوم
              </span>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">ذاكر مع زملائك بمؤقّت بومودورو مشترك.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          غرفة جديدة
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : rooms.length === 0 ? (
        <EmptyState icon={Timer} title="لا غرف مفتوحة الآن" description="أنشئ غرفة أو جدول جلسة وادعُ زملاءك." />
      ) : (
        <div className="space-y-5">
          {scheduled.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-1.5 px-0.5 text-xs font-semibold text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                جلسات مجدولة
              </h2>
              {scheduled.map((room) => (
                <Link key={room._id} href={`/rooms/${room._id}`}>
                  <Card interactive className="border-accent/25 bg-accent/5 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                        <CalendarClock className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{room.name}</p>
                        <p className="truncate text-xs text-accent">تبدأ {startsInLabel(room.scheduledFor!)}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {room.memberCount}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </section>
          )}

          {live.length > 0 && (
            <section className="space-y-2">
              {scheduled.length > 0 && <h2 className="px-0.5 text-xs font-semibold text-muted-foreground">مباشرة الآن</h2>}
              {live.map((room) => (
                <Link key={room._id} href={`/rooms/${room._id}`}>
                  <Card interactive className="p-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                          room.timerPhase === 'focus' ? 'bg-accent/10 text-accent' : 'bg-success/10 text-success',
                        )}
                      >
                        {room.timerPhase === 'focus' ? <Timer className="h-5 w-5" /> : <Coffee className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{room.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {room.topic || (room.timerPhase === 'focus' ? 'جلسة تركيز' : 'استراحة')}
                          {room.timerRunning && ' · تعمل الآن'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="flex -space-x-2 rtl:space-x-reverse">
                          {room.members.slice(0, 3).map((m) => (
                            <Avatar
                              key={m._id}
                              src={assetUrl(m.photoUrl)}
                              name={m.name}
                              size="xs"
                              className="ring-2 ring-surface"
                            />
                          ))}
                        </div>
                        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          {room.memberCount}
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </section>
          )}
        </div>
      )}

      <CreateRoomModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(r) => {
          setCreateOpen(false);
          qc.setQueryData<StudyRoomListItem[]>(['/rooms'], (list) => [r, ...(list ?? [])]);
        }}
      />
    </div>
  );
}

function CreateRoomModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (r: StudyRoomDetail) => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (name.trim().length < 2 || busy) return;
    if (schedule && !when) {
      showToast('اختر موعدًا للجلسة', 'error');
      return;
    }
    setBusy(true);
    try {
      const room = await api.post<StudyRoomDetail>('/rooms', {
        name: name.trim(),
        topic: topic.trim() || undefined,
        scheduledFor: schedule && when ? new Date(when).toISOString() : undefined,
      });
      onCreated(room);
      setName('');
      setTopic('');
      setSchedule(false);
      setWhen('');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إنشاء الغرفة', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="غرفة مذاكرة جديدة" className="max-w-md">
      <div className="space-y-3">
        <Input placeholder="اسم الغرفة" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          placeholder="الموضوع (اختياري) — مثلاً: مراجعة تفاضل"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={schedule}
            onChange={(e) => setSchedule(e.target.checked)}
            className="accent-accent"
          />
          جدولة لوقت لاحق
        </label>
        {schedule && (
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="h-11 w-full rounded-lg border border-border bg-surface-2/70 px-3 text-sm text-foreground focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        )}

        <Button fullWidth onClick={submit} loading={busy} disabled={name.trim().length < 2}>
          {schedule ? 'جدولة الغرفة' : 'إنشاء ودخول'}
        </Button>
      </div>
    </Modal>
  );
}
