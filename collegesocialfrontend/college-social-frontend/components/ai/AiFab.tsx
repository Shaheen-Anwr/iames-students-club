'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { History, Maximize2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAi } from '@/lib/ai-context';
import { AiChatPanel } from './AiChatPanel';
import { AiConversationSwitcher } from './AiConversationSwitcher';
import { AiAvatar } from './AiAvatar';

const STORAGE_KEY = 'ai-fab-position';
const FAB_SIZE = 48;
const EDGE_GAP = 8;
const PANEL_W = 352; // 22rem
const PANEL_H = 448; // 28rem
const DRAG_THRESHOLD = 5;
// Below the md breakpoint MobileNav sits fixed at the bottom (~56px tall) plus the iOS
// safe-area inset; reserve room so a dragged FAB can't be dropped behind/under it.
const MOBILE_BREAKPOINT = 768;
const MOBILE_NAV_RESERVE = 96;
// Matches the `lg:` breakpoint where FeedAiChatCard becomes visible in the feed's right rail.
const FEED_CARD_BREAKPOINT = 1024;

type Point = { x: number; y: number };

function bottomReserve(): number {
  if (window.innerWidth >= MOBILE_BREAKPOINT) return 0;
  const safeArea = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom')) || 0;
  return MOBILE_NAV_RESERVE + safeArea;
}

function clampToViewport(p: Point): Point {
  const maxX = Math.max(EDGE_GAP, window.innerWidth - FAB_SIZE - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, window.innerHeight - FAB_SIZE - EDGE_GAP - bottomReserve());
  return {
    x: Math.min(Math.max(EDGE_GAP, p.x), maxX),
    y: Math.min(Math.max(EDGE_GAP, p.y), maxY),
  };
}

export function AiFab() {
  const pathname = usePathname();
  const { conversations, panelOpen: open, setPanelOpen: setOpen } = useAi();
  const [activeId, setActiveId] = useState<string | null>(null);
  // 'chat' = the live conversation; 'history' = the switch-between / delete list.
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [pos, setPos] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  // Feed embeds the assistant as a full chat box in its right rail, but only from `lg:` up
  // (see FeedAiChatCard's `hidden lg:block` wrapper) -- below that the FAB is the only way in,
  // so only suppress it on feed once the embedded card is actually visible.
  const [feedCardVisible, setFeedCardVisible] = useState(pathname === '/feed');

  const btnRef = useRef<HTMLButtonElement>(null);
  const posRef = useRef<Point | null>(null);
  const dragStateRef = useRef({ startX: 0, startY: 0, originX: 0, originY: 0, moved: false });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = clampToViewport(JSON.parse(stored));
        posRef.current = parsed;
        setPos(parsed);
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  // Always reopen on the chat, not wherever the history toggle was left.
  useEffect(() => {
    if (!open) setView('chat');
  }, [open]);

  useEffect(() => {
    function onResize() {
      if (!posRef.current) return;
      const next = clampToViewport(posRef.current);
      posRef.current = next;
      setPos(next);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (pathname !== '/feed') {
      setFeedCardVisible(false);
      return;
    }
    const mq = window.matchMedia(`(min-width: ${FEED_CARD_BREAKPOINT}px)`);
    const update = () => setFeedCardVisible(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [pathname]);

  // The feed page embeds the assistant as a full chat box already at `lg:` and up, so the
  // floating bubble would just be a redundant shortcut to the same thing there.
  if (pathname === '/feed' && feedCardVisible) return null;

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    const rect = btnRef.current!.getBoundingClientRect();
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top, moved: false };
    btnRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!btnRef.current?.hasPointerCapture(e.pointerId)) return;
    const d = dragStateRef.current;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setDragging(true);
    const next = clampToViewport({ x: d.originX + dx, y: d.originY + dy });
    posRef.current = next;
    setPos(next);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    btnRef.current?.releasePointerCapture(e.pointerId);
    setDragging(false);
    if (dragStateRef.current.moved) {
      if (posRef.current) localStorage.setItem(STORAGE_KEY, JSON.stringify(posRef.current));
    } else {
      setOpen((o) => !o);
      setEverOpened(true);
    }
    dragStateRef.current.moved = false;
  }

  const conversationId = activeId ?? conversations[0]?._id ?? null;

  const buttonStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : {};

  let panelStyle: React.CSSProperties = {};
  // Grow the panel from the corner nearest the bubble so it reads as "coming from" the FAB
  // instead of popping in from a fixed corner. transform-origin only takes physical keywords,
  // so mirror the default `end-4` (right in LTR, left in RTL) explicitly.
  const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  let transformOrigin = `bottom ${isRtl ? 'left' : 'right'}`;
  if (pos) {
    const openLeft = pos.x + FAB_SIZE / 2 > window.innerWidth / 2;
    const openAbove = pos.y + FAB_SIZE / 2 > window.innerHeight / 2;
    panelStyle = openLeft
      ? { right: window.innerWidth - (pos.x + FAB_SIZE) }
      : { left: pos.x };
    panelStyle = {
      ...panelStyle,
      ...(openAbove ? { bottom: window.innerHeight - pos.y + 12 } : { top: pos.y + FAB_SIZE + 12 }),
    };
    transformOrigin = `${openAbove ? 'bottom' : 'top'} ${openLeft ? 'right' : 'left'}`;
  }

  return (
    <>
      <button
        ref={btnRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={{ ...buttonStyle, touchAction: 'none' }}
        className={`fixed z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-accent text-white shadow-glow transition-transform active:scale-95 ${
          dragging ? 'cursor-grabbing scale-105' : 'cursor-grab hover:scale-110'
        } ${!pos ? 'bottom-[calc(5rem+env(safe-area-inset-bottom))] end-4 md:bottom-6' : ''}`}
      >
        {!everOpened && !dragging && <span className="absolute inset-0 -z-10 rounded-full animate-pulse-glow" />}
        {open ? <X className="h-5 w-5" /> : <AiAvatar size={30} waving={hovered && !dragging} />}
      </button>

      {open && (
        <div
          style={{ ...panelStyle, transformOrigin }}
          className={`glass fixed z-40 flex h-[28rem] w-[22rem] max-w-[90vw] flex-col overflow-hidden rounded-xl2 shadow-card animate-bubble-in ${
            !pos ? 'bottom-[calc(9rem+env(safe-area-inset-bottom))] end-4 md:bottom-24' : ''
          }`}
        >
          <div className="h-[2px] w-full shrink-0 bg-gradient-accent" />
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-gradient-accent text-white">
                <AiAvatar size={20} />
                <span className="absolute -end-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-surface" />
              </div>
              <p className="text-sm font-semibold text-foreground">المساعد الذكي</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setActiveId(null);
                  setView('chat');
                }}
                title="محادثة جديدة"
                className="rounded-full p-1.5 text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-foreground active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView((v) => (v === 'history' ? 'chat' : 'history'))}
                title={view === 'history' ? 'العودة إلى المحادثة' : 'سجل المحادثات'}
                aria-pressed={view === 'history'}
                className={cn(
                  'rounded-full p-1.5 transition-transform hover:scale-110 hover:bg-surface-2 active:scale-95',
                  view === 'history' ? 'bg-surface-2 text-accent' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <History className="h-4 w-4" />
              </button>
              <Link
                href="/ai"
                onClick={() => setOpen(false)}
                title="عرض كل المحادثات"
                className="rounded-full p-1.5 text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-foreground active:scale-95"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {view === 'history' ? (
              <AiConversationSwitcher
                activeId={conversationId}
                onSelect={(id) => {
                  setActiveId(id);
                  setView('chat');
                }}
                onNew={() => {
                  setActiveId(null);
                  setView('chat');
                }}
                onDeleteActive={() => setActiveId(null)}
              />
            ) : (
              <AiChatPanel conversationId={conversationId} onConversationCreated={(c) => setActiveId(c._id)} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
