'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { capturePageview, identifyUser, initObservability } from '@/lib/observability';

// Boots Sentry + PostHog (both no-ops until their env keys are set), then keeps them fed:
// a $pageview on every App Router navigation, and identify/reset as auth state changes.
export function Observability() {
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    initObservability();
  }, []);

  useEffect(() => {
    if (pathname) capturePageview(pathname);
  }, [pathname]);

  useEffect(() => {
    identifyUser(user ? { _id: user._id, role: user.role, department: user.department } : null);
  }, [user]);

  return null;
}
