// IndexedDB store for E2EE key material (docs/e2ee-design.md §4/§7). Origin-isolated per artifact
// domain; survives reloads, not a cleared "site data". Private keys are kept as non-extractable
// CryptoKey objects where possible (identity + prekeys); symmetric ratchet material is raw bytes
// (HKDF/HMAC output can't be non-extractable).
//
// Stores:
//   meta      -- { key: 'identity', userId, ikPriv (CryptoKey), ikSigPriv (CryptoKey), createdAt }
//                { key: 'spk',      id, priv (CryptoKey), pub (b64), createdAt }
//   prekeys   -- keyId -> { priv (CryptoKey), pub (b64) }        one-time prekey privates
//   sessions  -- conversationId -> serialized Double Ratchet state (see ratchet.ts)

const DB_NAME = 'iaems-e2ee';
const DB_VERSION = 1;

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('prekeys')) d.createObjectStore('prekeys', { keyPath: 'keyId' });
      if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'conversationId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// --- identity -----------------------------------------------------------------------------------
export interface IdentityRecord {
  key: 'identity';
  userId: string;
  ikPriv: CryptoKey;
  ikPub: CryptoKey; // stored -- a non-extractable private can't re-derive its public
  ikSigPriv: CryptoKey;
  ikSigPub: CryptoKey;
  createdAt: number;
}
export function putIdentity(rec: Omit<IdentityRecord, 'key'>): Promise<unknown> {
  return tx('meta', 'readwrite', (s) => s.put({ key: 'identity', ...rec }));
}
export function getIdentity(): Promise<IdentityRecord | undefined> {
  return tx<IdentityRecord | undefined>('meta', 'readonly', (s) => s.get('identity'));
}

// --- signed prekey ---------------------------------------------------------------------------
export interface SpkRecord {
  key: 'spk';
  id: number;
  priv: CryptoKey;
  pub: string;
  createdAt: number;
}
export function putSpk(rec: Omit<SpkRecord, 'key'>): Promise<unknown> {
  return tx('meta', 'readwrite', (s) => s.put({ key: 'spk', ...rec }));
}
export function getSpk(): Promise<SpkRecord | undefined> {
  return tx<SpkRecord | undefined>('meta', 'readonly', (s) => s.get('spk'));
}

// --- one-time prekeys ----------------------------------------------------------------------
export interface PreKeyRecord {
  keyId: number;
  priv: CryptoKey;
  pub: string;
}
export function putPreKey(rec: PreKeyRecord): Promise<unknown> {
  return tx('prekeys', 'readwrite', (s) => s.put(rec));
}
export function getPreKey(keyId: number): Promise<PreKeyRecord | undefined> {
  return tx<PreKeyRecord | undefined>('prekeys', 'readonly', (s) => s.get(keyId));
}
export function deletePreKey(keyId: number): Promise<unknown> {
  return tx('prekeys', 'readwrite', (s) => s.delete(keyId));
}
export function countPreKeys(): Promise<number> {
  return tx<number>('prekeys', 'readonly', (s) => s.count());
}

// --- ratchet sessions ----------------------------------------------------------------------
export function putSession(conversationId: string, state: unknown): Promise<unknown> {
  return tx('sessions', 'readwrite', (s) => s.put({ conversationId, state }));
}
export function getSession<T = unknown>(conversationId: string): Promise<T | undefined> {
  return tx<{ conversationId: string; state: T } | undefined>('sessions', 'readonly', (s) =>
    s.get(conversationId),
  ).then((r) => r?.state);
}
export function deleteSession(conversationId: string): Promise<unknown> {
  return tx('sessions', 'readwrite', (s) => s.delete(conversationId));
}

/** Nuke everything -- used on logout / "reset encryption on this device". */
export async function wipeE2ee(): Promise<void> {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction(['meta', 'prekeys', 'sessions'], 'readwrite');
    t.objectStore('meta').clear();
    t.objectStore('prekeys').clear();
    t.objectStore('sessions').clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
