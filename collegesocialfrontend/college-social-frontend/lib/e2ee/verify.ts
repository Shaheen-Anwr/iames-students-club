// Peer-identity tracking for safety-number verification (docs/e2ee-design.md §8, phase P4).
// Wraps the `/e2ee/keys/:id/identity` endpoint + the local `verify` store: remembers which
// identity key we last saw for a peer, whether the user marked it verified, and flags a change
// (new device -- or a man in the middle).

import { api } from '@/lib/api';
import { exportPublic } from './crypto';
import { getIdentity, getVerification, putVerification } from './store';

export interface PeerIdentityState {
  /** The peer's current identity key (b64 SPKI), or null if they haven't set up E2EE. */
  identityKey: string | null;
  /** True when this differs from the key we had recorded before (and we had one). */
  changed: boolean;
  /** The user has compared safety numbers and marked this key trusted. */
  verified: boolean;
}

/** Our own identity public key (b64 SPKI) for this device, or null if not set up. */
export async function myIdentityKey(): Promise<string | null> {
  const rec = await getIdentity();
  if (!rec) return null;
  return exportPublic(rec.ikPub);
}

/**
 * Fetch the peer's published identity key and reconcile it with what we last stored. A changed
 * key clears the `verified` flag (the user must re-compare). Safe to call on every chat open.
 */
export async function reconcilePeerIdentity(peerId: string): Promise<PeerIdentityState> {
  let identityKey: string | null = null;
  try {
    identityKey = (await api.get<{ identityKey: string }>(`/e2ee/keys/${peerId}/identity`)).identityKey;
  } catch {
    // 404 = peer hasn't enabled E2EE; network error = leave prior state untouched.
    const prior = await getVerification(peerId);
    return { identityKey: prior?.identityKey ?? null, changed: false, verified: !!prior?.verified };
  }

  const prior = await getVerification(peerId);
  if (!prior) {
    await putVerification({ peerId, identityKey, verified: false });
    return { identityKey, changed: false, verified: false };
  }
  if (prior.identityKey !== identityKey) {
    await putVerification({ peerId, identityKey, verified: false });
    return { identityKey, changed: true, verified: false };
  }
  return { identityKey, changed: false, verified: prior.verified };
}

/** Record the user's verify / un-verify decision for the peer's current key. */
export async function setPeerVerified(
  peerId: string,
  identityKey: string,
  verified: boolean,
): Promise<void> {
  await putVerification({ peerId, identityKey, verified });
}
