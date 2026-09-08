// Real bindings for the E2EE session bridge: SessionDeps backed by IndexedDB (store.ts) + the
// /api/e2ee key registry. Import `e2eeSession` from here; the pure protocol lives in session-core.

import { api } from '@/lib/api';
import { importECDHPublic } from './crypto';
import { createSessionManager, type SessionDeps, type SessionManager } from './session-core';
import type { RatchetState } from './ratchet';
import type { PeerBundle } from './x3dh';
import { deletePreKey, getIdentity, getPreKey, getSession, getSpk, putSession } from './store';

export type { SessionDeps, SessionManager } from './session-core';
export { createSessionManager } from './session-core';

const realDeps: SessionDeps = {
  loadState: (id) => getSession<RatchetState>(id),
  saveState: (id, s) => putSession(id, s).then(() => undefined),
  identity: async () => {
    const rec = await getIdentity();
    if (!rec) throw new Error('E2EE: this device has no identity key -- set up encryption first');
    return { priv: rec.ikPriv, pub: rec.ikPub };
  },
  signedPreKeyPair: async () => {
    const rec = await getSpk();
    if (!rec) throw new Error('E2EE: this device has no signed prekey');
    return { privateKey: rec.priv, publicKey: await importECDHPublic(rec.pub) };
  },
  takeOneTimePreKeyPriv: async (keyId) => {
    const rec = await getPreKey(keyId);
    if (!rec) return null;
    await deletePreKey(keyId);
    return rec.priv;
  },
  fetchPeerBundle: (peerId) => api.get<PeerBundle>(`/e2ee/keys/${peerId}`),
};

export const e2eeSession = createSessionManager(realDeps);
