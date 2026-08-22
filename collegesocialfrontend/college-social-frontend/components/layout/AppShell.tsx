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
      <TopNavbar />
      <VerifyEmailBanner />
      <SetDepartmentBanner />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>
      <MobileNav />
      <AiFab />
    </div>
  );
}
