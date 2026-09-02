'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useRawQuery } from '@/lib/query';
import type { AdminStats } from '@/lib/types';

interface NeedsAttention {
  pendingVerifications: number;
  unansweredQuestions: number;
  overdueAssignments: number;
}

interface AdminStatsContextValue {
  stats: AdminStats | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  needsAttention: NeedsAttention;
}

const AdminStatsContext = createContext<AdminStatsContextValue | null>(null);

/**
 * One `GET /api/admin/stats` for the whole console (polled every 60s), shared by the overview
 * dashboard, the user-stats / AI / notifications pages and the sidebar badges — instead of each
 * of those firing its own request the way the old panels did.
 */
export function AdminStatsProvider({ children }: { children: ReactNode }) {
  const query = useRawQuery<AdminStats>(['admin-stats'], '/admin/stats', {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const value = useMemo<AdminStatsContextValue>(() => {
    const s = query.data;
    return {
      stats: s,
      isLoading: query.isPending,
      error: (query.error as Error) ?? null,
      refetch: () => void query.refetch(),
      needsAttention: {
        pendingVerifications: s ? Math.max(0, s.users.total - s.users.verified) : 0,
        unansweredQuestions: s?.qa.unanswered ?? 0,
        overdueAssignments: s?.assignments.overdue ?? 0,
      },
    };
  }, [query.data, query.isPending, query.error, query.refetch]);

  return <AdminStatsContext.Provider value={value}>{children}</AdminStatsContext.Provider>;
}

export function useAdminStats(): AdminStatsContextValue {
  const ctx = useContext(AdminStatsContext);
  if (!ctx) throw new Error('useAdminStats must be used within <AdminStatsProvider>');
  return ctx;
}
