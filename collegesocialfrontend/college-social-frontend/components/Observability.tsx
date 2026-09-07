'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { useAuth } from '@/lib/auth-context';
import { AnalyticsEvent, track } from '@/lib/analytics';
import {
  capturePageview,
  identifyUser,
  initObservability,
  measureSince,
  reportWebVitals,
} from '@/lib/observability';

// Boots Sentry + PostHog (both no-ops until their env keys are set), then keeps them fed:
// Core Web Vitals, a $pageview on every App Router navigation, and identify/reset as auth
// state changes.
export function Observability() {
  const pathname = usePathname();
  const { user } = useAuth();

  useReportWebVitals(reportWebVitals);

  useEffect(() => {
    initObservability();
    // Page load -> React app interactive. Feeds PERF-BUDGET's "cold start -> app shell" line.
    measureSince('app:ready');
    // Attribution: did this session arrive from a push we sent? (?src=digest|release|announcement)
    const src = new URLSearchParams(window.location.search).get('src');
    if (src === 'digest') track(AnalyticsEvent.DigestOpened);
  }, []);

  useEffect(() => {
    if (pathname) capturePageview(pathname);
  }, [pathname]);

  useEffect(() => {
    identifyUser(
      user
        ? {
            _id: user._id,
            role: user.role,
            department: user.department,
            academicYear: user.academicYear,
            verified: !!user.collegeEmailVerifiedAt,
          }
        : null,
    );
  }, [user]);

  return null;
}
