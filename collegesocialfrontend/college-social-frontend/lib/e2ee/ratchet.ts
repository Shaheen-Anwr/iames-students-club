// Double Ratchet (docs/e2ee-design.md §4). Pure(ish) state transitions — no storage, no network.
// `RatchetState` is structured-cloneable, so it goes straight into IndexedDB.

import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  b64,
  ecdh,
  exportPublic,
  generateECDH,
  hkdf,
  hmac,
  importECDHPublic,
  randomBytes,
  unb64,
  type Bytes,
} from './crypto';
import { headerAad, type DRHeader } from './envelope';
import type { X3DHHeader } from './x3dh';

const MAX_SKIP = 1000;
const RK_INFO = 'iaems-dr-rk';

export interface RatchetState {
  rootKey: Bytes;
  dhs: CryptoKeyPair; // our current ratchet keypair (private non-extractable)
  dhsPub: string; // b64 spki of dhs.publicKey (cached)
  dhr: string | null; // b64 spki of their latest ratchet public key
  cks: Bytes | null; // sending chain key
  ckr: Bytes | null; // receiving chain key
  ns: number;
  nr: number;
  pn: number;
  skipped: { id: string; mk: string }[]; // id = `${dhr}:${n}`, mk = b64; bounded to MAX_SKIP
  // Initiator only: the X3DH prekey header to keep attaching to every outbound message until the
  // peer replies (proving they ran the handshake). Cleared by session.ts on the first decrypt.
  // Ratchet functions ignore it -- it just rides along in the persisted session blob.
  pendingX3DH?: X3DHHeader | null;
}

async function kdfRK(rk: Bytes, dhOut: Bytes): Promise<{ rk: Bytes; ck: Bytes }> {
  const out = await hkdf(dhOut, rk, RK_INFO, 64);
  return { rk: out.slice(0, 32) as Bytes, ck: out.slice(32, 64) as Bytes };
}
async function kdfCK(ck: Bytes): Promise<{ ck: Bytes; mk: Bytes }> {
  const mk = await hmac(ck, new Uint8Array([0x01]) as Bytes);
  const nextCk = await hmac(ck, new Uint8Array([0x02]) as Bytes);
  return { ck: nextCk, mk };
}

// --- session bring-up (the X3DH -> DR handoff) --------------------------------------------------

/** Initiator: SK from X3DH + the responder's signed-prekey public as the initial DHr. */
export async function initRatchetInitiator(
  sk: Bytes,
  theirSignedPreKeyPub: string,
  pendingX3DH?: X3DHHeader,
): Promise<RatchetState> {
  const dhs = await generateECDH(false);
  const dhrKey = await importECDHPublic(theirSignedPreKeyPub);
  const { rk, ck } = await kdfRK(sk, await ecdh(dhs.privateKey, dhrKey));
  return {
    rootKey: rk,
    dhs,
    dhsPub: await exportPublic(dhs.publicKey),
    dhr: theirSignedPreKeyPub,
    cks: ck,
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    skipped: [],
    pendingX3DH: pendingX3DH ?? null,
  };
}

/** Responder: SK from X3DH; our own signed-prekey keypair is the initial DHs. */
export async function initRatchetResponder(sk: Bytes, mySignedPreKey: CryptoKeyPair): Promise<RatchetState> {
  return {
    rootKey: sk,
    dhs: mySignedPreKey,
    dhsPub: await exportPublic(mySignedPreKey.publicKey),
    dhr: null,
    cks: null,
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    skipped: [],
    pendingX3DH: null,
  };
}

// --- encrypt / decrypt ---------------------------------------------------------------------------

export async function ratchetEncrypt(
  state: RatchetState,
  plaintext: Bytes,
  conversationId: string,
): Promise<{ state: RatchetState; header: DRHeader; ct: string; iv: string }> {
  if (!state.cks) throw new Error('E2EE: no sending chain yet (receive a message first)');
  const { ck, mk } = await kdfCK(state.cks);
  const header: DRHeader = { dh: state.dhsPub, pn: state.pn, n: state.ns };
  const iv = randomBytes(12);
  const ct = await aesGcmEncrypt(mk, plaintext, iv, headerAad(header, conversationId));
  return {
    state: { ...state, cks: ck, ns: state.ns + 1 },
    header,
    ct: b64(ct),
    iv: b64(iv),
  };
}

export async function ratchetDecrypt(
  state: RatchetState,
  header: DRHeader,
  ctB64: string,
  ivB64: string,
  conversationId: string,
): Promise<{ state: RatchetState; plaintext: Bytes }> {
  const ct = unb64(ctB64);
  const iv = unb64(ivB64);
  const aad = headerAad(header, conversationId);

  // 1. a message key we stashed earlier for an out-of-order / earlier-chain message?
  const skId = `${header.dh}:${header.n}`;
  const stashed = state.skipped.find((s) => s.id === skId);
  if (stashed) {
    const pt = await aesGcmDecrypt(unb64(stashed.mk), ct, iv, aad);
    return { state: { ...state, skipped: state.skipped.filter((s) => s.id !== skId) }, plaintext: pt };
  }

  // work on a shallow clone; skipped[] is replaced wholesale below
  let s: RatchetState = { ...state, skipped: [...state.skipped] };

  // 2. new ratchet key from them -> DH ratchet step
  if (header.dh !== s.dhr) {
    s = await skipOnReceiving(s, header.pn); // finish the old receiving chain
    s = await dhRatchet(s, header.dh);
  }

  // 3. advance the receiving chain to this message's index
  s = await skipOnReceiving(s, header.n);

  // 4. derive this message's key, advance, decrypt
  const { ck, mk } = await kdfCK(s.ckr!);
  s.ckr = ck;
  s.nr = header.n + 1;
  const plaintext = await aesGcmDecrypt(mk, ct, iv, aad); // throws on tag mismatch
  return { state: s, plaintext };
}

async function skipOnReceiving(s: RatchetState, until: number): Promise<RatchetState> {
  if (!s.ckr) return s; // no receiving chain yet (first message on it)
  if (until - s.nr > MAX_SKIP) throw new Error('E2EE: too many skipped messages');
  while (s.nr < until) {
    const { ck, mk } = await kdfCK(s.ckr);
    s.skipped.push({ id: `${s.dhr}:${s.nr}`, mk: b64(mk) });
    if (s.skipped.length > MAX_SKIP) s.skipped.shift();
    s.ckr = ck;
    s.nr += 1;
  }
  return s;
}

async function dhRatchet(s: RatchetState, theirDhPub: string): Promise<RatchetState> {
  s.pn = s.ns;
  s.ns = 0;
  s.nr = 0;
  s.dhr = theirDhPub;
  const dhrKey = await importECDHPublic(theirDhPub);

  const recv = await kdfRK(s.rootKey, await ecdh(s.dhs.privateKey, dhrKey));
  s.rootKey = recv.rk;
  s.ckr = recv.ck;

  s.dhs = await generateECDH(false);
  s.dhsPub = await exportPublic(s.dhs.publicKey);
  const send = await kdfRK(s.rootKey, await ecdh(s.dhs.privateKey, dhrKey));
  s.rootKey = send.rk;
  s.cks = send.ck;
  return s;
}
