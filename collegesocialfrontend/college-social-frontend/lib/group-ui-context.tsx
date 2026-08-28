'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type GroupUiValue = {
  /** desktop: channel sidebar collapsed to a sliver */
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** mobile: channel sidebar shown as a slide-in drawer */
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const GroupUiContext = createContext<GroupUiValue | null>(null);
const STORAGE_KEY = 'groups:sidebar-collapsed';

export function GroupUiProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* private mode / disabled storage */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, drawerOpen, openDrawer, closeDrawer }),
    [collapsed, toggleCollapsed, drawerOpen, openDrawer, closeDrawer],
  );

  return <GroupUiContext.Provider value={value}>{children}</GroupUiContext.Provider>;
}

export function useGroupUi() {
  const ctx = useContext(GroupUiContext);
  if (!ctx) throw new Error('useGroupUi must be used within a GroupUiProvider');
  return ctx;
}
