// The seam between ChatWindow and the E2EE protocol. ChatWindow never touches ratchet state or
// wire envelopes directly -- it calls these helpers and gets back plain strings / inner envelopes.
//
//   encryptText / encryptInner  -> opaque `payload` string for the socket
//   decryptToInner              -> the decrypted InnerEnvelope for a received `message.encrypted`
//   rememberOutgoing / rememberInner / adoptServerId -> keep our own sends readable after a reload
//
// Message keys are deleted on first use (forward secrecy), so a reload can't re-derive history.
// Every successful decrypt (and every send) is mirrored into an IndexedDB cache keyed by message
// id; that's what makes the thread -- and replayed reactions/edits/deletes -- survive a refresh.

import { isWireEnvelope, type InnerEnvelope, type WireEnvelope } from './envelope';
import { e2eeSession } from './session';
import { getPlaintext, putPlaintext, renamePlaintext } from './store';

/** Reaction / edit / delete carried as an encrypted control message (not rendered as a bubble). */
export type ControlInner = Extract<InnerEnvelope, { k: 'reaction' | 'edit' | 'delete' }>;
/** An encrypted attachment: the blob lives (ciphertext) on the CDN, the key rides in here. */
export type MediaInner = Extract<InnerEnvelope, { k: 'media' }>;

export interface DecryptedInner {
  inner: InnerEnvelope | null;
  failed: boolean;
}

/** Encrypt one outgoing text message. Returns the JSON string to send as `payload`. */
export async function encryptText(
  conversationId: string,
  peerId: string,
  body: string,
): Promise<string> {
  const wire = await e2eeSession.encrypt(conversationId, peerId, { k: 'text', body });
  return JSON.stringify(wire);
}

/** Encrypt a non-text inner envelope (control message or media descriptor). */
export async function encryptInner(
  conversationId: string,
  peerId: string,
  inner: ControlInner | MediaInner,
): Promise<string> {
  const wire = await e2eeSession.encrypt(conversationId, peerId, inner);
  return JSON.stringify(wire);
}

/**
 * The decrypted inner envelope for a received encrypted message. Cache-first; never throws.
 * `cacheOnly` (used for our OWN outbound messages -- the ratchet can't decrypt them, and trying
 * would corrupt its state) skips the live decrypt and just reports a miss.
 */
export async function decryptToInner(
  message: { _id: string; conversation: string; payload?: string | null },
  cacheOnly = false,
): Promise<DecryptedInner> {
  const cached = await getPlaintext(message._id);
  if (cached) {
    try {
      return { inner: JSON.parse(cached.inner) as InnerEnvelope, failed: false };
    } catch {
      /* corrupt cache entry -- fall through to a fresh decrypt */
    }
  }
  if (cacheOnly) return { inner: null, failed: true };

  if (!message.payload) return { inner: null, failed: true };
  let wire: unknown;
  try {
    wire = JSON.parse(message.payload);
  } catch {
    return { inner: null, failed: true };
  }
  if (!isWireEnvelope(wire)) return { inner: null, failed: true };

  try {
    const inner = await e2eeSession.decrypt(message.conversation, wire as WireEnvelope);
    await putPlaintext({
      messageId: message._id,
      conversationId: message.conversation,
      inner: JSON.stringify(inner),
    });
    return { inner, failed: false };
  } catch {
    return { inner: null, failed: true };
  }
}

/** Remember the decrypted inner of a message (our own send, or an edit that rewrote the text). */
export function rememberInner(messageId: string, conversationId: string, inner: InnerEnvelope): void {
  void putPlaintext({ messageId, conversationId, inner: JSON.stringify(inner) });
}

/** Remember the cleartext of a text message we just sent (optimistic bubble, temp id). */
export function rememberOutgoing(tempId: string, conversationId: string, text: string): void {
  rememberInner(tempId, conversationId, { k: 'text', body: text });
}

/** Move the remembered cleartext onto the permanent id once the server echoes the message back. */
export function adoptServerId(tempId: string, serverId: string): void {
  void renamePlaintext(tempId, serverId);
}
