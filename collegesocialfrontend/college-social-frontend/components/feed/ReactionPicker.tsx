'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { REACTION_META, type ReactionType } from '@/lib/types';
import { REACTION_COLORS, REACTION_ICONS } from './reaction-icons';

export const REACTION_ORDER: ReactionType[] = ['like', 'care', 'support', 'sad', 'angry', 'not_interested', 'dislike'];

const LONG_PRESS_MS = 320;
const MOVE_CANCEL_PX = 10;
const VIEWPORT_MARGIN = 12;

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
// Desktop (mouse): hover opens the strip, click toggles the default reaction, hovering an emoji
// magnifies it (and nudges its neighbours), clicking it selects it. Arrow keys / Home / End walk
// the strip once it is open; Enter or Space picks; Escape closes.
// Touch: a quick tap opens the horizontal reaction strip so you can switch between reactions and
// tap the one you want. A long-press (like Facebook) also opens the strip and lets you drag the
// finger across it -- lifting selects whatever emoji is highlighted underneath.
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
  const [offsetX, setOffsetX] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const rectsRef = useRef<{ type: ReactionType; rect: DOMRect }[]>([]);

  useEffect(() => {
    if (!open) {
      setHighlighted(null);
      setOffsetX(0);
      return;
    }
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 260);
  }
  function clearLongPressTimer() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  const measure = useCallback(() => {
    if (!stripRef.current) return;
    rectsRef.current = Array.from(stripRef.current.querySelectorAll<HTMLElement>('[data-reaction-type]')).map((el) => ({
      type: el.dataset.reactionType as ReactionType,
      rect: el.getBoundingClientRect(),
    }));
  }, []);

  // Keep the strip fully on screen: nudge it horizontally if either edge would clip past the
  // viewport margin. Runs before paint so there is no visible jump.
  useLayoutEffect(() => {
    if (!open || !stripRef.current) return;
    setOffsetX(0);
    const id = requestAnimationFrame(() => {
      if (!stripRef.current) return;
      const rect = stripRef.current.getBoundingClientRect();
      let shift = 0;
      if (rect.left < VIEWPORT_MARGIN) shift = VIEWPORT_MARGIN - rect.left;
      else if (rect.right > window.innerWidth - VIEWPORT_MARGIN) shift = window.innerWidth - VIEWPORT_MARGIN - rect.right;
      if (shift) setOffsetX(shift);
      // preventScroll: opening the strip must never yank the feed around on mobile.
      stripRef.current.focus({ preventScroll: true });
      requestAnimationFrame(measure);
    });
    return () => cancelAnimationFrame(id);
  }, [open, measure]);

  function findAt(x: number, y: number): ReactionType | null {
    for (const { type, rect } of rectsRef.current) {
      if (x >= rect.left - 6 && x <= rect.right + 6 && y >= rect.top - 44 && y <= rect.bottom + 14) return type;
    }
    return null;
  }

  function commit(type: ReactionType) {
    onSelect(type);
    setOpen(false);
  }

  function moveHighlight(dir: 1 | -1 | 'home' | 'end') {
    const cur = highlighted ? REACTION_ORDER.indexOf(highlighted) : -1;
    let nextIdx: number;
    if (dir === 'home') nextIdx = 0;
    else if (dir === 'end') nextIdx = REACTION_ORDER.length - 1;
    else if (cur === -1) nextIdx = dir === 1 ? 0 : REACTION_ORDER.length - 1;
    else nextIdx = (cur + dir + REACTION_ORDER.length) % REACTION_ORDER.length;
    setHighlighted(REACTION_ORDER[nextIdx]);
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
        // Long-press + drag: commit whatever emoji the finger is over.
        commit(highlighted ?? 'like');
        return;
      }
      // Quick tap: open (or close) the reaction strip instead of toggling the default
      // reaction, so the user can pick a reaction with a second tap. Only treat it as a
      // tap if the finger didn't travel (a drag/scroll shouldn't open anything).
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (Math.hypot(dx, dy) <= MOVE_CANCEL_PX) {
        longPressFired.current = true; // consume the trailing synthetic click so it doesn't call onToggle
        setOpen((prev) => !prev);
        requestAnimationFrame(measure);
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
  const highlightedIdx = highlighted ? REACTION_ORDER.indexOf(highlighted) : -1;

  return (
    <div ref={rootRef} className="relative" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      {open && (
        // 'center' uses a full-width flex wrapper + justify-center instead of start-1/2 +
        // -translate-x-1/2 -- that combo breaks under RTL (start flips to the right edge, but the
        // translate is always physical/leftward, so they don't cancel out and the strip drifts off
        // past the card edge instead of centering).
        // pb-2.5 (padding, not margin) so this wrapper's hit box reaches down to the trigger --
        // the mouse can travel from the button up into the strip without crossing a dead gap that
        // would fire mouseleave and close it.
        <div className={cn('absolute bottom-full z-30 flex pb-2.5', align === 'center' ? 'inset-x-0 justify-center' : 'start-0 justify-start')}>
          {/* One cohesive frosted pill holding every reaction, Facebook/LinkedIn style -- reads as
              a single control rather than a scattered row of loose bubbles. */}
          <div
            ref={stripRef}
            role="menu"
            tabIndex={-1}
            aria-label="اختر تفاعلاً"
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                moveHighlight(1);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                moveHighlight(-1);
              } else if (e.key === 'Home') {
                e.preventDefault();
                moveHighlight('home');
              } else if (e.key === 'End') {
                e.preventDefault();
                moveHighlight('end');
              } else if ((e.key === 'Enter' || e.key === ' ') && highlighted) {
                e.preventDefault();
                commit(highlighted);
              }
            }}
            style={offsetX ? { transform: `translateX(${offsetX}px)` } : undefined}
            className={cn(
              'glass flex origin-bottom items-end rounded-full py-2 shadow-elev-3 ring-1 ring-border/60 animate-scale-in',
              // Sized so all seven fit without a scrollbar even on a 320px screen (a scroll
              // container would clip the emoji lift + tooltip); roomier from sm up.
              isSm ? 'gap-0.5 px-2' : 'gap-0.5 px-2 sm:gap-1 sm:px-2.5',
            )}
          >
            {REACTION_ORDER.map((type, i) => {
              const Icon = REACTION_ICONS[type];
              const colors = REACTION_COLORS[type];
              const isActive = highlighted === type;
              const isNeighbour = highlightedIdx >= 0 && Math.abs(i - highlightedIdx) === 1;
              return (
                <button
                  key={type}
                  type="button"
                  role="menuitem"
                  data-reaction-type={type}
                  aria-label={REACTION_META[type].label}
                  tabIndex={-1}
                  onClick={() => commit(type)}
                  onMouseEnter={() => setHighlighted(type)}
                  onMouseLeave={() => setHighlighted((h) => (h === type ? null : h))}
                  onFocus={() => setHighlighted(type)}
                  style={{ animationDelay: `${i * 28}ms` }}
                  className={cn(
                    'relative flex shrink-0 items-center justify-center rounded-full transition-transform duration-200 ease-[var(--ease-emphasized)] animate-reaction-rise',
                    colors.bg,
                    colors.text,
                    isActive
                      ? '-translate-y-2 scale-[1.45]'
                      : isNeighbour
                        ? '-translate-y-0.5 scale-110'
                        : 'hover:-translate-y-1 hover:scale-125',
                    isSm ? 'h-9 w-9' : 'h-9 w-9 sm:h-11 sm:w-11',
                  )}
                >
                  {isActive && (
                    <span className="pointer-events-none absolute -top-9 inset-x-0 z-10 flex justify-center">
                      <span className="whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold text-background shadow-elev-2 animate-fade-in">
                        {REACTION_META[type].label}
                      </span>
                    </span>
                  )}
                  <Icon className={isSm ? 'h-4 w-4' : 'h-4 w-4 sm:h-[22px] sm:w-[22px]'} />
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
