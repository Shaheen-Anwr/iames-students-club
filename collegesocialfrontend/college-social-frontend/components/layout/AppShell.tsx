'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Spinner } from '@/components/ui/Spinner';
import { VerifyEmailBanner } from '@/components/auth/VerifyEmailBanner';
import { SetDepartmentBanner } from './SetDepartmentBanner';
import { TopNavbar } from './TopNavbar';
import { MobileNav } from './MobileNav';
import { AiFab } from '@/components/ai/AiFab';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* Keyboard/screen-reader shortcut past the nav straight to the page content. Visually
          hidden until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-elev-3 focus:outline focus:outline-2 focus:outline-accent"
      >
        تخطَّ إلى المحتوى
      </a>
      <TopNavbar />
      <VerifyEmailBanner />
      <SetDepartmentBanner />
      <main
        id="main-content"
        className="flex min-h-0 flex-1 flex-col  overflow-y-auto overflow-x-hidden scrollbar-none pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0"
      >
        {children}
      </main>
      <MobileNav />
      <AiFab />
      <OnboardingFlow />
    </div>
  );
}
