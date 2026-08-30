'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Coffee, Plus, Timer, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn } from '@/lib/utils';
import type { StudyRoomDetail, StudyRoomListItem } from '@/lib/types';

export function RoomsBoard() {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState<StudyRoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  function load() {
    api
      .get<StudyRoomListItem[]>('/rooms')
      .then(setRooms)
      .catch(() => showToast('تعذّر تحميل الغرف', 'error'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000); // rooms/members change slowly
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">غرف المذاكرة</h1>
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
        <EmptyState icon={Timer} title="لا غرف مفتوحة الآن" description="أنشئ غرفة وادعُ زملاءك للمذاكرة معًا." />
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
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
                        <Avatar key={m._id} src={assetUrl(m.photoUrl)} name={m.name} size="xs" className="ring-2 ring-surface" />
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
        </div>
      )}

      <CreateRoomModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(r) => {
          setCreateOpen(false);
          setRooms((list) => [r, ...list]);
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
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (name.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const room = await api.post<StudyRoomDetail>('/rooms', { name: name.trim(), topic: topic.trim() || undefined });
      onCreated(room);
      setName('');
      setTopic('');
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
        <Input placeholder="الموضوع (اختياري) — مثلاً: مراجعة تفاضل" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <Button fullWidth onClick={submit} loading={busy} disabled={name.trim().length < 2}>
          إنشاء ودخول
        </Button>
      </div>
    </Modal>
  );
}
