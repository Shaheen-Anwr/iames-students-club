'use client';

import { QueryClient, useQuery, type UseQueryOptions } from '@tanstack/react-query';
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
