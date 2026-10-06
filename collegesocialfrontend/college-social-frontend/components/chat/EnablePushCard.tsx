'use client';

import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/lib/toast-context';
import { getPushSubscriptionState, isPushSupported, subscribeToPush } from '@/lib/push-notifications';

const DISMISS_KEY = 'chat:pushPromptDismissedAt';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

// Messages only reach the phone's notification bar once this device has subscribed to push, and
// that has to be a deliberate tap. So the chat list asks, right where it matters, until it's on
// (or for a week after "later"). Hidden where push can't work (iOS outside the installed app,
// or permission already denied -- the profile card explains that case).
export function EnablePushCard() {
  const { showToast } = useToast();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    try {
      if (Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < SNOOZE_MS) return;
    } catch {
      /* private mode -- just ask */
    }
    let cancelled = false;
    getPushSubscriptionState()
      .then((state) => {
        if (!cancelled) setShow(state === 'default' || state === 'granted');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  async function enable() {
    setBusy(true);
    try {
      await subscribeToPush();
      setShow(false);
      showToast('تم! ستصلك الرسائل على شاشتك بصوت حتى والتطبيق مقفول.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذّر تفعيل الإشعارات.', 'error');
      const state = await getPushSubscriptionState().catch(() => 'default' as const);
      if (state === 'denied' || state === 'subscribed') setShow(false);
    } finally {
      setBusy(false);
    }
  }

  function later() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <div className="mx-3 mb-2 flex items-center gap-3 rounded-2xl bg-accent/[0.08] p-3 ring-1 ring-accent/20">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-indigo-500 text-white shadow-elev-1">
        <BellRing className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">خلّي الرسائل توصلك على الشاشة</p>
        <p className="text-xs leading-relaxed text-muted-foreground">إشعار بصوت أول ما توصلك رسالة، حتى والتطبيق مقفول.</p>
      </div>
      <Button size="sm" onClick={() => void enable()} loading={busy}>
        تفعيل
      </Button>
      <button
        type="button"
        onClick={later}
        aria-label="لاحقًا"
        className="-me-1 shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
