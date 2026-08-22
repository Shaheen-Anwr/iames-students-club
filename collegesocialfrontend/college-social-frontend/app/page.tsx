'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Spinner } from '@/components/ui/Spinner';

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else {
      router.replace('/home');
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Spinner className="h-8 w-8 text-white" />
    </div>
  );
}
