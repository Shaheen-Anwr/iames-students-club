'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Spinner } from '@/components/ui/Spinner';
import { AdminStatsProvider } from '@/components/admin/AdminStatsProvider';
import { ConsoleUiProvider } from '@/components/admin/console/ConsoleUiContext';
import { AdminConsoleShell } from '@/components/admin/console/AdminConsoleShell';

/**
 * The console frame for every /admin/* route. Role gate lives here (once) — child pages assume an
 * admin is present. The Users section is additionally super-admin-only (its route redirects, and
 * the backend SuperAdminGuard enforces regardless).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.role !== 'admin') router.replace('/feed');
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'admin') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <AdminStatsProvider>
      <ConsoleUiProvider>
        <AdminConsoleShell>{children}</AdminConsoleShell>
      </ConsoleUiProvider>
    </AdminStatsProvider>
  );
}
