'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { onboardingShowing } from '@/components/onboarding/OnboardingFlow';
import { useAuth } from '@/lib/auth-context';

const SEEN_KEY = 'notice:security:v1';

// A one-time note about where data lives, for every signed-in account -- students, staff and admins,
// existing and new alike: read it, close it, and this device never shows it again. It only waits
// while the first-run tour is on screen, so the two sheets never stack.
// Every claim must stay true -- drafts (lib/chat-drafts.ts), the chat-sound switch
// (lib/chat-sounds.ts) and recent stickers (lib/chat-stickers.ts) are localStorage-only, while
// messages, posts and files live on the app's servers over HTTPS. Re-check before rewording.
export function SecurityNote() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    // No storage (private mode) counts as "seen": it couldn't remember being closed, so it would
    // otherwise come back on every visit.
    const seen = () => {
      try {
        return localStorage.getItem(SEEN_KEY) !== null;
      } catch {
        return true;
      }
    };
    if (seen()) return;
    const timer = setInterval(() => {
      if (seen()) clearInterval(timer);
      else if (!onboardingShowing()) {
        clearInterval(timer);
        setOpen(true);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [user]);

  // Any way out -- the button, the X, a tap outside -- counts as read.
  function close() {
    try {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      /* private mode */
    }
    setOpen(false);
  }

  return (
    <Modal open={open} onClose={close} title="ملاحظة الأمان" className="max-w-sm">
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <p className="text-sm leading-relaxed text-foreground">
          🔒 بعض إعداداتك (المسودات والأصوات والملصقات الأخيرة) محفوظة على جهازك فقط، أما رسائلك ومنشوراتك وملفاتك فمحفوظة على
          خوادم التطبيق والاتصال بها مشفّر.
        </p>
        <Button fullWidth onClick={close}>
          فهمت
        </Button>
      </div>
    </Modal>
  );
}
