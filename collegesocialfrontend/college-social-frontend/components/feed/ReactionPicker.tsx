'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { REACTION_META, type ReactionType } from '@/lib/types';
import { REACTION_COLORS, REACTION_ICONS } from './reaction-icons';

export const REACTION_ORDER: ReactionType[] = ['like', 'care', 'support', 'sad', 'angry', 'not_interested', 'dislike'];

const LONG_PRESS_MS = 320;
const MOVE_CANCEL_PX = 10;

interface TriggerProps {
  onClick: () => void;
  onMouseEnter: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
  /** Explicit open toggle for a secondary affordance (e.g. a chevron button) -- not gesture-based. */
  toggleOpen: () => void;
}

// Shared reaction popover, used by both PostCard and CommentItem.
//
// Desktop (mouse): hover opens the strip, click toggles the default reaction, clicking an emoji
// in the strip selects it.
// Touch: a quick tap toggles the default reaction (native click). A long-press (like Facebook)
// opens the strip; dragging the finger across it highlights the emoji underneath, and lifting
// selects whatever was highlighted (or the default reaction if the finger never left the button).
export function ReactionPicker({
  onToggle,
  onSelect,
  size = 'md',
  align = 'center',
  trigger,
}: {
  onToggle: () => void;
  onSelect: (type: ReactionType) => void;
  size?: 'sm' | 'md';
  align?: 'center' | 'start';
  trigger: (open: boolean, triggerProps: TriggerProps) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<ReactionType | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const rectsRef = useRef<{ type: ReactionType; rect: DOMRect }[]>([]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 250);
  }
  function clearLongPressTimer() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function measure() {
    if (!stripRef.current) return;
    rectsRef.current = Array.from(stripRef.current.querySelectorAll<HTMLElement>('[data-reaction-type]')).map((el) => ({
      type: el.dataset.reactionType as ReactionType,
      rect: el.getBoundingClientRect(),
    }));
  }
  function findAt(x: number, y: number): ReactionType | null {
    for (const { type, rect } of rectsRef.current) {
      if (x >= rect.left - 6 && x <= rect.right + 6 && y >= rect.top - 44 && y <= rect.bottom + 14) return type;
    }
    return null;
  }

  const triggerProps: TriggerProps = {
    onClick: () => {
      if (longPressFired.current) {
        longPressFired.current = false; // consume: the trailing click after a long-press selection
        return;
      }
      onToggle();
    },
    onMouseEnter: () => {
      cancelClose();
      setOpen(true);
    },
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse') return;
      startPos.current = { x: e.clientX, y: e.clientY };
      longPressFired.current = false;
      setHighlighted(null);
      clearLongPressTimer();
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        setOpen(true);
        requestAnimationFrame(measure);
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e) => {
      if (e.pointerType === 'mouse') return;
      if (!longPressFired.current) {
        const dx = e.clientX - startPos.current.x;
        const dy = e.clientY - startPos.current.y;
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clearLongPressTimer();
        return;
      }
      setHighlighted(findAt(e.clientX, e.clientY));
    },
    onPointerUp: (e) => {
      if (e.pointerType === 'mouse') return;
      clearLongPressTimer();
      if (longPressFired.current) {
        onSelect(highlighted ?? 'like');
        setOpen(false);
        setHighlighted(null);
      }
    },
    onPointerCancel: () => {
      clearLongPressTimer();
      longPressFired.current = false;
      setOpen(false);
      setHighlighted(null);
    },
    toggleOpen: () => setOpen((prev) => !prev),
  };

  const isSm = size === 'sm';

  return (
    <div ref={rootRef} className="relative" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      {open && (
        // 'center' uses a full-width flex wrapper + justify-center instead of start-1/2 +
        // -translate-x-1/2 -- that combo breaks under RTL (start flips to the right edge, but the
        // translate is always physical/leftward, so they don't cancel out and the strip drifts off
        // past the card edge instead of centering).
        <div className={cn('absolute bottom-full z-20 mb-2 flex', align === 'center' ? 'inset-x-0 justify-center' : 'start-0 justify-start')}>
          {/* Each reaction is its own floating bubble (own glass/shadow/ring) in a single
              horizontal row -- not one shared pill -- so they read as independent choices. */}
          <div ref={stripRef} className="flex max-w-[calc(100vw-2rem)] items-center gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin">
            {REACTION_ORDER.map((type) => {
              const Icon = REACTION_ICONS[type];
              const colors = REACTION_COLORS[type];
              return (
                <button
                  key={type}
                  type="button"
                  data-reaction-type={type}
                  onClick={() => {
                    onSelect(type);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setHighlighted(type)}
                  onMouseLeave={() => setHighlighted((h) => (h === type ? null : h))}
                  className={cn(
                    'glass relative flex shrink-0 items-center justify-center rounded-full shadow-card ring-1 ring-border/50 transition-all duration-150 ease-out animate-bubble-in',
                    colors.bg,
                    colors.text,
                    highlighted === type ? '-translate-y-2.5 scale-125' : 'hover:-translate-y-2 hover:scale-110',
                    isSm ? 'h-9 w-9' : 'h-10 w-10 sm:h-12 sm:w-12',
                  )}
                >
                  {highlighted === type && (
                    <span className="pointer-events-none absolute -top-8 inset-x-0 z-10 flex justify-center">
                      <span className="whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background shadow-card animate-fade-in">
                        {REACTION_META[type].label}
                      </span>
                    </span>
                  )}
                  <Icon className={isSm ? 'h-4 w-4' : 'h-5 w-5 sm:h-6 sm:w-6'} />
                </button>
              );
            })}
          </div>
        </div>
      )}
      {trigger(open, triggerProps)}
    </div>
  );
}
