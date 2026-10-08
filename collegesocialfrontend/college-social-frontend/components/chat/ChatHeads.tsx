'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion';
import { Loader2, Maximize2, Send, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { chatApi, MESSAGE_PAGE_SIZE } from '@/lib/chat-api';
import { sessionChatMessageCache } from '@/lib/chat-message-cache';
import { messagePreview } from '@/lib/chat-helpers';
import { playChatSound } from '@/lib/chat-sounds';
import { clearChatHeads, openChatHead, removeChatHead, useChatHeads, type ChatHead } from '@/lib/chat-heads';
import { closeChatNotifications } from '@/lib/push-notifications';
import { assetUrl, cn } from '@/lib/utils';
import type { Message } from '@/lib/types';

// Messenger-style chat heads inside the app. Chats that get a message while you're elsewhere in
// the app (anywhere but the chat screens) float as round bubbles on the screen edge:
//   - drag the stack anywhere -- it snaps to the nearest side; drop it on the × to dismiss all;
//   - a new message pops a little preview next to it;
//   - tap it: the bubbles line up along the top and a mini chat opens under the selected one
//     (recent messages + quick reply), with a button to open the full conversation.
// Web apps can't draw over *other* apps (Android's Bubbles API is native-only), so outside the app
// the phone notification does this job instead.

const HEAD = 56;
const EDGE = 10;
const POS_KEY = 'chat:heads:pos';
const MENTION_RE = /@\[([^\]]+)\]\((?:[0-9a-fA-F]{24}|rafed)\)/g;

type Side = 'left' | 'right';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// Where the stack may sit: below the top bar, above the bottom tab bar.
function bounds() {
  return {
    leftX: EDGE,
    rightX: window.innerWidth - HEAD - EDGE,
    minY: 76,
    maxY: Math.max(76, window.innerHeight - HEAD - 100),
  };
}

function readPos(): { side: Side; top: number } {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as { side?: string; top?: number } | null;
    if (p && (p.side === 'left' || p.side === 'right') && typeof p.top === 'number') return { side: p.side, top: p.top };
  } catch {
    /* fall through */
  }
  return { side: 'left', top: 0.38 };
}

function savePos(pos: { side: Side; top: number }) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* private mode */
  }
}

export function ChatHeads() {
  const { heads, openId } = useChatHeads();
  const [expanded, setExpanded] = useState(false);

  const expand = useCallback((conversationId?: string) => {
    setExpanded(true);
    openChatHead(conversationId ?? null);
  }, []);
  const collapse = useCallback(() => {
    setExpanded(false);
    openChatHead(null);
  }, []);

  useEffect(() => {
    if (!heads.length) setExpanded(false);
  }, [heads.length]);

  if (!heads.length) return null;
  return (
    <>
      {!expanded && <HeadStack heads={heads} onOpen={(id) => expand(id ?? heads[0].conversationId)} />}
      <AnimatePresence>
        {expanded && <ExpandedHeads heads={heads} openId={openId ?? heads[0].conversationId} onCollapse={collapse} />}
      </AnimatePresence>
    </>
  );
}

function HeadStack({ heads, onOpen }: { heads: ChatHead[]; onOpen: (conversationId?: string) => void }) {
  const x = useMotionValue(-200);
  const y = useMotionValue(0);
  const [side, setSide] = useState<Side>('left');
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [peek, setPeek] = useState<ChatHead | null>(null);
  const dragged = useRef(false);

  // Place it (remembered side + height) and keep it on screen when the window resizes.
  useEffect(() => {
    const place = () => {
      const pos = readPos();
      const b = bounds();
      setSide(pos.side);
      x.set(pos.side === 'left' ? b.leftX : b.rightX);
      y.set(clamp(pos.top * window.innerHeight, b.minY, b.maxY));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [x, y]);

  // A message arriving pops a preview next to the stack (not for bubbles restored after a reload).
  const latest = heads[0];
  const lastSeenAt = useRef(latest?.at ?? 0);
  useEffect(() => {
    if (!latest || latest.at <= lastSeenAt.current) return;
    lastSeenAt.current = latest.at;
    setPeek(latest);
  }, [latest]);
  useEffect(() => {
    if (!peek) return;
    const timer = setTimeout(() => setPeek(null), 3500);
    return () => clearTimeout(timer);
  }, [peek]);

  const trashCenter = () => ({ x: window.innerWidth / 2, y: window.innerHeight - 96 });
  const nearTrash = (point: { x: number; y: number }) => {
    const t = trashCenter();
    return Math.hypot(point.x - t.x, point.y - t.y) < 72;
  };

  const unread = heads.reduce((sum, h) => sum + h.unread, 0);
  const shown = heads.slice(0, 3);

  return (
    <>
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={unread ? `فقاعات الدردشة — ${unread} رسائل جديدة` : 'فقاعات الدردشة'}
        className="fixed left-0 top-0 z-40 cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ x, y, width: HEAD, height: HEAD }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: overTrash ? 0.8 : 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        drag
        dragMomentum={false}
        dragElastic={0}
        onDragStart={() => {
          dragged.current = true;
          setDragging(true);
          setPeek(null);
        }}
        onDrag={(_, info) => setOverTrash(nearTrash(info.point))}
        onDragEnd={(_, info) => {
          setDragging(false);
          setOverTrash(false);
          window.setTimeout(() => {
            dragged.current = false;
          }, 60);
          if (nearTrash(info.point)) {
            clearChatHeads();
            return;
          }
          const b = bounds();
          const nextSide: Side = x.get() + HEAD / 2 < window.innerWidth / 2 ? 'left' : 'right';
          const top = clamp(y.get(), b.minY, b.maxY);
          const spring = { type: 'spring' as const, stiffness: 520, damping: 36 };
          void animate(x, nextSide === 'left' ? b.leftX : b.rightX, spring);
          void animate(y, top, spring);
          setSide(nextSide);
          savePos({ side: nextSide, top: top / window.innerHeight });
        }}
        onTap={() => {
          if (!dragged.current) onOpen();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        {/* The stack: newest in front, up to two peeking out behind it. */}
        {shown
          .slice()
          .reverse()
          .map((head, i, arr) => {
            const depth = arr.length - 1 - i;
            return (
              <div
                key={head.conversationId}
                className="absolute inset-0 rounded-full shadow-elev-3 ring-2 ring-surface"
                style={{
                  transform: `translate(${side === 'left' ? depth * 6 : -depth * 6}px, ${depth * 5}px) scale(${1 - depth * 0.08})`,
                  zIndex: 3 - depth,
                }}
              >
                <Avatar src={assetUrl(head.photoUrl)} name={head.name} size="lg" />
              </div>
            );
          })}
        {unread > 0 && (
          <span className="absolute -end-1 -top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white ring-2 ring-surface">
            {unread > 99 ? '99+' : unread}
          </span>
        )}

        <AnimatePresence>
          {peek && !dragging && (
            <motion.button
              type="button"
              key={peek.at}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpen(peek.conversationId);
              }}
              className="absolute top-1 w-max max-w-[min(15rem,calc(100vw-6rem))] rounded-2xl bg-surface px-3 py-2 text-start shadow-elev-4 ring-1 ring-border/60"
              style={side === 'left' ? { left: HEAD + 10 } : { right: HEAD + 10 }}
            >
              <span className="block truncate text-xs font-bold text-foreground">{peek.name}</span>
              <span dir="auto" className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                {peek.preview}
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Drop target while dragging: release on it to dismiss every bubble. */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0, scale: overTrash ? 1.2 : 1 }}
            exit={{ opacity: 0, y: 24 }}
            className={cn(
              'pointer-events-none fixed bottom-[64px] left-1/2 z-40 -ms-8 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-elev-4 ring-2',
              overTrash ? 'bg-danger ring-white/70' : 'bg-black/60 ring-white/30 backdrop-blur',
            )}
            aria-hidden
          >
            <X className="h-7 w-7" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ExpandedHeads({ heads, openId, onCollapse }: { heads: ChatHead[]; openId: string; onCollapse: () => void }) {
  const router = useRouter();
  const current = heads.find((h) => h.conversationId === openId) ?? heads[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCollapse();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCollapse]);

  return (
    <motion.div className="fixed inset-0 z-[45]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onCollapse} aria-hidden />

      <div role="tablist" aria-label="فقاعات الدردشة" className="relative flex justify-center gap-3 px-3 pt-[calc(env(safe-area-inset-top)+12px)]">
        {heads.map((head) => {
          const selected = head.conversationId === current.conversationId;
          return (
            <button
              key={head.conversationId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={head.name}
              onClick={() => openChatHead(head.conversationId)}
              className="relative"
            >
              <motion.span
                animate={{ scale: selected ? 1 : 0.88, opacity: selected ? 1 : 0.75 }}
                className={cn('block rounded-full ring-2', selected ? 'ring-white' : 'ring-transparent')}
              >
                <Avatar src={assetUrl(head.photoUrl)} name={head.name} size="lg" />
              </motion.span>
              {head.unread > 0 && (
                <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white ring-2 ring-black/40">
                  {head.unread}
                </span>
              )}
              {selected && (
                <span aria-hidden className="absolute -bottom-3.5 left-1/2 -ms-2 h-0 w-0 border-x-8 border-b-8 border-x-transparent border-b-surface" />
              )}
            </button>
          );
        })}
      </div>

      <div className="relative mx-auto mt-3 max-w-md px-3">
        <motion.div
          key={current.conversationId}
          role="dialog"
          aria-label={`محادثة ${current.name}`}
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="flex flex-col overflow-hidden rounded-3xl bg-surface shadow-elev-4 ring-1 ring-border/60"
          style={{ height: 'calc(var(--app-height, 100dvh) - env(safe-area-inset-top) - 100px)' }}
        >
          <MiniThread
            head={current}
            onOpenFull={() => {
              onCollapse();
              router.push(`/chat/${current.conversationId}`);
            }}
            onClose={() => removeChatHead(current.conversationId)}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

// The last page of a conversation, kept live, with a quick-reply box. Shares the session message
// cache with the full chat, so opening a bubble you've seen before is instant and opening the full
// chat afterwards is too.
function MiniThread({ head, onOpenFull, onClose }: { head: ChatHead; onOpenFull: () => void; onClose: () => void }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const userId = user?._id ?? '';
  const id = head.conversationId;
  const cache = useMemo(() => sessionChatMessageCache(userId, chatApi.latest, MESSAGE_PAGE_SIZE), [userId]);
  const [messages, setMessages] = useState<Message[]>(() => cache.get(id)?.messages ?? []);
  const [loading, setLoading] = useState(() => !cache.get(id));
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Fresh page (folded into anything already showing), read receipts, phone notification cleared.
  useEffect(() => {
    let cancelled = false;
    cache
      .refresh(id)
      .then((data) => {
        if (cancelled) return;
        setMessages((prev) => {
          const known = new Set(data.messages.map((m) => m._id));
          const newest = data.messages[data.messages.length - 1]?.createdAt ?? '';
          const extra = prev.filter((m) => !known.has(m._id) && (m.pending || m.failed || m.createdAt > newest));
          return [...data.messages, ...extra];
        });
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });
    socket?.emit('markRead', id);
    void closeChatNotifications(id);
    return () => {
      cancelled = true;
    };
  }, [cache, id, socket]);

  // Hand what's on screen back to the cache, so the full chat opens straight onto it.
  useEffect(
    () => () => {
      if (messagesRef.current.length) cache.set(id, { messages: messagesRef.current, hasMore: true });
    },
    [cache, id],
  );

  useEffect(() => {
    if (!socket) return;
    const onNew = (message: Message) => {
      if (message.conversation !== id || message.threadRoot) return;
      const mine = !!userId && message.sender?._id === userId;
      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) return prev;
        // My own message coming back from the server replaces its optimistic copy.
        const rest = mine ? prev.filter((m) => !(m._id.startsWith('tmp_') && m.text === message.text)) : prev;
        return [...rest, message];
      });
      if (!mine) socket.emit('markRead', id);
    };
    socket.on('newMessage', onNew);
    return () => {
      socket.off('newMessage', onNew);
    };
  }, [socket, id, userId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  function send() {
    const body = text.trim();
    if (!body || !socket || !user) return;
    const optimistic = {
      _id: `tmp_${Date.now()}`,
      conversation: id,
      sender: user,
      text: body,
      readBy: [],
      createdAt: new Date().toISOString(),
      pending: true,
    } as unknown as Message;
    setMessages((prev) => [...prev, optimistic]);
    setText('');
    playChatSound('sent');
    socket.emit('sendMessage', { conversationId: id, text: body }, (ack: { ok?: boolean } | undefined) => {
      if (ack?.ok) return;
      setMessages((prev) => prev.map((m) => (m._id === optimistic._id ? ({ ...m, pending: false, failed: true } as Message) : m)));
    });
  }

  const shown = messages.slice(-40);

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <Avatar src={assetUrl(head.photoUrl)} name={head.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{head.name}</p>
          {head.isGroup && <p className="text-[11px] text-muted-foreground">مجموعة</p>}
        </div>
        <button
          type="button"
          onClick={onOpenFull}
          aria-label="فتح المحادثة كاملة"
          title="فتح المحادثة كاملة"
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق الفقاعة"
          title="إغلاق الفقاعة"
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-danger"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3 scrollbar-thin">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          </div>
        ) : failed && !shown.length ? (
          <p className="pt-8 text-center text-sm text-muted-foreground">تعذّر تحميل الرسائل.</p>
        ) : (
          shown.map((m, i) => {
            const mine = !!userId && m.sender?._id === userId;
            const showName = head.isGroup && !mine && shown[i - 1]?.sender?._id !== m.sender?._id;
            return <MiniBubble key={m._id} message={m} mine={mine} showName={showName} />;
          })
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2 border-t border-border/60 p-2.5 pb-[calc(0.625rem+var(--safe-bottom,0px))]"
      >
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          dir="auto"
          maxLength={4000}
          placeholder="اكتب ردًا…"
          aria-label="رد سريع"
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl bg-surface-2 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="إرسال"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-40"
        >
          <Send className="h-[18px] w-[18px] rtl:-scale-x-100" />
        </button>
      </form>
    </>
  );
}

function MiniBubble({ message, mine, showName }: { message: Message; mine: boolean; showName: boolean }) {
  const body = message.deletedForEveryone
    ? 'تم حذف هذه الرسالة'
    : message.text?.trim()
      ? message.text.replace(MENTION_RE, '@$1')
      : messagePreview(message) || 'رسالة';
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3 py-1.5 text-sm leading-relaxed',
          mine ? 'rounded-ee-md bg-accent text-white' : 'rounded-es-md bg-surface-2 text-foreground',
          message.pending && 'opacity-70',
          message.failed && 'ring-1 ring-danger',
        )}
      >
        {showName && (
          <p className="mb-0.5 text-[11px] font-semibold text-accent">
            {message.sender?.name ?? (message.bot === 'rafed' ? 'رافد' : '')}
          </p>
        )}
        <p dir="auto" className="whitespace-pre-wrap break-words">
          {body}
        </p>
      </div>
    </div>
  );
}
