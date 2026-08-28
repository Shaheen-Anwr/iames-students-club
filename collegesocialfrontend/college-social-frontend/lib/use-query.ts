'use client';

// Minimal stale-while-revalidate cache for GET reads, plus an optimistic-write entry point.
//
// Why not TanStack Query / SWR: this box is memory-constrained and the app ships zero data-
// fetching deps today. This is a deliberately small stand-in (~100 lines) with the same shape
// -- useQuery(key, fetcher) + mutate(key, updater) -- so call sites can migrate to the real
// thing later with a near-mechanical find-and-replace. It gives the three things the roadmap's
// "client cache" item is actually for:
//   1. instant paint from cache on back-navigation (no spinner on a screen you just left)
//   2. request dedupe -- N components asking for the same key share one in-flight request
//   3. optimistic updates -- mutate() writes the cache and every consumer re-renders now
//
// Not covered (by design): pagination helpers, cache eviction/GC, focus/reconnect refetch,
// SSR hydration. Reach for a real library before adding those.

import { useCallback, useEffect, useRef, useState } from 'react';

type Entry<T> = { data?: T; error?: unknown; ts: number; promise?: Promise<T> };

const cache = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();

const DEFAULT_STALE_MS = 30_000;

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function subscribe(key: string, l: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(l);
  return () => {
    set!.delete(l);
    if (set!.size === 0) listeners.delete(key);
  };
}

function runFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = cache.get(key) as Entry<T> | undefined;
  if (existing?.promise) return existing.promise;

  const promise = fetcher().then(
    (data) => {
      cache.set(key, { data, ts: Date.now() });
      emit(key);
      return data;
    },
    (error) => {
      const prev = cache.get(key) as Entry<T> | undefined;
      cache.set(key, { data: prev?.data, error, ts: Date.now() });
      emit(key);
      throw error;
    },
  );

  cache.set(key, { ...(existing ?? { ts: 0 }), promise });
  return promise;
}

/** Read a cached value without subscribing (e.g. from an event handler). */
export function getCached<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined;
}

/**
 * Overwrite or patch a cached value and re-render every consumer immediately -- the optimistic-
 * update path. Pass `{ revalidate, fetcher }` to also kick a background refetch that reconciles
 * with the server (and rolls the optimistic value back if it rejects).
 */
export function mutate<T>(
  key: string,
  update: T | ((prev: T | undefined) => T),
  opts: { revalidate?: boolean; fetcher?: () => Promise<T> } = {},
) {
  const prev = cache.get(key)?.data as T | undefined;
  const next =
    typeof update === 'function' ? (update as (p: T | undefined) => T)(prev) : update;
  cache.set(key, { data: next, ts: Date.now() });
  emit(key);
  if (opts.revalidate && opts.fetcher) {
    void runFetch(key, opts.fetcher).catch(() => {
      // reconcile failed -- restore what we had before the optimistic write
      cache.set(key, { data: prev, ts: Date.now() });
      emit(key);
    });
  }
}

/** Drop every cached entry whose key starts with `prefix` (default: all) so it refetches next read. */
export function invalidate(prefix = '') {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      emit(key);
    }
  }
}

export interface UseQueryResult<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  isValidating: boolean;
  refetch: () => Promise<T | undefined>;
}

/**
 * Subscribe to a cached GET. `key` doubles as the cache identity -- use the request path, e.g.
 * `useQuery('users/suggestions', () => api.get('/users/suggestions'))`. Pass `key = null` to
 * hold off (e.g. until the user is known); while held, `isLoading` stays true.
 */
export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: { staleTime?: number } = {},
): UseQueryResult<T> {
  const staleTime = opts.staleTime ?? DEFAULT_STALE_MS;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [, forceRender] = useState(0);
  useEffect(() => {
    if (key == null) return;
    return subscribe(key, () => forceRender((n) => n + 1));
  }, [key]);

  useEffect(() => {
    if (key == null) return;
    const entry = cache.get(key);
    const fresh = !!entry && entry.data !== undefined && Date.now() - entry.ts < staleTime;
    if (!fresh && !entry?.promise) {
      void runFetch(key, () => fetcherRef.current()).catch(() => {});
    }
  }, [key, staleTime]);

  const entry = key != null ? (cache.get(key) as Entry<T> | undefined) : undefined;

  const refetch = useCallback(() => {
    if (key == null) return Promise.resolve<T | undefined>(undefined);
    return runFetch(key, () => fetcherRef.current()).catch(() => undefined);
  }, [key]);

  return {
    data: entry?.data,
    error: entry?.error,
    isLoading: entry?.data === undefined && !entry?.error,
    isValidating: !!entry?.promise,
    refetch,
  };
}
