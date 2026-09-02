'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SwipeAction {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}

interface SwipeableRowProps {
  actions: SwipeAction[];
  children: React.ReactNode;
  className?: string;
}

const ACTION_WIDTH = 64;
const DRAG_THRESHOLD = 4;

// A lightweight WhatsApp-style "swipe to reveal quick actions" row, built on pointer events
// so it works for touch and mouse alike without pulling in a gesture library. Dragging is purely
// physical (left/right by clientX) rather than logical start/end, since the reveal side must match
// whichever edge the finger actually uncovers -- that flips correctly for RTL on its own.
export function SwipeableRow({ actions, children, className }: SwipeableRowProps) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startDragX = useRef(0);
  const pointerId = useRef<number | null>(null);
  // Set once a press crosses the drag threshold; a plain click never trips it.
  const didDrag = useRef(false);

  const maxOffset = actions.length * ACTION_WIDTH;

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Deliberately NOT capturing the pointer here: setPointerCapture on a plain press
    // retargets the follow-up `click` to this wrapper, so a nested <Link>/<button> never
    // sees it and navigation silently fails (desktop especially). Capture is deferred to
    // onPointerMove, once an actual drag has begun.
    pointerId.current = e.pointerId;
    startX.current = e.clientX;
    startDragX.current = dragX;
    didDrag.current = false;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pointerId.current !== e.pointerId) return;
    const delta = e.clientX - startX.current;
    if (!didDrag.current) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      didDrag.current = true;
      setDragging(true);
      // Now that we're really dragging, capture so fast drags keep reporting here even
      // once the translated row's box has moved out from under the pointer.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    }
    const next = Math.max(-maxOffset, Math.min(maxOffset, startDragX.current + delta));
    setDragX(next);
  }

  function endDrag(e: React.PointerEvent) {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* was never captured */
    }
    setDragX((current) => (Math.abs(current) > maxOffset / 2 ? Math.sign(current) * maxOffset : 0));
  }

  // After a swipe, swallow the trailing click so it doesn't follow the link/button underneath --
  // whether the row settled open (dragX !== 0) or snapped back closed (didDrag).
  function onClickCapture(e: React.MouseEvent) {
    if (didDrag.current || dragX !== 0) {
      e.preventDefault();
      e.stopPropagation();
      didDrag.current = false;
      setDragX(0);
    }
  }

  const revealSide: 'left' | 'right' | null = dragX > DRAG_THRESHOLD ? 'left' : dragX < -DRAG_THRESHOLD ? 'right' : null;

  return (
    <div className="relative overflow-hidden">
      {revealSide && actions.length > 0 && (
        <div
          className={cn('absolute inset-y-0 flex items-stretch', revealSide === 'left' ? 'left-0' : 'right-0')}
          style={{ width: maxOffset }}
        >
          {actions.map((action) => (
            <button
              key={action.key}
              onClick={() => {
                action.onClick();
                setDragX(0);
              }}
              style={{ width: ACTION_WIDTH }}
              className={cn(
                'flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                action.active ? 'bg-accent text-white' : 'bg-surface-2 text-foreground hover:bg-surface-2/70',
              )}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        style={{ transform: `translateX(${dragX}px)`, touchAction: 'pan-y' }}
        className={cn('relative bg-surface', !dragging && 'transition-transform duration-200 ease-out', className)}
      >
        {children}
      </div>
    </div>
  );
}
