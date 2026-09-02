'use client';

import { useRef } from 'react';
import type { ComponentType } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { useMediaQuery } from '@/lib/use-media-query';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'danger' | 'accent' | 'warning';

interface SwipeAction {
  icon: ComponentType<{ className?: string }>;
  /** For assistive tech -- the row exposes it as an aria-label on the drag handle. */
  label: string;
  onAction: () => void;
  tone?: Tone;
}

interface SwipeableRowProps {
  action: SwipeAction;
  /** px of horizontal travel past which releasing fires the action. */
  threshold?: number;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

const TONE_TRACK: Record<Tone, string> = {
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  accent: 'bg-accent/15 text-accent',
  warning: 'bg-warning/15 text-warning',
};

/**
 * Swipe-to-act list row. Touch devices only -- on pointer devices it renders the row untouched
 * (so desktop keeps whatever affordance the row already has). Drag the row horizontally; release
 * past `threshold` to fire `action.onAction()`, otherwise it springs back. Works in both
 * directions so it's RTL-agnostic. The action icon behind the row fades/scales in with distance.
 */
export function SwipeableRow({ action, threshold = 92, disabled, className, children }: SwipeableRowProps) {
  const isTouch = useMediaQuery('(pointer: coarse)');
  const x = useMotionValue(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const firing = useRef(false);

  const distance = useTransform(x, (v) => Math.abs(v));
  const trackOpacity = useTransform(distance, [0, threshold * 0.4, threshold], [0, 0.5, 1]);
  const iconScale = useTransform(distance, [0, threshold], [0.6, 1]);

  // Tick once each time the drag crosses the commit threshold, so the finger feels the point
  // past which releasing will fire -- the same cue iOS gives on a swipe action.
  const pastThreshold = useRef(false);
  useMotionValueEvent(distance, 'change', (d) => {
    const past = d >= threshold;
    if (past !== pastThreshold.current) {
      pastThreshold.current = past;
      if (past) haptic('select');
    }
  });

  if (!isTouch || disabled) return <div className={className}>{children}</div>;

  const Icon = action.icon;

  const handleDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (firing.current) return;
    if (Math.abs(info.offset.x) >= threshold) {
      firing.current = true;
      haptic('success');
      const dir = info.offset.x > 0 ? 1 : -1;
      const w = rowRef.current?.offsetWidth ?? 320;
      void animate(x, dir * w, { type: 'spring', stiffness: 420, damping: 42 }).then(() => {
        action.onAction();
        x.set(0); // fallback -- the parent normally unmounts the row
        firing.current = false;
      });
    } else {
      void animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 });
    }
  };

  return (
    <div ref={rowRef} className={cn('relative overflow-hidden rounded-xl', className)}>
      <motion.div
        aria-hidden
        className={cn('absolute inset-0 flex items-center justify-between px-5', TONE_TRACK[action.tone ?? 'accent'])}
        style={{ opacity: trackOpacity }}
      >
        <motion.span style={{ scale: iconScale }}>
          <Icon className="h-5 w-5" />
        </motion.span>
        <motion.span style={{ scale: iconScale }}>
          <Icon className="h-5 w-5" />
        </motion.span>
      </motion.div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -threshold * 1.5, right: threshold * 1.5 }}
        dragElastic={0.35}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative bg-surface"
        aria-label={action.label}
      >
        {children}
      </motion.div>
    </div>
  );
}
