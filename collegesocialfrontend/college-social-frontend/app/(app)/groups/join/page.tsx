'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useGroups } from '@/lib/groups-context';
import type { StudyGroup } from '@/lib/types';

function JoinByInvite() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('code')?.trim() ?? '';
  const { refresh } = useGroups();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!code) {
      setError('رابط الدعوة غير مكتمل.');
      return;
    }

    (async () => {
      try {
        const group = await api.post<StudyGroup>('/groups/join', { code });
        await refresh();
        router.replace(`/groups/${group._id}`);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'تعذّر الانضمام إلى المجموعة.');
      }
    })();
  }, [code, refresh, router]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link
          href="/groups"
          className="rounded-lg border border-strong bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
        >
          العودة إلى المجموعات
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Spinner className="h-6 w-6" />
      <p className="text-sm text-muted-foreground">جارٍ الانضمام إلى المجموعة…</p>
    </div>
  );
}

export default function JoinGroupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      }
    >
      <JoinByInvite />
    </Suspense>
  );
}
