import type { Message } from './types';

export interface CachedChatMessages {
  messages: Message[];
  hasMore: boolean;
}

// Owned by ChatProvider, so private messages stay in memory and are discarded on account
// changes/unmount. Keep only the latest page of a small number of recently opened chats.
export function createChatMessageCache(load: (id: string) => Promise<Message[]>, pageSize: number) {
  const entries = new Map<string, { data: CachedChatMessages; updatedAt: number }>();
  const pending = new Map<string, Promise<CachedChatMessages>>();
  const maxAge = 5 * 60_000;

  function get(id: string): CachedChatMessages | undefined {
    const entry = entries.get(id);
    if (!entry) return undefined;
    if (Date.now() - entry.updatedAt > maxAge) {
      entries.delete(id);
      return undefined;
    }
    entries.delete(id);
    entries.set(id, entry);
    return entry.data;
  }

  function set(id: string, data: CachedChatMessages) {
    const settled = data.messages.filter((message) => !message.pending && !message.failed && !message._id.startsWith('tmp_'));
    entries.delete(id);
    entries.set(id, {
      data: { messages: settled.slice(-pageSize), hasMore: data.hasMore || settled.length > pageSize },
      updatedAt: Date.now(),
    });
    while (entries.size > 20) entries.delete(entries.keys().next().value!);
  }

  function refresh(id: string): Promise<CachedChatMessages> {
    const existing = pending.get(id);
    if (existing) return existing;
    const request = load(id).then((messages) => {
      const data = { messages: messages.slice().reverse(), hasMore: messages.length >= pageSize };
      set(id, data);
      return data;
    }).finally(() => pending.delete(id));
    pending.set(id, request);
    return request;
  }

  function preload(id: string) {
    if (get(id)) return;
    void refresh(id).catch(() => undefined);
  }

  return { get, set, refresh, preload };
}
