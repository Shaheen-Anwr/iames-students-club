// Chat end-to-end encryption -- public surface. See docs/e2ee-design.md.
//
// Phase status:
//   P0  backend key registry (src/e2ee/)                    -- done
//   P1  device keygen + IndexedDB store + bundle publish    -- done
//   P2  X3DH + Double Ratchet (x3dh.ts / ratchet.ts)        -- done (verified via selftest.ts)
//   P3a session bridge (session-core.ts / session.ts)       -- done (verified via selftest.ts)
//   P3b wire into ChatWindow / MessageBubble / list         -- done (chat.ts seam + plaintext cache)
//   P4  safety-number verification + key-change warnings    -- done (verification.ts / verify.ts)
//   P5  control messages (reaction/edit/delete) + media enc -- done (chat.ts encryptInner, media.ts)

export { e2eeSupported, b64, unb64 } from './crypto';
export {
  isE2eeAvailable,
  isE2eeEnabledOnThisDevice,
  setE2eeEnabledOnThisDevice,
  ensureDeviceRegistered,
  replenishPreKeysIfLow,
  fetchStatus,
  hasLocalKeys,
  type E2eeStatus,
} from './register';
export { wipeE2ee } from './store';
export { initiateX3DH, respondX3DH, type PeerBundle, type X3DHHeader } from './x3dh';
export {
  initRatchetInitiator,
  initRatchetResponder,
  ratchetEncrypt,
  ratchetDecrypt,
  type RatchetState,
} from './ratchet';
export {
  encodeInner,
  decodeInner,
  isWireEnvelope,
  headerAad,
  type WireEnvelope,
  type InnerEnvelope,
  type DRHeader,
} from './envelope';
export { e2eeSession, createSessionManager, type SessionManager } from './session';
export {
  encryptText,
  encryptInner,
  decryptToInner,
  rememberOutgoing,
  rememberInner,
  adoptServerId,
  type DecryptedInner,
  type ControlInner,
  type MediaInner,
} from './chat';
export {
  sealBlob,
  openBlobBytes,
  fetchAndOpen,
  fetchAndDecryptBlob,
  type SealedBlob,
} from './media';
export { computeSafetyNumber, formatSafetyNumber } from './verification';
export {
  myIdentityKey,
  reconcilePeerIdentity,
  setPeerVerified,
  type PeerIdentityState,
} from './verify';
export { e2eeSelfTest, e2eeSessionSelfTest } from './selftest';
