'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { GroupListItem, StudyGroup } from '@/lib/types';

interface GroupsContextValue {
  /** Groups the current user has joined -- powers the detail sidebar, channel windows, etc. */
  groups: StudyGroup[];
  loading: boolean;
  /** Every group in the app (public + private), for the unified /groups explorer list. */
  allGroups: GroupListItem[];
  allLoading: boolean;
  refresh: () => Promise<void>;
  refreshAll: () => Promise<void>;
  findGroup: (id: string) => StudyGroup | undefined;
  addGroup: (group: StudyGroup) => void;
  /** Replace an already-joined group in place (after an owner edit / photo change). */
  updateGroup: (group: StudyGroup) => void;
  /** Drop a group locally (after it's deleted or left). */
  removeGroup: (id: string) => void;
}

const GroupsContext = createContext<GroupsContextValue | null>(null);

// Scoped to app/(app)/groups/layout.tsx, same placement pattern as ChatProvider (which is
// scoped to app/(app)/chat/layout.tsx, not mounted globally) -- both are only ever rendered
// once AppShell has already confirmed a logged-in user.
export function GroupsProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [allGroups, setAllGroups] = useState<GroupListItem[]>([]);
  const [allLoading, setAllLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<StudyGroup[]>('/groups');
      setGroups(data);
    } catch (err) {
      console.error('Failed to load groups', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const data = await api.get<GroupListItem[]>('/groups/all');
      setAllGroups(data);
    } catch (err) {
      console.error('Failed to load all groups', err);
    } finally {
      setAllLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshAll();
  }, [refresh, refreshAll]);

  const findGroup = useCallback((id: string) => groups.find((g) => g._id === id), [groups]);

  const addGroup = useCallback(
    (group: StudyGroup) => {
      setGroups((prev) => (prev.some((g) => g._id === group._id) ? prev : [group, ...prev]));
      // A freshly created / joined group should also show up (as "joined") in the explorer.
      void refreshAll();
    },
    [refreshAll],
  );

  const updateGroup = useCallback(
    (group: StudyGroup) => {
      setGroups((prev) => prev.map((g) => (g._id === group._id ? group : g)));
      void refreshAll();
    },
    [refreshAll],
  );

  const removeGroup = useCallback(
    (id: string) => {
      setGroups((prev) => prev.filter((g) => g._id !== id));
      void refreshAll();
    },
    [refreshAll],
  );

  return (
    <GroupsContext.Provider
      value={{ groups, loading, allGroups, allLoading, refresh, refreshAll, findGroup, addGroup, updateGroup, removeGroup }}
    >
      {children}
    </GroupsContext.Provider>
  );
}

export function useGroups() {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error('useGroups must be used within GroupsProvider');
  return ctx;
}
