'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Paginated<T> {
  data: T[];
  total: number;
}

/**
 * The fetch half every moderation panel shared (debounced search + page live in `useTableQuery`;
 * this owns the request, an error+retry path the old panels lacked, and optimistic local edits so
 * a delete/patch reflects immediately without a refetch).
 */
export function useAdminList<T extends { _id: string }>(path: string, queryString: string) {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<Paginated<T>>(`${path}?${queryString}`)
      .then((res) => {
        if (cancelled) return;
        setRows(res.data);
        setTotal(res.total);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error('تعذّر تحميل البيانات.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, queryString, reloadKey]);

  const removeLocal = useCallback((ids: string | string[]) => {
    const set = new Set(Array.isArray(ids) ? ids : [ids]);
    setRows((prev) => prev.filter((r) => !set.has(r._id)));
    setTotal((t) => Math.max(0, t - set.size));
  }, []);

  const patchLocal = useCallback((id: string, patch: Partial<T>) => {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  }, []);

  return {
    rows,
    setRows,
    total,
    loading,
    error,
    retry: () => setReloadKey((k) => k + 1),
    removeLocal,
    patchLocal,
  };
}
