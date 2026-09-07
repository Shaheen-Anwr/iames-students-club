// Wire + plaintext envelopes for E2EE chat (docs/e2ee-design.md §5).

import { fromUtf8, utf8, type Bytes } from './crypto';

// --- Double Ratchet message header --------------------------------------------------------------
export interface DRHeader {
  dh: string; // b64 spki of the sender's current ratchet ECDH public key
  pn: number; // # messages in the sender's previous sending chain
  n: number; // message index in the current sending chain
}

/** Canonical, order-independent AAD bytes for a header (never JSON.stringify a re-parsed object). */
export function headerAad(h: DRHeader, conversationId: string): Bytes {
  return utf8(`${h.dh}|${h.pn}|${h.n}|${conversationId}`);
}

// --- what actually travels in Message.payload ------------------------------------------------
export interface WireEnvelope {
  e2ee: 1;
  type: 'msg' | 'x3dh';
  // present only on the very first message of a session, so the responder can run X3DH
  x3dh?: { ik: string; ek: string; opkId: number | null };
  dr: DRHeader;
  ct: string; // b64 AES-GCM ciphertext (tag appended)
  iv: string; // b64, 12 bytes
}

export function isWireEnvelope(v: unknown): v is WireEnvelope {
  const o = v as Partial<WireEnvelope> | null;
  return !!o && o.e2ee === 1 && (o.type === 'msg' || o.type === 'x3dh') && !!o.dr && typeof o.ct === 'string';
}

// --- the decrypted plaintext (itself a small envelope so every kind rides one channel) --------
export type InnerEnvelope =
  | { k: 'text'; body: string }
  | { k: 'reaction'; target: string; emoji: string; op: 'add' | 'remove' }
  | { k: 'edit'; target: string; body: string }
  | { k: 'delete'; target: string }
  | {
      k: 'media';
      kind: 'image' | 'voice' | 'file';
      url: string;
      mk: string; // b64 AES key the blob was encrypted with
      iv: string; // b64
      name?: string;
      mime?: string;
      size?: number;
      dur?: number;
    };

export function encodeInner(e: InnerEnvelope): Bytes {
  return utf8(JSON.stringify(e));
}
export function decodeInner(b: Bytes): InnerEnvelope {
  const parsed = JSON.parse(fromUtf8(b));
  if (!parsed || typeof parsed.k !== 'string') throw new Error('bad inner envelope');
  return parsed as InnerEnvelope;
}
