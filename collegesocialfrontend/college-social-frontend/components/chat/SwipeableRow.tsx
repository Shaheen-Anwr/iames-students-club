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

  const maxOffset = actions.length * ACTION_WIDTH;

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Capture so fast drags keep reporting to this element even once the translated row's
    // bounding box has moved out from under the pointer.
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerId.current = e.pointerId;
    startX.current = e.clientX;
    startDragX.current = dragX;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pointerId.current !== e.pointerId) return;
    const delta = e.clientX - startX.current;
    const next = Math.max(-maxOffset, Math.min(maxOffset, startDragX.current + delta));
    setDragX(next);
  }

  function endDrag(e: React.PointerEvent) {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    setDragging(false);
    setDragX((current) => (Math.abs(current) > maxOffset / 2 ? Math.sign(current) * maxOffset : 0));
  }

  // While the row is swiped open, the first tap should close it instead of following the link/button
  // underneath -- otherwise a stray tap right after swiping would trigger a navigation nobody wanted.
  function onClickCapture(e: React.MouseEvent) {
    if (dragX !== 0) {
      e.preventDefault();
      e.stopPropagation();
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
