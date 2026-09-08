// The bridge: turns "encrypt this InnerEnvelope for conversation X" / "decrypt this WireEnvelope"
// into X3DH + Double Ratchet calls, bootstrapping a session on the first message in either
// direction and handing the updated ratchet state back for persistence.
//
// Pure -- no IndexedDB, no network. Dependencies are injected (SessionDeps) so the protocol path
// is verifiable in Node. `session.ts` binds the real ones.

import { decodeInner, encodeInner, type InnerEnvelope, type WireEnvelope } from './envelope';
import {
  initRatchetInitiator,
  initRatchetResponder,
  ratchetDecrypt,
  ratchetEncrypt,
  type RatchetState,
} from './ratchet';
import { initiateX3DH, respondX3DH, type PeerBundle } from './x3dh';

export interface SessionDeps {
  loadState(conversationId: string): Promise<RatchetState | undefined>;
  saveState(conversationId: string, state: RatchetState): Promise<void>;
  /** Our long-term ECDH identity keypair. */
  identity(): Promise<{ priv: CryptoKey; pub: CryptoKey }>;
  /** Our current signed-prekey keypair (the responder's initial ratchet key). */
  signedPreKeyPair(): Promise<CryptoKeyPair>;
  /** Pop (delete) the one-time prekey private for `keyId`, or null if it's already gone. */
  takeOneTimePreKeyPriv(keyId: number): Promise<CryptoKey | null>;
  /** Fetch a peer's published bundle (consumes one of their one-time prekeys server-side). */
  fetchPeerBundle(peerId: string): Promise<PeerBundle>;
}

export interface SessionManager {
  encrypt(conversationId: string, peerId: string, inner: InnerEnvelope): Promise<WireEnvelope>;
  decrypt(conversationId: string, wire: WireEnvelope): Promise<InnerEnvelope>;
  hasSession(conversationId: string): Promise<boolean>;
}

export function createSessionManager(deps: SessionDeps): SessionManager {
  // One promise chain per conversation -- ratchet state is not safe under concurrent mutation.
  const chains = new Map<string, Promise<unknown>>();
  const run = <T>(id: string, fn: () => Promise<T>): Promise<T> => {
    const prev = chains.get(id) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    chains.set(
      id,
      next.catch(() => undefined),
    );
    return next as Promise<T>;
  };

  async function encrypt(conversationId: string, peerId: string, inner: InnerEnvelope): Promise<WireEnvelope> {
    return run(conversationId, async () => {
      let state = await deps.loadState(conversationId);

      if (!state) {
        // First message in this conversation -> we're the X3DH initiator.
        const me = await deps.identity();
        const bundle = await deps.fetchPeerBundle(peerId);
        const init = await initiateX3DH(me, bundle);
        state = await initRatchetInitiator(init.sk, init.theirSignedPreKeyPub, init.header);
      }

      const r = await ratchetEncrypt(state, encodeInner(inner), conversationId);
      await deps.saveState(conversationId, r.state);

      const wire: WireEnvelope = {
        e2ee: 1,
        type: r.state.pendingX3DH ? 'x3dh' : 'msg',
        dr: r.header,
        ct: r.ct,
        iv: r.iv,
      };
      if (r.state.pendingX3DH) wire.x3dh = r.state.pendingX3DH;
      return wire;
    });
  }

  async function decrypt(conversationId: string, wire: WireEnvelope): Promise<InnerEnvelope> {
    return run(conversationId, async () => {
      let state = await deps.loadState(conversationId);

      if (!state) {
        if (wire.type !== 'x3dh' || !wire.x3dh) {
          throw new Error('E2EE: message for an unknown session with no handshake header');
        }
        const me = await deps.identity();
        const spk = await deps.signedPreKeyPair();
        const opkPriv = wire.x3dh.opkId != null ? await deps.takeOneTimePreKeyPriv(wire.x3dh.opkId) : null;
        const sk = await respondX3DH(me.priv, spk.privateKey, opkPriv, wire.x3dh);
        state = await initRatchetResponder(sk, spk);
      }

      const r = await ratchetDecrypt(state, wire.dr, wire.ct, wire.iv, conversationId);
      // A reply from the peer proves they completed the handshake -> stop attaching our prekey header.
      const persisted = r.state.pendingX3DH ? { ...r.state, pendingX3DH: null } : r.state;
      await deps.saveState(conversationId, persisted);
      return decodeInner(r.plaintext);
    });
  }

  async function hasSession(conversationId: string): Promise<boolean> {
    return !!(await deps.loadState(conversationId));
  }

  return { encrypt, decrypt, hasSession };
}
