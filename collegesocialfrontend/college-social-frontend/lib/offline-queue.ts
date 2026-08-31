'use client';

// A tiny IndexedDB-backed outbox for writes that should survive going offline (attendance marks,
// wall likes/comments -- things the UI already updated optimistically). A queued request is
// replayed verbatim when connectivity returns; a 4xx on replay is treated as "give up" (a stale
// request that will never succeed) and dropped, anything else is kept for the next flush.
//
// Deliberately dependency-free (no `idb`) and scoped to fire-and-forget-ish POSTs -- the caller
// gets `{ queued: true }` back instead of the real response, so only use api.postQueued() where
// the response body isn't needed.

import Cookies from 'js-cookie';

const DB = 'iaems-offline';
const STORE = 'outbox';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';
const TOKEN_COOKIE = 'college_social_token';

export interface OutboxItem {
  id?: number;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  label: string;
  ts: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

const listeners = new Set<(count: number) => void>();
function emit(count: number) {
  listeners.forEach((l) => l(count));
}

/** Subscribe to the pending-count (for a "N changes waiting" pill). Returns an unsubscribe. */
export function onOutboxChange(fn: (count: number) => void): () => void {
  listeners.add(fn);
  void countOutbox().then(fn).catch(() => {});
  return () => listeners.delete(fn);
}

export async function countOutbox(): Promise<number> {
  try {
    return await tx<number>('readonly', (s) => s.count());
  } catch {
    return 0;
  }
}

export async function enqueue(item: Omit<OutboxItem, 'id' | 'ts'>): Promise<void> {
  try {
    await tx('readwrite', (s) => s.add({ ...item, ts: Date.now() }));
    emit(await countOutbox());
  } catch {
    /* IndexedDB unavailable (private mode / disabled) -- the write is simply lost, same as today */
  }
}

async function allItems(): Promise<OutboxItem[]> {
  try {
    return await tx<OutboxItem[]>('readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>);
  } catch {
    return [];
  }
}

async function remove(id: number): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    /* noop */
  }
}

let flushing = false;

/** Replay every queued write. Safe to call repeatedly; no-ops while offline or already running. */
export async function flushOutbox(): Promise<void> {
  if (flushing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  flushing = true;
  try {
    const items = await allItems();
    for (const item of items) {
      const token = Cookies.get(TOKEN_COOKIE);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      try {
        const res = await fetch(`${API_BASE}${item.path}`, {
          method: item.method,
          headers,
          credentials: 'include',
          body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
        });
        // 2xx -> done. 4xx -> a stale/invalid request that will never succeed; drop it.
        // 5xx / network -> keep for the next flush.
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          if (item.id != null) await remove(item.id);
        } else {
          break;
        }
      } catch {
        break; // network died mid-flush
      }
    }
    emit(await countOutbox());
  } finally {
    flushing = false;
  }
}

let started = false;

/** Wire up auto-flush on reconnect + a slow retry loop. Call once, app-wide. */
export function initOfflineQueue(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => void flushOutbox());
  void flushOutbox();
  setInterval(() => {
    void countOutbox().then((n) => {
      if (n > 0) void flushOutbox();
    });
  }, 60_000);
}
