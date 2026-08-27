'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Gift, Share2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import { REFERRAL_TARGET } from '@/lib/types';

// Home-page card: shows the student their personal invite link, how many friends have joined
// through it, and the "سفير المنصة" badge they unlock at REFERRAL_TARGET invites (worth a
// one-time points bonus -- awarded server-side in GamificationService.recordReferral).
export function ReferralCard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  // Prefer the real page origin so the invite link always points at wherever this app is actually
  // served from (the Vercel deployment, whatever its domain). Stays null on the server and on
  // localhost, where we fall back to the production URL below so a link copied on a dev machine
  // still opens on a phone -- never http://localhost:3000.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    const loc = window.location.origin;
    if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(loc)) setOrigin(loc);
  }, []);

  const inviteUrl = useMemo(() => {
    if (!user) return '';
    const base = origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://iames-students-club.vercel.app';
    return `${base}/register?ref=${encodeURIComponent(user.collegeId)}`;
  }, [user, origin]);

  if (!user) return null;

  const count = Math.min(user.referralCount ?? 0, REFERRAL_TARGET);
  const done = (user.referralCount ?? 0) >= REFERRAL_TARGET;
  const remaining = Math.max(REFERRAL_TARGET - (user.referralCount ?? 0), 0);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      showToast('تم نسخ رابط الدعوة');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('تعذّر نسخ الرابط', 'error');
    }
  }

  async function shareLink() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'انضم إلينا على المنصة', url: inviteUrl });
      } catch {
        // user dismissed the share sheet -- nothing to do
      }
      return;
    }
    copyLink();
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Gift className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">ادعُ أصدقاءك</h2>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        {done ? (
          <>حصلت على وسام «سفير المنصة» ونقاطه 🎉 — استمر في دعوة زملائك!</>
        ) : (
          <>
            ادعُ <span className="font-semibold text-foreground">{REFERRAL_TARGET}</span> من زملائك عبر رابطك الخاص،
            واحصل على <span className="font-semibold text-foreground">5 نقاط</span> ووسام «سفير المنصة» الفريد.
          </>
        )}
      </p>

      {/* progress: count / target */}
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">
          {user.referralCount ?? 0} / {REFERRAL_TARGET}
        </span>
        {!done && <span className="text-muted-foreground">باقٍ {remaining}</span>}
      </div>
      <div className="mb-4 flex gap-1.5">
        {Array.from({ length: REFERRAL_TARGET }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i < count ? 'bg-accent' : 'bg-surface-2',
            )}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          <bdi dir="ltr">{inviteUrl}</bdi>
        </div>
        <button
          type="button"
          onClick={copyLink}
          aria-label="نسخ الرابط"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={shareLink}
          aria-label="مشاركة الرابط"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}
