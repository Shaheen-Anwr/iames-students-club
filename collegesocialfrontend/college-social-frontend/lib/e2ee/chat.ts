// The seam between ChatWindow and the E2EE protocol. ChatWindow never touches ratchet state or
// wire envelopes directly -- it calls these four functions and gets back plain strings.
//
//   encryptText   -> opaque `payload` string to hand the socket (`{ encrypted: true, payload }`)
//   decryptMessage-> the cleartext for a received `message.encrypted` bubble (cache-first)
//   rememberOutgoing / adoptServerId -> keep our own sent text readable after a reload
//
// Message keys are deleted on first use (forward secrecy), so a reload can't re-derive history.
// Every successful decrypt (and every send) is mirrored into an IndexedDB plaintext cache keyed
// by message id; that's what makes the thread survive a refresh on this device.

import { isWireEnvelope, type InnerEnvelope, type WireEnvelope } from './envelope';
import { e2eeSession } from './session';
import { getPlaintext, putPlaintext, renamePlaintext } from './store';

export interface DecryptResult {
  text: string;
  failed: boolean;
}

// A non-text inner envelope (reaction/edit/delete/media control messages -- P5). Until those are
// wired end to end, render them as a neutral marker rather than leaking "undefined".
function describeNonText(inner: InnerEnvelope): string {
  switch (inner.k) {
    case 'media':
      return '🔒 مرفق مشفّر';
    default:
      return '🔒 رسالة';
  }
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

/** Cleartext for a received encrypted message. Cache-first; a failed decrypt is not thrown. */
export async function decryptMessage(message: {
  _id: string;
  conversation: string;
  payload?: string | null;
}): Promise<DecryptResult> {
  const cached = await getPlaintext(message._id);
  if (cached) return { text: cached.text, failed: false };

  if (!message.payload) return { text: '', failed: true };
  let wire: unknown;
  try {
    wire = JSON.parse(message.payload);
  } catch {
    return { text: '', failed: true };
  }
  if (!isWireEnvelope(wire)) return { text: '', failed: true };

  try {
    const inner = await e2eeSession.decrypt(message.conversation, wire as WireEnvelope);
    const text = inner.k === 'text' ? inner.body : describeNonText(inner);
    await putPlaintext({
      messageId: message._id,
      conversationId: message.conversation,
      text,
      k: inner.k,
    });
    return { text, failed: false };
  } catch {
    return { text: '', failed: true };
  }
}

/** Remember the cleartext of a message we just sent (optimistic bubble, temp id). */
export function rememberOutgoing(tempId: string, conversationId: string, text: string): void {
  void putPlaintext({ messageId: tempId, conversationId, text, k: 'text' });
}

/** Move the remembered cleartext onto the permanent id once the server echoes the message back. */
export function adoptServerId(tempId: string, serverId: string): void {
  void renamePlaintext(tempId, serverId);
}
