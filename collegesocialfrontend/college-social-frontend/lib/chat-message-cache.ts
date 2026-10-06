import type { Conversation, Message } from './types';

export interface CachedChatMessages {
  messages: Message[];
  hasMore: boolean;
}

// What opening a chat paints first: the latest page of a recently seen thread, shown instantly
// while ChatWindow revalidates it in the background (so an older copy is still worth showing).
const SHOW_MAX_AGE_MS = 30 * 60_000;
const MAX_THREADS = 30;

// Memory only (never written to disk -- these are private messages), one per signed-in session.
export function createChatMessageCache(load: (id: string) => Promise<Message[]>, pageSize: number) {
  const entries = new Map<string, { data: CachedChatMessages; updatedAt: number }>();
  const pending = new Map<string, Promise<CachedChatMessages>>();

  function get(id: string): CachedChatMessages | undefined {
    const entry = entries.get(id);
    if (!entry) return undefined;
    if (Date.now() - entry.updatedAt > SHOW_MAX_AGE_MS) {
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
    while (entries.size > MAX_THREADS) entries.delete(entries.keys().next().value!);
  }

  // A message that arrived over the socket for a chat that isn't open -- keeps its cached page
  // current, so reopening it shows the new message straight away.
  function append(message: Message) {
    const entry = entries.get(message.conversation);
    if (!entry || entry.data.messages.some((m) => m._id === message._id)) return;
    entry.data = { ...entry.data, messages: [...entry.data.messages, message].slice(-pageSize) };
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

  // Hover/touch on a row, or the background warm-up: fetch only what isn't cached at all -- an
  // open chat refreshes itself, so there's no point refetching a page we already hold.
  function preload(id: string) {
    if (get(id)) return;
    void refresh(id).catch(() => undefined);
  }

  return { get, set, append, refresh, preload };
}

export type ChatMessageCache = ReturnType<typeof createChatMessageCache>;

// --- one per signed-in user, shared across ChatProvider mounts --------------------------------
// ChatProvider lives in the /chat layout (and the feed), so it unmounts whenever the user leaves.
// Keeping the cache and the last conversation list at module level means coming back paints the
// list and recent threads immediately. Signing in as someone else starts from scratch.

let session: { userId: string; cache: ChatMessageCache | null; conversations: Conversation[] | null } | null = null;

function sessionFor(userId: string) {
  if (!session || session.userId !== userId) session = { userId, cache: null, conversations: null };
  return session;
}

export function sessionChatMessageCache(userId: string, load: (id: string) => Promise<Message[]>, pageSize: number): ChatMessageCache {
  const s = sessionFor(userId);
  if (!s.cache) s.cache = createChatMessageCache(load, pageSize);
  return s.cache;
}

export function rememberConversations(userId: string, list: Conversation[]): void {
  sessionFor(userId).conversations = list;
}

export function rememberedConversations(userId: string): Conversation[] | null {
  return session?.userId === userId ? session.conversations : null;
}
