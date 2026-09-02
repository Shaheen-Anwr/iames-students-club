'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/admin/ui/PageHeader';
import { AdminUsersPanel } from '@/components/admin/AdminPanel';

// Account management — super-admin only (the backend SuperAdminGuard enforces regardless).
export default function AdminUsersPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !user.isSuperAdmin) router.replace('/admin');
  }, [user, router]);

  if (!user || !user.isSuperAdmin) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        icon={Users}
        title="المستخدمون"
        description="الأدوار، تفعيل الحسابات، توثيق البريد، وكلمات المرور."
      />
      <AdminUsersPanel />
    </>
  );
}
