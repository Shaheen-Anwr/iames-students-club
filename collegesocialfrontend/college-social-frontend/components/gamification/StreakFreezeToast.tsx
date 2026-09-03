'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useGamificationSummary } from '@/lib/gamification';

// Fires a one-time celebratory toast the first time the client sees a fresh `lastFreezeUsedAt`
// (a streak freeze was auto-spent to cover a missed day). Gated per-user in localStorage so it
// shows once, not on every load. Mounted app-wide in AppShell; renders nothing.
export function StreakFreezeToast() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data } = useGamificationSummary(!!user);

  useEffect(() => {
    const at = data?.lastFreezeUsedAt;
    if (!at || !user || typeof window === 'undefined') return;
    const key = `seen-freeze:${user._id}`;
    let seen: string | null = null;
    try {
      seen = window.localStorage.getItem(key);
    } catch {
      /* private mode -- just show it */
    }
    if (seen === at) return;
    try {
      window.localStorage.setItem(key, at);
    } catch {
      /* ignore */
    }
    showToast('❄️ جمّدنا سلسلتك — فوّت يومًا واحدًا وعادت كما هي!', 'success');
  }, [data?.lastFreezeUsedAt, user, showToast]);

  return null;
}
