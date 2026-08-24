'use client';

import { FormEvent, useState } from 'react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Bell, CalendarPlus, ListTodo } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';

type Kind = 'task' | 'event' | 'reminder';

interface AddCalendarItemModalProps {
  open: boolean;
  onClose: () => void;
  date: Date;
  onCreated: () => void;
}

const KIND_OPTIONS: { id: Kind; label: string; icon: typeof ListTodo }[] = [
  { id: 'task', label: 'مهمة', icon: ListTodo },
  { id: 'event', label: 'حدث', icon: CalendarPlus },
  { id: 'reminder', label: 'تذكير', icon: Bell },
];

// Opened from CalendarView's "+" button on the selected day. `task` goes through the existing
// planner endpoint (PlannerTask already models a to-do with a due date -- no new backend needed
// for that kind); `event`/`reminder` go through the new /calendar-events endpoint.
export function AddCalendarItemModal({ open, onClose, date, onCreated }: AddCalendarItemModalProps) {
  const { showToast } = useToast();
  const [kind, setKind] = useState<Kind>('event');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setKind('event');
    setTitle('');
    setNotes('');
    setTime('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (kind === 'reminder' && !time) {
      showToast('التذكير يحتاج إلى وقت لتفعيله.', 'error');
      return;
    }
    setSaving(true);
    try {
      const dateIso = format(date, 'yyyy-MM-dd');
      if (kind === 'task') {
        await api.post('/planner', { title, notes: notes || undefined, dueDate: dateIso });
      } else {
        await api.post('/calendar-events', { title, notes: notes || undefined, date: dateIso, time: time || undefined, kind });
      }
      showToast(kind === 'task' ? 'تمت إضافة المهمة.' : kind === 'event' ? 'تمت إضافة الحدث.' : 'تمت إضافة التذكير.');
      onCreated();
      handleClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر الإضافة.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={`إضافة إلى ${format(date, 'd MMMM', { locale: ar })}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {KIND_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setKind(opt.id)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-colors',
                  kind === opt.id ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:bg-surface-2',
                )}
              >
                <Icon className="h-4 w-4" />
                {opt.label}
              </button>
            );
          })}
        </div>

        <Input label="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />

        {kind !== 'task' && (
          <Input
            label={kind === 'reminder' ? 'الوقت' : 'الوقت (اختياري)'}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required={kind === 'reminder'}
          />
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">ملاحظات (اختياري)</label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <Button type="submit" size="lg" className="w-full" loading={saving}>
          إضافة
        </Button>
      </form>
    </Modal>
  );
}
