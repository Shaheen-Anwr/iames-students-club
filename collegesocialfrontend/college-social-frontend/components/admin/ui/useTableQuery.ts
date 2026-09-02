'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type SortDir = 'asc' | 'desc';
export interface TableSort {
  id: string;
  dir: SortDir;
}

interface UseTableQueryOpts {
  /** Rows per page for the outgoing `limit=` param. */
  limit?: number;
  /** Initial sort when the URL carries none. */
  defaultSort?: TableSort;
  /** Extra URL params this table owns (filter chips) — read back, mirrored into the fetch query. */
  filterKeys?: string[];
}

/**
 * Single source of truth for a console table's `{ page, search, sort, ...filters }`, kept in the
 * URL (`router.replace`, no scroll jump) so refresh / back-button / shared links all work. The
 * copy-pasted debounce + `setPage(1)` blocks in every Admin*Panel collapse into this.
 *
 * `queryString` is what the panel appends to its API path (`page`, `limit`, `search`, filters —
 * NOT `sort`/`dir`, which the backend can't take; DataTable sorts the current page client-side).
 */
export function useTableQuery({ limit = 20, defaultSort, filterKeys = [] }: UseTableQueryOpts = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const page = Math.max(1, Number(sp.get('page')) || 1);
  const search = sp.get('search') ?? '';
  const sort: TableSort | null = sp.get('sort')
    ? { id: sp.get('sort')!, dir: (sp.get('dir') as SortDir) === 'desc' ? 'desc' : 'asc' }
    : (defaultSort ?? null);

  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of filterKeys) {
      const v = sp.get(k);
      if (v != null) out[k] = v;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, filterKeys.join(',')]);

  const commit = useCallback(
    (mut: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(Array.from(sp.entries()));
      mut(p);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, pathname, router],
  );

  // Local search box state, debounced into the URL. Reset page on every term change.
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    setSearchInput(search);
  }, [search]);
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === search) return;
    const h = setTimeout(() => {
      commit((p) => {
        if (trimmed) p.set('search', trimmed);
        else p.delete('search');
        p.delete('page');
      });
    }, 300);
    return () => clearTimeout(h);
  }, [searchInput, search, commit]);

  const setPage = useCallback(
    (next: number) => commit((p) => (next <= 1 ? p.delete('page') : p.set('page', String(next)))),
    [commit],
  );

  const toggleSort = useCallback(
    (id: string) =>
      commit((p) => {
        const curId = p.get('sort');
        const curDir = p.get('dir');
        if (curId !== id) {
          p.set('sort', id);
          p.set('dir', 'asc');
        } else if (curDir !== 'desc') {
          p.set('dir', 'desc');
        } else {
          p.delete('sort');
          p.delete('dir');
        }
      }),
    [commit],
  );

  const setFilter = useCallback(
    (key: string, value: string | null) =>
      commit((p) => {
        if (value == null || value === '') p.delete(key);
        else p.set(key, value);
        p.delete('page');
      }),
    [commit],
  );

  const queryString = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) p.set('search', search);
    for (const [k, v] of Object.entries(filters)) p.set(k, v);
    return p.toString();
  }, [page, limit, search, filters]);

  return {
    page,
    setPage,
    search,
    searchInput,
    setSearchInput,
    sort,
    toggleSort,
    filters,
    setFilter,
    limit,
    queryString,
  };
}
