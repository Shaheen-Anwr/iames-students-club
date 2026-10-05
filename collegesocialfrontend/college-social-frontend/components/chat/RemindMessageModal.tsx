'use client';

import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { chatApi } from '@/lib/chat-api';
import { ApiError } from '@/lib/api';
import { formatFullDate, messagePreview } from '@/lib/chat-helpers';
import { useToast } from '@/lib/toast-context';
import type { Message } from '@/lib/types';

export function RemindMessageModal({ message, onClose }: { message: Message | null; onClose: () => void }) {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  async function create(at: Date) {
    if (!message) return;
    if (!Number.isFinite(at.getTime()) || at.getTime() < Date.now() + 30_000) {
      showToast('اختر وقتًا في المستقبل للتذكير.', 'error');
      return;
    }
    setBusy(true);
    try {
      await chatApi.remind(message._id, at.toISOString());
      showToast(`سنذكّرك ${formatFullDate(at)}`);
      setDate('');
      onClose();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'تعذّر إنشاء التذكير.', 'error');
    } finally { setBusy(false); }
  }
  return (
    <Modal open={!!message} onClose={onClose} title="ذكّرني بهذه الرسالة">
      <p className="mb-4 line-clamp-3 rounded-xl bg-surface-2 p-3 text-sm text-muted-foreground">{message ? messagePreview(message) : ''}</p>
      <p className="mb-3 text-xs text-muted-foreground">تذكير خاص بك، يظهر في إشعاراتك ويفتح هذه الرسالة مباشرة.</p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void create(new Date(Date.now() + 60 * 60 * 1000))}>بعد ساعة</Button>
        <Button variant="outline" disabled={busy} onClick={() => { const next = new Date(); next.setDate(next.getDate() + 1); next.setHours(9, 0, 0, 0); void create(next); }}>غدًا 9 صباحًا</Button>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void create(new Date(date)); }} className="space-y-3">
        <label className="block text-xs font-medium" htmlFor="reminder-at">أو اختر موعدًا</label>
        <input id="reminder-at" type="datetime-local" required value={date} onChange={(event) => setDate(event.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm" />
        <Button type="submit" fullWidth disabled={busy || !date}><BellRing className="h-4 w-4" />{busy ? 'جارٍ الحفظ…' : 'إنشاء التذكير'}</Button>
      </form>
    </Modal>
  );
}
