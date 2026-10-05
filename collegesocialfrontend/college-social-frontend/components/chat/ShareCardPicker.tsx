'use client';

import { useEffect, useState } from 'react';
import { ArrowUpLeft, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { chatApi } from '@/lib/chat-api';
import { ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { ChatCard } from '@/lib/types';

export function ShareCardPicker({ open, conversationId, onClose }: { open: boolean; conversationId: string; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof chatApi.cardSuggestions>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const { showToast } = useToast();
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError('');
    chatApi.cardSuggestions().then((value) => { if (active) setData(value); }).catch(() => {
      if (active) setError('تعذّر تحميل العناصر.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, reload]);

  async function share(card: ChatCard) {
    setBusy(card.refId);
    try {
      await chatApi.shareCard(conversationId, { kind: card.kind, refId: card.refId });
      onClose();
      showToast('تمت المشاركة في المحادثة.');
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'تعذّرت المشاركة.', 'error');
    } finally { setBusy(null); }
  }

  const groups = data ? [
    { label: 'المحاضرات', items: data.lectures }, { label: 'الواجبات القادمة', items: data.assignments },
    { label: 'الفعاليات', items: data.events }, { label: 'السوق', items: data.listings },
  ] : [];
  return (
    <Modal open={open} onClose={onClose} title="مشاركة من المنصة">
      {loading ? <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-accent" /> : error ? (
        <div className="py-6 text-center text-sm text-muted-foreground">{error}<button type="button" className="ms-2 text-accent" onClick={() => setReload((value) => value + 1)}>إعادة المحاولة</button></div>
      ) : groups.every((group) => !group.items.length) ? <p className="py-8 text-center text-sm text-muted-foreground">لا توجد عناصر متاحة للمشاركة حاليًا.</p> : (
        <div className="space-y-4">
          {groups.filter((group) => group.items.length).map((group) => (
            <section key={group.label}>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{group.label}</h3>
              <div className="space-y-1">{group.items.map((card) => (
                <button key={card.refId} type="button" disabled={busy !== null} onClick={() => void share(card)}
                  className="flex w-full items-center gap-3 rounded-xl bg-surface-2 p-3 text-start hover:bg-accent/10 disabled:opacity-50">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{card.title}</span><span className="block truncate text-xs text-muted-foreground">{card.subtitle}</span></span>
                  {busy === card.refId ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpLeft className="h-4 w-4 text-accent" />}
                </button>
              ))}</div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
