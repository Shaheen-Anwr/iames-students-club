'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, BellOff, CalendarClock, Check, CheckCheck, Clock, Send, Trash2, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { chatApi } from '@/lib/chat-api';
import { EFFECT_META } from '@/lib/chat-effects';
import { formatClock, formatFullDate, messagePreview, type TickStatus } from '@/lib/chat-helpers';
import { ApiError } from '@/lib/api';
import { assetUrl, cn } from '@/lib/utils';
import type { Message, MessageInfo, ScheduledChatMessage, User } from '@/lib/types';
import { MessageCardPreview } from './MessageBubble';

// ---------------------------------------------------------------------------------------------
// Create poll

const MAX_OPTIONS = 12;

export function CreatePollModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (poll: { question: string; options: string[]; multiple: boolean }) => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const optionRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuestion('');
    setOptions(['', '']);
    setMultiple(false);
  }, [open]);

  const cleaned = options.map((o) => o.trim()).filter(Boolean);
  const distinct = new Set(cleaned.map((o) => o.toLocaleLowerCase())).size;
  const valid = question.trim().length > 0 && distinct >= 2;

  function updateOption(index: number, value: string) {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      // Typing into the last field grows a fresh empty one (WhatsApp-style), up to the cap.
      if (index === next.length - 1 && value.trim() && next.length < MAX_OPTIONS) next.push('');
      return next;
    });
  }

  function removeOption(index: number) {
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
  }

  return (
    <Modal open={open} onClose={onClose} title="استطلاع جديد" className="max-w-md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onCreate({ question: question.trim(), options: cleaned, multiple });
          onClose();
        }}
      >
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="poll-question">
            السؤال
          </label>
          <Input
            id="poll-question"
            autoFocus
            value={question}
            maxLength={300}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="مثلًا: متى نراجع للامتحان؟"
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">الخيارات</p>
          <div className="space-y-2">
            {options.map((option, i) => (
              <motion.div key={i} layout className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <Input
                  ref={(el) => {
                    optionRefs.current[i] = el;
                  }}
                  value={option}
                  maxLength={120}
                  onChange={(e) => updateOption(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      optionRefs.current[i + 1]?.focus();
                    }
                  }}
                  placeholder={i < 2 ? `الخيار ${i + 1}` : 'إضافة خيار'}
                  className="flex-1"
                />
                {options.length > 2 && option && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    aria-label="حذف الخيار"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
          {options.length >= MAX_OPTIONS && (
            <p className="mt-1.5 text-xs text-muted-foreground">الحد الأقصى {MAX_OPTIONS} خيارًا.</p>
          )}
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/70 px-3.5 py-3">
          <span>
            <span className="block text-sm font-medium text-foreground">السماح بأكثر من إجابة</span>
            <span className="block text-xs text-muted-foreground">يمكن لكل شخص اختيار عدة خيارات</span>
          </span>
          <Switch checked={multiple} onCheckedChange={setMultiple} aria-label="السماح بأكثر من إجابة" />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={!valid}>
            <BarChart3 className="h-4 w-4" /> إرسال الاستطلاع
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Schedule send

function atTime(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// `datetime-local` wants local wall-clock "YYYY-MM-DDTHH:mm".
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ScheduleSendModal({
  open,
  onClose,
  onSchedule,
  preview,
}: {
  open: boolean;
  onClose: () => void;
  onSchedule: (when: Date) => void | Promise<void>;
  /** What's about to be scheduled, shown as a reminder. */
  preview?: string;
}) {
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);

  const presets = useMemo(() => {
    if (!open) return [];
    const now = new Date();
    const list: { label: string; date: Date }[] = [
      { label: 'بعد ساعة', date: new Date(now.getTime() + 60 * 60 * 1000) },
    ];
    const tonight = atTime(now, 0, 21);
    if (tonight.getTime() - now.getTime() > 15 * 60 * 1000) list.push({ label: 'الليلة', date: tonight });
    list.push({ label: 'غدًا صباحًا', date: atTime(now, 1, 8) });
    list.push({ label: 'غدًا ظهرًا', date: atTime(now, 1, 14) });
    list.push({ label: 'بعد أسبوع', date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) });
    return list;
  }, [open]);

  useEffect(() => {
    if (open) setCustom(toLocalInput(new Date(Date.now() + 2 * 60 * 60 * 1000)));
  }, [open]);

  const customDate = custom ? new Date(custom) : null;
  const customValid = !!customDate && !Number.isNaN(customDate.getTime()) && customDate.getTime() > Date.now() + 30_000;

  async function pick(date: Date) {
    if (busy) return;
    setBusy(true);
    try {
      await onSchedule(date);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="جدولة الإرسال" className="max-w-md">
      <div className="space-y-4">
        {preview && (
          <div className="flex items-start gap-2 rounded-xl bg-surface-2/70 px-3 py-2.5 text-sm">
            <Send className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p dir="auto" className="line-clamp-2 text-foreground/80">
              {preview}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={busy}
              onClick={() => void pick(p.date)}
              className="flex flex-col items-start gap-0.5 rounded-xl border border-border/80 bg-surface px-3 py-2.5 text-start transition-colors hover:border-accent/50 hover:bg-accent/5 disabled:opacity-60"
            >
              <span className="text-sm font-semibold text-foreground">{p.label}</span>
              <span className="text-xs text-muted-foreground">{formatFullDate(p.date)}</span>
            </button>
          ))}
        </div>
        <div className="space-y-2 border-t border-border/70 pt-4">
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="schedule-at">
            وقت مخصّص
          </label>
          <Input
            id="schedule-at"
            type="datetime-local"
            dir="ltr"
            value={custom}
            min={toLocalInput(new Date(Date.now() + 60_000))}
            onChange={(e) => setCustom(e.target.value)}
          />
          {customDate && customValid && <p className="text-xs text-muted-foreground">{formatFullDate(customDate)}</p>}
          <Button fullWidth disabled={!customValid} loading={busy} onClick={() => customDate && void pick(customDate)}>
            <CalendarClock className="h-4 w-4" /> جدولة
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Scheduled list

export function ScheduledMessagesModal({
  open,
  onClose,
  items,
  loading,
  onCancel,
  onSendNow,
}: {
  open: boolean;
  onClose: () => void;
  items: ScheduledChatMessage[];
  loading: boolean;
  onCancel: (item: ScheduledChatMessage) => Promise<void>;
  onSendNow: (item: ScheduledChatMessage) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(item: ScheduledChatMessage, action: (item: ScheduledChatMessage) => Promise<void>) {
    setBusyId(item._id);
    try {
      await action(item);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="الرسائل المجدولة" className="max-w-lg">
      {loading && !items.length ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
            <CalendarClock className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-foreground">لا توجد رسائل مجدولة</p>
          <p className="text-xs text-muted-foreground">اضغط مطولًا على زر الإرسال لجدولة رسالة.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item._id} className="rounded-xl border border-border/70 bg-surface px-3.5 py-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-accent">
                <Clock className="h-3.5 w-3.5" /> {formatFullDate(item.sendAt)}
                {item.silent && (
                  <span className="ms-1 inline-flex items-center gap-0.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    <BellOff className="h-3 w-3" /> بدون صوت
                  </span>
                )}
                {item.effect && (
                  <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {EFFECT_META[item.effect].emoji} {EFFECT_META[item.effect].label}
                  </span>
                )}
              </div>
              <p dir="auto" className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-foreground">
                {messagePreview(item) || 'رسالة'}
              </p>
              <div className="mt-2.5 flex justify-end gap-2">
                <Button size="sm" variant="ghost" disabled={busyId === item._id} onClick={() => void run(item, onCancel)}>
                  <Trash2 className="h-3.5 w-3.5" /> حذف
                </Button>
                <Button size="sm" variant="subtle" loading={busyId === item._id} onClick={() => void run(item, onSendNow)}>
                  <Send className="h-3.5 w-3.5" /> إرسال الآن
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// People lists (reactions / poll votes / read receipts)

function PersonRow({ user, fallbackName, trailing, sub }: { user?: User | null; fallbackName?: string; trailing?: React.ReactNode; sub?: React.ReactNode }) {
  const name = user?.name ?? fallbackName ?? 'مستخدم';
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2">
      <Avatar src={assetUrl(user?.photoUrl)} name={name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      {trailing}
    </div>
  );
}

export function ReactionsModal({
  message,
  onClose,
  currentUserId,
  participantsById,
  onRemoveMine,
}: {
  message: Message | null;
  onClose: () => void;
  currentUserId: string;
  participantsById: Map<string, User>;
  onRemoveMine: (message: Message, emoji: string) => void;
}) {
  const [tab, setTab] = useState<string>('all');
  useEffect(() => setTab('all'), [message?._id]);

  const reactions = message?.reactions ?? [];
  const byEmoji = new Map<string, number>();
  reactions.forEach((r) => byEmoji.set(r.emoji, (byEmoji.get(r.emoji) ?? 0) + 1));
  const rows = reactions.filter((r) => tab === 'all' || r.emoji === tab);

  return (
    <Modal open={!!message} onClose={onClose} title="التفاعلات" className="max-w-sm">
      <div className="mb-3 flex gap-1.5 overflow-x-auto scrollbar-none">
        {[['all', `الكل ${reactions.length}`] as const, ...[...byEmoji.entries()].map(([e, n]) => [e, `${e} ${n}`] as const)].map(
          ([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors',
                tab === key ? 'bg-accent text-white' : 'bg-surface-2 text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ),
        )}
      </div>
      <div className="space-y-0.5">
        {rows.map((r, i) => {
          const id = typeof r.user === 'string' ? r.user : r.user._id;
          const mine = id === currentUserId;
          return (
            <button
              key={`${id}-${i}`}
              type="button"
              disabled={!mine}
              onClick={() => {
                if (!message || !mine) return;
                onRemoveMine(message, r.emoji);
                onClose();
              }}
              className={cn('block w-full text-start', mine && 'rounded-xl hover:bg-surface-2')}
            >
              <PersonRow
                user={participantsById.get(id)}
                fallbackName={mine ? 'أنت' : typeof r.user === 'string' ? undefined : r.user.name}
                sub={mine ? 'اضغط للإزالة' : undefined}
                trailing={<span className="text-xl">{r.emoji}</span>}
              />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function PollVotesModal({
  message,
  onClose,
  participantsById,
}: {
  message: Message | null;
  onClose: () => void;
  participantsById: Map<string, User>;
}) {
  const poll = message?.poll;
  return (
    <Modal open={!!poll} onClose={onClose} title="نتائج الاستطلاع" className="max-w-md">
      {poll && (
        <div className="space-y-4">
          <p dir="auto" className="text-base font-semibold text-foreground">
            {poll.question}
          </p>
          {poll.options.map((option) => (
            <div key={option.id} className="rounded-xl border border-border/70 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p dir="auto" className="text-sm font-medium text-foreground">
                  {option.text}
                </p>
                <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                  {option.voters.length}
                </span>
              </div>
              {option.voters.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا أصوات</p>
              ) : (
                option.voters.map((id) => <PersonRow key={id} user={participantsById.get(id)} fallbackName="عضو سابق" />)
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Message info (sender-only read receipts)

function receiptTime(at: string | null): string | undefined {
  if (!at) return undefined;
  const d = new Date(at);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? `اليوم ${formatClock(d)}` : formatFullDate(d);
}

export function MessageInfoModal({
  message,
  onClose,
  participantsById,
  isGroup,
  currentUserId,
  status,
}: {
  message: Message | null;
  onClose: () => void;
  participantsById: Map<string, User>;
  isGroup: boolean;
  currentUserId: string;
  status: TickStatus;
}) {
  const [info, setInfo] = useState<MessageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    let cancelled = false;
    setInfo(null);
    setError(null);
    chatApi
      .messageInfo(message._id)
      .then((data) => !cancelled && setInfo(data))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'تعذّر تحميل المعلومات'));
    return () => {
      cancelled = true;
    };
  }, [message]);

  const section = (title: string, icon: React.ReactNode, rows: { user: string; at: string | null }[]) =>
    rows.length > 0 && (
      <div>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {icon} {title} <span className="font-normal">({rows.length})</span>
        </p>
        {rows.map((r) => (
          <PersonRow key={r.user} user={participantsById.get(r.user)} fallbackName="عضو" sub={receiptTime(r.at)} />
        ))}
      </div>
    );

  return (
    <Modal open={!!message} onClose={onClose} title="معلومات الرسالة" className="max-w-md">
      {message && (
        <div className="space-y-4">
          <div className="flex justify-end rounded-2xl bg-surface-2/70 p-3">
            <MessageCardPreview message={message} isOwn isGroup={isGroup} status={status} currentUserId={currentUserId} />
          </div>
          {error ? (
            <p className="py-4 text-center text-sm text-danger">{error}</p>
          ) : !info ? (
            <div className="flex justify-center py-6">
              <Spinner className="h-5 w-5" />
            </div>
          ) : !isGroup ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-foreground">
                  <CheckCheck className="h-4 w-4 text-sky-500" /> قُرئت
                </span>
                <span className="text-muted-foreground">{info.read[0] ? receiptTime(info.read[0].at) ?? '—' : 'ليس بعد'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-foreground">
                  <CheckCheck className="h-4 w-4 text-muted-foreground" /> وصلت
                </span>
                <span className="text-muted-foreground">
                  {info.read[0] || info.delivered[0]
                    ? receiptTime((info.delivered[0] ?? info.read[0]).at) ?? '—'
                    : 'ليس بعد'}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {section('قرأها', <CheckCheck className="h-3.5 w-3.5 text-sky-500" />, info.read)}
              {section('وصلت إلى', <CheckCheck className="h-3.5 w-3.5" />, info.delivered)}
              {section(
                'لم تصل بعد',
                <Check className="h-3.5 w-3.5" />,
                info.pending.map((user) => ({ user, at: null })),
              )}
              {!info.read.length && !info.delivered.length && !info.pending.length && (
                <p className="text-center text-sm text-muted-foreground">لا يوجد أعضاء آخرون.</p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

