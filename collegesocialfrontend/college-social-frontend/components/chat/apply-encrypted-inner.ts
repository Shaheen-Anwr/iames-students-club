// Folds a decrypted E2EE inner envelope into the message list. `text` messages become their
// cleartext; `media` messages get their descriptor attached; `reaction` / `edit` / `delete`
// control carriers mutate their *target* message and are themselves marked processed (ChatWindow
// filters `control` messages out of the render). Pure -- same call on reload replays the state.

import type { InnerEnvelope } from '@/lib/e2ee';
import type { Message, MessageReaction } from '@/lib/types';

const PROCESSED = '​'; // zero-width: "this carrier is done" without being visible text

function reactorId(r: MessageReaction): string {
  return typeof r.user === 'string' ? r.user : r.user._id;
}

export function applyEncryptedInner(
  list: Message[],
  carrierId: string,
  senderId: string,
  senderName: string,
  inner: InnerEnvelope | null,
  failed: boolean,
): Message[] {
  if (failed || !inner) {
    return list.map((m) => (m._id === carrierId ? { ...m, decrypted: '', decryptFailed: true } : m));
  }

  if (inner.k === 'text') {
    return list.map((m) =>
      m._id === carrierId ? { ...m, text: inner.body, decrypted: inner.body, decryptFailed: false } : m,
    );
  }

  if (inner.k === 'media') {
    return list.map((m) =>
      m._id === carrierId
        ? { ...m, media: inner, decrypted: PROCESSED, decryptFailed: false }
        : m,
    );
  }

  // --- control carriers: mark self processed, mutate the target -------------------------------
  const markSelf = (m: Message): Message =>
    m._id === carrierId ? { ...m, control: true, decrypted: PROCESSED, decryptFailed: false } : m;

  if (inner.k === 'reaction') {
    return list.map((m) => {
      if (m._id === carrierId) return markSelf(m);
      if (m._id !== inner.target) return m;
      const others = (m.reactions ?? []).filter(
        (r) => !(reactorId(r) === senderId && r.emoji === inner.emoji),
      );
      const next =
        inner.op === 'add'
          ? [...others, { user: { _id: senderId, name: senderName }, emoji: inner.emoji }]
          : others;
      return { ...m, reactions: next };
    });
  }

  if (inner.k === 'edit') {
    return list.map((m) => {
      if (m._id === carrierId) return markSelf(m);
      if (m._id !== inner.target || m.sender?._id !== senderId) return m; // only the author may edit
      return { ...m, text: inner.body, decrypted: inner.body, edited: true };
    });
  }

  if (inner.k === 'delete') {
    return list.map((m) => {
      if (m._id === carrierId) return markSelf(m);
      if (m._id !== inner.target || m.sender?._id !== senderId) return m;
      return { ...m, deletedForEveryone: true };
    });
  }

  return list.map(markSelf);
}

/** Local optimistic reaction toggle (mirrors the `reaction` branch above for our own action). */
export function toggleReactionLocal(
  reactions: MessageReaction[] | undefined,
  userId: string,
  userName: string,
  emoji: string,
  op: 'add' | 'remove',
): MessageReaction[] {
  const others = (reactions ?? []).filter((r) => !(reactorId(r) === userId && r.emoji === emoji));
  return op === 'add' ? [...others, { user: { _id: userId, name: userName }, emoji }] : others;
}
