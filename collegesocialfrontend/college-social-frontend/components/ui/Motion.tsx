'use client';

import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import { motion } from 'framer-motion';
import {
  fadeInUp,
  pressable,
  staggerContainer,
  staggerItem,
  transitions,
  viewportOnce,
} from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Thin motion wrappers over the vocabulary in lib/motion.ts. Screens reach for these instead
 * of wiring framer-motion variants by hand, so entrances stay consistent app-wide.
 */

type DivProps = ComponentPropsWithoutRef<typeof motion.div>;

interface FadeInProps extends DivProps {
  /** Animate when scrolled into view instead of on mount. */
  whenInView?: boolean;
  /** Stagger offset when several siblings mount together, in seconds. */
  delay?: number;
}

export const FadeIn = forwardRef<ElementRef<typeof motion.div>, FadeInProps>(
  ({ whenInView, delay = 0, transition, className, children, ...props }, ref) => {
    const trigger = whenInView
      ? { whileInView: 'show' as const, viewport: viewportOnce }
      : { animate: 'show' as const };
    return (
      <motion.div
        ref={ref}
        initial="hidden"
        variants={fadeInUp}
        transition={transition ?? { ...transitions.smooth, delay }}
        className={className}
        {...trigger}
        {...props}
      >
        {children}
      </motion.div>
    );
  },
);
FadeIn.displayName = 'FadeIn';

/** Wrap a list; direct <Stagger.Item> children fade/rise in sequence. */
export function Stagger({ className, children, ...props }: DivProps) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

Stagger.Item = forwardRef<ElementRef<typeof motion.div>, DivProps>(
  ({ className, children, ...props }, ref) => (
    <motion.div ref={ref} variants={staggerItem} className={className} {...props}>
      {children}
    </motion.div>
  ),
);
Stagger.Item.displayName = 'Stagger.Item';

type MotionButtonProps = ComponentPropsWithoutRef<typeof motion.button>;

/** A <button> with the standard press-down spring. Drop-in where you'd use a bare button. */
export const Pressable = forwardRef<ElementRef<typeof motion.button>, MotionButtonProps>(
  ({ className, children, ...props }, ref) => (
    <motion.button ref={ref} className={cn('outline-none', className)} {...pressable} {...props}>
      {children}
    </motion.button>
  ),
);
Pressable.displayName = 'Pressable';
