// Device key setup + upkeep for chat E2EE (docs/e2ee-design.md §3, phase P1).
// Generates the identity + signed prekey + a batch of one-time prekeys, publishes the PUBLIC
// bundle to the server, and persists the PRIVATE halves in IndexedDB. No message crypto here.

import { api } from '@/lib/api';
import {
  e2eeSupported,
  exportPublic,
  generateECDH,
  generateECDSA,
  sign,
  unb64,
} from './crypto';
import {
  countPreKeys,
  getIdentity,
  getSpk,
  putIdentity,
  putPreKey,
  putSpk,
} from './store';

const OPK_BATCH = 100;
const OPK_LOW_WATER = 20;

export interface E2eeStatus {
  enabled: boolean;
  registered: boolean;
  oneTimePreKeysLeft: number;
}

export function isE2eeAvailable(): boolean {
  return process.env.NEXT_PUBLIC_E2EE_ENABLED === '1' && e2eeSupported();
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
    const kp = await generateECDH(false);
    const pub = await exportPublic(kp.publicKey);
    await putPreKey({ keyId, priv: kp.privateKey, pub });
    out.push({ keyId, publicKey: pub });
  }
  return out;
}

/**
 * Make sure this device has a published key bundle. Idempotent: if an identity already exists
 * locally it does nothing (call `resetDevice` to start over). Returns false if E2EE is
 * unavailable (flag off / unsupported browser).
 */
export async function ensureDeviceRegistered(userId: string): Promise<boolean> {
  if (!isE2eeAvailable()) return false;

  const existing = await getIdentity();
  if (existing && existing.userId === userId) {
    void replenishPreKeysIfLow();
    return true;
  }

  // Identity (ECDH for DH, ECDSA for signing the signed-prekey).
  const ik = await generateECDH(false);
  const ikSig = await generateECDSA(false);

  // Signed prekey: an ECDH keypair whose public part is signed by the identity signing key.
  const spkId = Math.floor(Math.random() * 0x7fffffff);
  const spk = await generateECDH(false);
  const spkPub = await exportPublic(spk.publicKey);
  const spkSig = await sign(ikSig.privateKey, unb64(spkPub));

  const opks = await makePreKeys(1, OPK_BATCH);

  await api.post('/e2ee/keys', {
    identityKey: await exportPublic(ik.publicKey),
    identitySig: await exportPublic(ikSig.publicKey),
    signedPreKey: { id: spkId, key: spkPub, sig: spkSig },
    oneTimePreKeys: opks,
  });

  await putIdentity({ userId, ikPriv: ik.privateKey, ikSigPriv: ikSig.privateKey, createdAt: Date.now() });
  await putSpk({ id: spkId, priv: spk.privateKey, pub: spkPub, createdAt: Date.now() });
  return true;
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
