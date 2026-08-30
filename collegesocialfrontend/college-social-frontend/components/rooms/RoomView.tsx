'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Coffee, LogOut, Pause, Play, RotateCcw, SkipForward, Timer, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn } from '@/lib/utils';
import type { RoomTimerState, StudyRoomDetail } from '@/lib/types';

const POLL_MS = 4000;

function phaseSeconds(t: RoomTimerState): number {
  if (t.running && t.endsAt) return Math.max(0, Math.round((new Date(t.endsAt).getTime() - Date.now()) / 1000));
  if (t.remainingMs != null) return Math.round(t.remainingMs / 1000);
  return (t.phase === 'focus' ? t.focusMin : t.breakMin) * 60;
}

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function RoomView({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [room, setRoom] = useState<StudyRoomDetail | null>(null);
  const [error, setError] = useState(false);
  const [, forceTick] = useState(0);
  const rangEnd = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRoom(await api.get<StudyRoomDetail>(`/rooms/${roomId}`));
    } catch {
      setError(true);
    }
  }, [roomId]);

  // Join on open, then poll for shared state; leave on unmount.
  useEffect(() => {
    let alive = true;
    api
      .post<StudyRoomDetail>(`/rooms/${roomId}/join`)
      .then((r) => {
        if (alive) setRoom(r);
      })
      .catch(() => alive && setError(true));

    const poll = setInterval(refresh, POLL_MS);
    return () => {
      alive = false;
      clearInterval(poll);
      // best-effort leave (fire-and-forget)
      void api.post(`/rooms/${roomId}/leave`).catch(() => {});
    };
  }, [roomId, refresh]);

  // 1s local tick for the countdown display.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // When a running phase reaches 0, ping once and re-sync (server auto-advances).
  useEffect(() => {
    if (!room?.timer.running || !room.timer.endsAt) return;
    const secs = phaseSeconds(room.timer);
    if (secs <= 0 && rangEnd.current !== room.timer.endsAt) {
      rangEnd.current = room.timer.endsAt;
      showToast(room.timer.phase === 'focus' ? 'انتهت جلسة التركيز — استراحة!' : 'انتهت الاستراحة — لنكمل!', 'success');
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(200);
      void refresh();
    }
  });

  async function act(action: 'start' | 'pause' | 'reset' | 'skip') {
    if (!room) return;
    try {
      const timer = await api.post<RoomTimerState>(`/rooms/${roomId}/timer`, { action });
      setRoom((r) => (r ? { ...r, timer } : r));
      rangEnd.current = null;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تحديث المؤقّت', 'error');
    }
  }

  async function leave() {
    try {
      await api.post(`/rooms/${roomId}/leave`);
    } catch {
      /* ignore */
    }
    router.push('/rooms');
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">تعذّر فتح الغرفة — ربما أُغلقت.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push('/rooms')}>
          العودة للغرف
        </Button>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const t = room.timer;
  const secs = phaseSeconds(t);
  const isFocus = t.phase === 'focus';
  const totalSecs = (isFocus ? t.focusMin : t.breakMin) * 60;
  const pct = totalSecs > 0 ? Math.min(100, ((totalSecs - secs) / totalSecs) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push('/rooms')}
          aria-label="رجوع"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-surface-2"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight text-foreground">{room.name}</h1>
          {room.topic && <p className="truncate text-xs text-muted-foreground">{room.topic}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={leave}>
          <LogOut className="h-4 w-4" />
          غادر
        </Button>
      </div>

      {/* Timer */}
      <Card className="flex flex-col items-center gap-4 p-6">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
            isFocus ? 'bg-accent/15 text-accent' : 'bg-success/15 text-success',
          )}
        >
          {isFocus ? <Timer className="h-3.5 w-3.5" /> : <Coffee className="h-3.5 w-3.5" />}
          {isFocus ? 'تركيز' : 'استراحة'}
        </span>

        <div className="text-5xl font-bold tabular-nums tracking-tight text-foreground">
          <bdi dir="ltr">{fmt(secs)}</bdi>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn('h-full rounded-full transition-[width] duration-1000 ease-linear', isFocus ? 'bg-accent' : 'bg-success')}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center gap-2">
          {t.running ? (
            <Button size="sm" variant="subtle" onClick={() => act('pause')}>
              <Pause className="h-4 w-4" />
              إيقاف مؤقت
            </Button>
          ) : (
            <Button size="sm" onClick={() => act('start')}>
              <Play className="h-4 w-4" />
              {t.remainingMs != null ? 'متابعة' : 'ابدأ'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => act('skip')} title="تخطّي للمرحلة التالية">
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act('reset')} title="إعادة">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">المؤقّت مشترك — أي عضو يمكنه التحكّم به.</p>
      </Card>

      {/* Members */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          في الغرفة ({room.memberCount})
        </div>
        <div className="flex flex-wrap gap-3">
          {room.members.map((m) => (
            <div key={m._id} className="flex flex-col items-center gap-1">
              <Avatar src={assetUrl(m.photoUrl)} name={m.name} size="md" />
              <span className="max-w-[64px] truncate text-[11px] text-muted-foreground">{m.name.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
