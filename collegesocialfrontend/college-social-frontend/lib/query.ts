'use client';

import { useMemo } from 'react';
import {
  QueryClient,
  useInfiniteQuery,
  useQuery,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { apiGet, type GetPath } from './api-typed';
import { api } from './api';

// One QueryClient per browser session (created in Providers.tsx). Defaults tuned for this app:
// data is "fresh" for 30s (route re-entry within that window paints from cache instantly, no
// refetch), kept 5min after unmount, one retry, and no refetch-on-focus (the app polls the
// things that need it explicitly).
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T, unknown[]>, 'queryKey' | 'queryFn'> & {
  /** Override the cache key (default `[path]`). Use when the same path is parameterised. */
  key?: unknown[];
};

/**
 * Typed GET query. Path is validated against the generated OpenAPI paths (see lib/api-typed);
 * `?query` suffix allowed. Replaces the `useEffect` + `useState(loading)` + `setInterval` triad.
 *
 *   const { data, isPending } = useApiQuery<'/rooms', StudyRoomListItem[]>('/rooms', {
 *     refetchInterval: 10_000,
 *   });
 */
export function useApiQuery<P extends GetPath, T>(path: P | `${P}?${string}`, opts?: QueryOpts<T>) {
  return useQuery<T, Error, T, unknown[]>({
    queryKey: opts?.key ?? [path],
    queryFn: () => apiGet<P, T>(path),
    ...opts,
  });
}

/** Same, for an arbitrary (not-yet-typed) path — falls back to the untyped `api.get`. */
export function useRawQuery<T>(key: unknown[], path: string, opts?: QueryOpts<T>) {
  return useQuery<T, Error, T, unknown[]>({
    queryKey: key,
    queryFn: () => api.get<T>(path),
    ...opts,
  });
}

/**
 * Offset-paginated infinite list, matching this app's REST convention: `GET <path>?page=N&limit=M`
 * returning a bare `T[]`, with "there is more" inferred from a full-size page. Replaces the
 * `useState(posts)` + `page` + `hasMore` + `loadingMore` + IntersectionObserver boilerplate.
 *
 *   const { items, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
 *     useInfiniteApiList<Post>('/posts/saved', { key: ['saved-posts'], pageSize: 10 });
 *
 * `path` may already carry query params (`/posts?scope=dept`); the pager appends with the right
 * separator. Put every param that changes the result set into `key` so switching filters refetches.
 */
export function useInfiniteApiList<T>(
  path: string,
  opts?: { key?: unknown[]; pageSize?: number; enabled?: boolean },
) {
  const pageSize = opts?.pageSize ?? 10;
  const query = useInfiniteQuery<T[], Error, { pages: T[][] }, unknown[], number>({
    queryKey: opts?.key ?? [path],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const sep = path.includes('?') ? '&' : '?';
      return api.get<T[]>(`${path}${sep}page=${pageParam}&limit=${pageSize}`);
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === pageSize ? allPages.length + 1 : undefined,
    enabled: opts?.enabled,
  });

  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  return { ...query, items };
}

/**
 * Keyset ("cursor") infinite list. The endpoint takes `?before=<cursor>` (empty on the first
 * page) + `?limit=M` and returns `{ items: T[]; nextCursor: string | null }`. Same public shape
 * as useInfiniteApiList (`items`, `fetchNextPage`, `hasNextPage`, ...), but the page boundary is
 * an opaque server cursor rather than a page number -- O(log n) at any scroll depth. Used by the
 * feed and the wall.
 */
export function useCursorInfiniteList<T>(
  path: string,
  opts?: { key?: unknown[]; pageSize?: number; enabled?: boolean },
) {
  const pageSize = opts?.pageSize ?? 10;
  type Page = { items: T[]; nextCursor: string | null };
  const query = useInfiniteQuery<Page, Error, { pages: Page[] }, unknown[], string | null>({
    queryKey: opts?.key ?? [path],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const sep = path.includes('?') ? '&' : '?';
      const before = pageParam == null ? '' : encodeURIComponent(pageParam);
      const res = await api.get<Page | T[]>(`${path}${sep}before=${before}&limit=${pageSize}`);
      // Tolerate an endpoint that still returns a bare array -- e.g. a backend not yet redeployed
      // with keyset support. Degrade to a single terminal page rather than crashing the list.
      if (Array.isArray(res)) return { items: res, nextCursor: null };
      return { items: Array.isArray(res?.items) ? res.items : [], nextCursor: res?.nextCursor ?? null };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: opts?.enabled,
  });

  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.items ?? []).filter(Boolean) as T[],
    [query.data],
  );
  return { ...query, items };
}
