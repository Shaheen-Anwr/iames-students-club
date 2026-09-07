'use client';

import { useEffect, useState } from 'react';
import { MailWarning, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { AnalyticsEvent, track } from '@/lib/analytics';

// Verification is admin-driven (see AdminPanel's users table) -- this just informs the student
// their account is queued for review, with nothing for them to enter themselves.
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const pending = !!user && !user.collegeEmailVerifiedAt;
  // Activation-blocker signal for the funnel: how many users sit in "account pending admin
  // review", and does it correlate with D1 drop-off. Fires once per mount when the banner is live.
  useEffect(() => {
    if (pending) track(AnalyticsEvent.ActivationPendingShown);
  }, [pending]);

  if (!user || user.collegeEmailVerifiedAt || dismissed) return null;

  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
      <div className="flex flex-wrap items-center gap-3">
        <MailWarning className="h-4 w-4 shrink-0" />
        <span className="flex-1">بريدك الجامعي بانتظار المراجعة من قبل الإدارة لتفعيل حسابك بالكامل.</span>
        <button onClick={() => setDismissed(true)} className="rounded-full p-1 text-warning hover:bg-warning/15">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
