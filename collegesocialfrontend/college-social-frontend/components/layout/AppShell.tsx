'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useVisualViewport } from '@/lib/use-visual-viewport';
import { useAuth } from '@/lib/auth-context';
import { Spinner } from '@/components/ui/Spinner';
import { SetDepartmentBanner } from './SetDepartmentBanner';
import { PushRequiredBanner } from './PushRequiredBanner';
import { TopNavbar } from './TopNavbar';
import { MobileNav } from './MobileNav';
import { AiFab } from '@/components/ai/AiFab';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { SecurityNote } from './SecurityNote';
import { StreakFreezeToast } from '@/components/gamification/StreakFreezeToast';
import { ChatAlertsHost } from '@/components/chat/ChatAlertsHost';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { keyboardOpen } = useVisualViewport();
  // An open conversation owns the whole screen (its composer sits where the tab bar would), and
  // the tab bar must never float above the on-screen keyboard.
  const inChatThread = /^\/chat\/[^/]+/.test(pathname ?? '') && !pathname?.startsWith('/chat/starred');
  const showMobileNav = !keyboardOpen && !inChatThread;

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // With a cached user snapshot (auth-context), `user` is populated before /users/me returns, so
  // a returning visitor renders straight into the shell -- the spinner is only for a genuine cold
  // start (first sign-in on this device, or cleared storage). `!user && !loading` briefly renders
  // nothing while the redirect effect above sends an expired session to /login.
  if (!user) {
    return loading ? (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    ) : null;
  }

  return (
    <div className="flex h-[var(--app-height,100dvh)] flex-col overflow-hidden bg-background">
      {/* Keyboard/screen-reader shortcut past the nav straight to the page content. Visually
          hidden until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-elev-3 focus:outline focus:outline-2 focus:outline-accent"
      >
        تخطَّ إلى المحتوى
      </a>
      {/* Phones: an open conversation is full-screen -- its own header is the top bar (with the
          back button), like a native messenger. */}
      <div className={inChatThread ? 'hidden md:contents' : 'contents'}>
        <TopNavbar />
        <SetDepartmentBanner />
        <PushRequiredBanner />
      </div>
      <main
        id="main-content"
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar-none md:pb-0',
          // Without the tab bar: the keyboard covers the bottom edge, or (open conversation) the
          // composer pads for the home indicator itself.
          showMobileNav ? 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]' : inChatThread || keyboardOpen ? 'pb-0' : 'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        {children}
      </main>
      {showMobileNav && <MobileNav />}
      <AiFab />
      <OnboardingFlow />
      <SecurityNote />
      <StreakFreezeToast />
      <ChatAlertsHost />
    </div>
  );
}
