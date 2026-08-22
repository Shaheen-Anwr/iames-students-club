'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { StudyGroup } from '@/lib/types';

interface GroupsContextValue {
  groups: StudyGroup[];
  loading: boolean;
  refresh: () => Promise<void>;
  findGroup: (id: string) => StudyGroup | undefined;
  addGroup: (group: StudyGroup) => void;
}

const GroupsContext = createContext<GroupsContextValue | null>(null);

// Scoped to app/(app)/groups/layout.tsx, same placement pattern as ChatProvider (which is
// scoped to app/(app)/chat/layout.tsx, not mounted globally) -- both are only ever rendered
// once AppShell has already confirmed a logged-in user.
export function GroupsProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api.get<StudyGroup[]>('/groups');
    setGroups(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const findGroup = useCallback((id: string) => groups.find((g) => g._id === id), [groups]);

  const addGroup = useCallback((group: StudyGroup) => {
    setGroups((prev) => (prev.some((g) => g._id === group._id) ? prev : [group, ...prev]));
  }, []);

  return (
    <GroupsContext.Provider value={{ groups, loading, refresh, findGroup, addGroup }}>{children}</GroupsContext.Provider>
  );
}

export function useGroups() {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error('useGroups must be used within GroupsProvider');
  return ctx;
}
