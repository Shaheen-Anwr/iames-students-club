// Chat end-to-end encryption -- public surface. See docs/e2ee-design.md.
//
// Phase status:
//   P0  backend key registry (src/e2ee/)                    -- done
//   P1  device keygen + IndexedDB store + bundle publish    -- done
//   P2  X3DH + Double Ratchet (x3dh.ts / ratchet.ts)        -- done (verified via selftest.ts)
//   P3  wire into ChatWindow / MessageInput / MessageBubble -- pending
//   P4  safety-number verification + key-change warnings    -- pending

export { e2eeSupported, b64, unb64 } from './crypto';
export {
  isE2eeAvailable,
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
export { e2eeSelfTest } from './selftest';
