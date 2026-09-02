'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Column, Density } from './types';

const DENSITY_KEY = 'admin:density';

/** Density (persisted across the whole console) + per-table column visibility. */
export function useColumnPrefs<T>(columns: Column<T>[]) {
  const [density, setDensityState] = useState<Density>('comfortable');

  useEffect(() => {
    try {
      const d = localStorage.getItem(DENSITY_KEY);
      if (d === 'compact' || d === 'comfortable') setDensityState(d);
    } catch {
      /* ignore */
    }
  }, []);

  function setDensity(d: Density) {
    setDensityState(d);
    try {
      localStorage.setItem(DENSITY_KEY, d);
    } catch {
      /* ignore */
    }
  }

  const defaultVisible = useMemo(
    () => new Set(columns.filter((c) => !c.defaultHidden).map((c) => c.id)),
    // Column ids are stable; recomputing only when the set of ids changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns.map((c) => c.id).join(',')],
  );
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(defaultVisible);

  return { density, setDensity, visibleColumnIds, setVisibleColumnIds };
}
