'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BellRing, Bookmark, Flame, Loader2, Moon, Settings2, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { formatFullDate } from '@/lib/chat-helpers';
import { useChat } from './ChatProvider';

interface ChatPreferences {
  chatStreaksEnabled: boolean;
  eveningDigest: boolean;
}

interface Reminder {
  _id: string;
  messageId: string;
  conversationId: string;
  remindAt: string;
  preview: string;
  messageCreatedAt: string;
}

export function ChatHomeTools() {
  const router = useRouter();
  const { refresh } = useChat();
  const { updateLocalUser } = useAuth();
  const { showToast } = useToast();
  const [openingSaved, setOpeningSaved] = useState(false);
  const [panel, setPanel] = useState<'reminders' | 'preferences' | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [preferences, setPreferences] = useState<ChatPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState<string | null>(null);

  useEffect(() => {
    if (!panel) return;
    let canceled = false;
    setLoading(true);
    setError(false);
    const request = panel === 'reminders'
      ? api.get<Reminder[]>('/chat/reminders').then((data) => { if (!canceled) setReminders(data); })
      : api.get<ChatPreferences>('/users/me/chat-prefs').then((data) => { if (!canceled) setPreferences(data); });
    request.catch(() => { if (!canceled) setError(true); }).finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [panel, retry]);

  async function openSaved() {
    setOpeningSaved(true);
    try {
      const conversation = await api.post<{ _id: string }>('/chat/conversations/self');
      await refresh();
      router.push(`/chat/${conversation._id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر فتح رسائلك المحفوظة.', 'error');
    } finally {
      setOpeningSaved(false);
    }
  }

  async function savePreferences(patch: Partial<ChatPreferences>) {
    setSaving(true);
    try {
      const next = await api.patch<ChatPreferences>('/users/me/chat-prefs', patch);
      setPreferences(next);
      updateLocalUser({ chatStreaksEnabled: next.chatStreaksEnabled, eveningDigestOptOut: !next.eveningDigest });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ التفضيلات.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function cancelReminder(id: string) {
    setCanceling(id);
    try {
      await api.delete(`/chat/reminders/${id}`);
      setReminders((current) => current.filter((item) => item._id !== id));
      showToast('تم إلغاء التذكير.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إلغاء التذكير.', 'error');
    } finally {
      setCanceling(null);
    }
  }

  const shortcutClass = 'flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-surface-2/70 px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-50';

  return (
    <>
      <div className="grid grid-cols-[1.4fr_1fr_auto] gap-1.5 px-3 pb-2">
        <button type="button" className={shortcutClass} onClick={() => void openSaved()} disabled={openingSaved}>
          {openingSaved ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4 text-accent" />}
          رسائلي المحفوظة
        </button>
        <button type="button" className={shortcutClass} onClick={() => setPanel('reminders')}>
          <BellRing className="h-4 w-4" /> تذكيراتي
        </button>
        <button type="button" className={shortcutClass} onClick={() => setPanel('preferences')} aria-label="تفضيلات الدردشة" title="تفضيلات الدردشة">
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      <Modal open={panel !== null} onClose={() => setPanel(null)} title={panel === 'reminders' ? 'تذكيراتي' : 'تفضيلات الدردشة'}>
        {loading ? (
          <div className="flex justify-center py-10" role="status" aria-label="جارٍ التحميل"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        ) : error ? (
          <div className="space-y-3 py-6 text-center text-sm text-muted-foreground">
            <p>تعذّر التحميل، حاول مرة أخرى.</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-xl bg-accent/10 px-4 py-2 text-accent">إعادة المحاولة</button>
          </div>
        ) : panel === 'reminders' ? (
          reminders.length ? (
            <div className="space-y-2">
              {reminders.map((reminder) => (
                <div key={reminder._id} className="flex items-center gap-2 rounded-xl border border-border p-3">
                  <Link
                    href={`/chat/${reminder.conversationId}?m=${reminder.messageId}&t=${encodeURIComponent(reminder.messageCreatedAt)}`}
                    onClick={() => setPanel(null)}
                    className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <p dir="auto" className="line-clamp-2 text-sm text-foreground">{reminder.preview}</p>
                    <time dateTime={reminder.remindAt} className="mt-1 block text-xs text-accent">{formatFullDate(reminder.remindAt)}</time>
                  </Link>
                  <button type="button" aria-label="إلغاء التذكير" disabled={canceling !== null} onClick={() => void cancelReminder(reminder._id)} className="rounded-full p-2.5 text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:opacity-50">
                    {canceling === reminder._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 py-8 text-center">
              <BellRing className="mx-auto mb-3 h-8 w-8 text-accent" />
              <p className="text-sm font-semibold text-foreground">لا توجد تذكيرات قادمة</p>
              <p className="text-xs leading-relaxed text-muted-foreground">اضغط مطولًا على رسالة واختر «ذكّرني» لتعود إليها في الوقت المناسب.</p>
            </div>
          )
        ) : preferences ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
              <Flame className="h-5 w-5 shrink-0 text-orange-500" />
              <div className="flex-1">
                <label htmlFor="chat-streak-preference" className="text-sm font-semibold text-foreground">أيام التواصل</label>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">اعرض عدد الأيام المتتالية التي تبادلت فيها الرسائل مع أصدقائك.</p>
              </div>
              <Switch id="chat-streak-preference" checked={preferences.chatStreaksEnabled} disabled={saving} onCheckedChange={(value) => void savePreferences({ chatStreaksEnabled: value })} />
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
              <Moon className="h-5 w-5 shrink-0 text-accent" />
              <div className="flex-1">
                <label htmlFor="chat-digest-preference" className="text-sm font-semibold text-foreground">ملخص المساء</label>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">إشعار مسائي بأهم ما فاتك في مجموعاتك النشطة. المجموعات المكتومة مستثناة.</p>
              </div>
              <Switch id="chat-digest-preference" checked={preferences.eveningDigest} disabled={saving} onCheckedChange={(value) => void savePreferences({ eveningDigest: value })} />
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
