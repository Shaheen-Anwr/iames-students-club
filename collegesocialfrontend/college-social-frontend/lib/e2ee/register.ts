// Device key setup + upkeep for chat E2EE (docs/e2ee-design.md §3, phases P1 + P6).
// Generates the identity + signed prekey + a batch of one-time prekeys, publishes the PUBLIC
// bundle to the server, and persists the PRIVATE halves in IndexedDB. No message crypto here.

import { api } from '@/lib/api';
import { e2eeSupported, exportPublic, generateECDH, generateECDSA, sign, unb64 } from './crypto';
import { countPreKeys, getIdentity, getSpk, putIdentity, putPreKey, putSpk, wipeE2ee } from './store';

const OPK_BATCH = 100;
const OPK_LOW_WATER = 20;

export interface E2eeStatus {
  enabled: boolean;
  registered: boolean;
  oneTimePreKeysLeft: number;
  hasBackup: boolean;
}

export interface BackupInfo {
  blob: string | null;
  updatedAt: string | null;
}

/** Outcome of a device-registration attempt. `needs-restore` = keys exist elsewhere, don't rotate. */
export type DeviceRegState = 'unavailable' | 'ready' | 'created' | 'needs-restore';

export function isE2eeAvailable(): boolean {
  return process.env.NEXT_PUBLIC_E2EE_ENABLED === '1' && e2eeSupported();
}

// Per-device opt-out. E2EE is on by default wherever it's available; a user can disable it on a
// given device (e.g. a shared computer) from profile settings. Existing encrypted conversations
// then can't be read on this device until it's re-enabled -- the toggle spells that out.
const DEVICE_PREF_KEY = 'e2ee:device-disabled';

export function isE2eeEnabledOnThisDevice(): boolean {
  if (!isE2eeAvailable()) return false;
  try {
    return localStorage.getItem(DEVICE_PREF_KEY) !== '1';
  } catch {
    return true;
  }
}

export function setE2eeEnabledOnThisDevice(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(DEVICE_PREF_KEY);
    else localStorage.setItem(DEVICE_PREF_KEY, '1');
  } catch {
    /* private mode -- nothing we can do, treat as enabled */
  }
}

export function fetchStatus(): Promise<E2eeStatus> {
  return api.get<E2eeStatus>('/e2ee/status');
}

interface PreKeyUpload {
  keyId: number;
  publicKey: string;
}

async function makePreKeys(startId: number, count: number): Promise<PreKeyUpload[]> {
  const out: PreKeyUpload[] = [];
  for (let i = 0; i < count; i++) {
    const keyId = startId + i;
    const kp = await generateECDH(false); // one-time prekeys stay non-extractable
    const pub = await exportPublic(kp.publicKey);
    await putPreKey({ keyId, priv: kp.privateKey, pub });
    out.push({ keyId, publicKey: pub });
  }
  return out;
}

// Generate a fresh signed prekey + one-time prekey batch for an existing identity and publish the
// whole bundle. Persists the new signed-prekey privately. Used by first-run registration and by
// post-restore republish.
async function publishBundle(
  userId: string,
  identity: { ikPub: CryptoKey; ikSigPriv: CryptoKey; ikSigPub: CryptoKey },
): Promise<void> {
  const spkId = Math.floor(Math.random() * 0x7fffffff);
  const spk = await generateECDH(true); // extractable so it can go into a key backup
  const spkPub = await exportPublic(spk.publicKey);
  const spkSig = await sign(identity.ikSigPriv, unb64(spkPub));
  const opks = await makePreKeys(1, OPK_BATCH);

  await api.post('/e2ee/keys', {
    identityKey: await exportPublic(identity.ikPub),
    identitySig: await exportPublic(identity.ikSigPub),
    signedPreKey: { id: spkId, key: spkPub, sig: spkSig },
    oneTimePreKeys: opks,
  });
  await putSpk({ id: spkId, priv: spk.privateKey, pub: spkPub, createdAt: Date.now() });
}

async function generateAndPublish(userId: string): Promise<void> {
  const ik = await generateECDH(true); // extractable -> can be backed up (P6)
  const ikSig = await generateECDSA(true);
  await putIdentity({
    userId,
    ikPriv: ik.privateKey,
    ikPub: ik.publicKey,
    ikSigPriv: ikSig.privateKey,
    ikSigPub: ikSig.publicKey,
    createdAt: Date.now(),
  });
  await publishBundle(userId, { ikPub: ik.publicKey, ikSigPriv: ikSig.privateKey, ikSigPub: ikSig.publicKey });
}

/**
 * Make sure this device has a published key bundle.
 *  - local identity already here      -> 'ready' (tops up prekeys)
 *  - server says we're registered      -> 'needs-restore' (keys are elsewhere; never rotate silently)
 *  - genuinely first time              -> generate + publish, 'created'
 */
export async function ensureDeviceRegistered(userId: string): Promise<DeviceRegState> {
  if (!isE2eeAvailable()) return 'unavailable';

  const existing = await getIdentity();
  if (existing && existing.userId === userId) {
    void replenishPreKeysIfLow();
    return 'ready';
  }

  try {
    const status = await fetchStatus();
    if (status.registered) return 'needs-restore';
  } catch {
    /* status unreachable -- treat as first run */
  }

  await generateAndPublish(userId);
  return 'created';
}

/** "Start fresh" after a lost backup: wipe local keys and publish a brand-new identity. */
export async function forceCreateIdentity(userId: string): Promise<void> {
  if (!isE2eeAvailable()) return;
  await wipeE2ee();
  await generateAndPublish(userId);
}

/**
 * After `restoreBackup` has put the identity (+ old signed prekey) back into IndexedDB, publish a
 * fresh signed prekey + one-time prekey pool under that SAME identity, so new conversations work
 * and the server's prekey pool has privates we actually hold. The identity key is unchanged, so
 * contacts see no "security code changed".
 */
export async function republishAfterRestore(userId: string): Promise<void> {
  const id = await getIdentity();
  if (!id || id.userId !== userId) throw new Error('E2EE: restore did not leave a usable identity');
  await publishBundle(userId, { ikPub: id.ikPub, ikSigPriv: id.ikSigPriv, ikSigPub: id.ikSigPub });
}

/** Top up the server's one-time prekey pool when it (or our local pool) runs low. */
export async function replenishPreKeysIfLow(): Promise<void> {
  if (!isE2eeAvailable()) return;
  try {
    const status = await fetchStatus();
    if (!status.registered) return;
    if (status.oneTimePreKeysLeft > OPK_LOW_WATER) return;

    const localCount = await countPreKeys();
    const startId = localCount + Math.floor(Date.now() / 1000); // avoid id collisions across batches
    const opks = await makePreKeys(startId, OPK_BATCH);
    await api.post('/e2ee/keys/prekeys', { oneTimePreKeys: opks });
  } catch {
    /* best-effort upkeep */
  }
}

/** Local sanity check for the UI: do we hold a usable identity + signed prekey on this device? */
export async function hasLocalKeys(): Promise<boolean> {
  const [id, spk] = await Promise.all([getIdentity(), getSpk()]);
  return !!id && !!spk;
}

// --- server-stored passphrase backup (P6) -----------------------------------------------------
export function fetchServerBackup(): Promise<BackupInfo> {
  return api.get<BackupInfo>('/e2ee/backup');
}
export function putServerBackup(blob: string): Promise<{ updatedAt: string }> {
  return api.put<{ updatedAt: string }>('/e2ee/backup', { blob });
}
export function deleteServerBackup(): Promise<{ ok: boolean }> {
  return api.delete<{ ok: boolean }>('/e2ee/backup');
}
