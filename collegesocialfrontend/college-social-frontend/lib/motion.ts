'use client';

/**
 * Shared motion vocabulary for the app. One place so every surface animates with the same
 * springs, durations and easings instead of each component inventing its own.
 *
 * Reduced-motion: <MotionConfig reducedMotion="user"> in components/Providers.tsx makes
 * framer-motion drop transform/opacity animation for users who ask for it, and the global
 * @media (prefers-reduced-motion) block in globals.css neutralises CSS transitions. Components
 * generally don't need to special-case it.
 */
import type { Transition, Variants } from 'framer-motion';

export { motion, AnimatePresence, MotionConfig, useReducedMotion, LayoutGroup } from 'framer-motion';

/** Springs + tweens, keyed by feel. Prefer these over inline `transition={{...}}`. */
export const transitions = {
  /** Buttons, toggles, small UI reactions -- fast, barely any overshoot. */
  snappy: { type: 'spring', stiffness: 520, damping: 32, mass: 0.7 } satisfies Transition,
  /** Cards, sheets, layout shifts -- settled, a little follow-through. */
  smooth: { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 } satisfies Transition,
  /** Large surfaces / hero moves -- slow and deliberate. */
  gentle: { type: 'spring', stiffness: 180, damping: 30 } satisfies Transition,
  /** Non-spring fallback matching the CSS `--dur-base` / `--ease-standard` tokens. */
  fade: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } satisfies Transition,
} as const;

/** `whileInView` viewport config -- animate once, a touch before fully on screen. */
export const viewportOnce = { once: true, margin: '0px 0px -10% 0px' } as const;

/** Fade + rise. Pair initial/animate, or feed straight into a motion component's `variants`. */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: transitions.smooth },
};

/** Plain fade, no movement -- for overlays/scrims. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transitions.fade },
};

/**
 * Parent/child pair for list entrances. Put `staggerContainer` on the wrapper (as `variants`
 * with initial="hidden" animate="show") and `staggerItem` on each child.
 */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};
export const staggerItem: Variants = fadeInUp;

/** Spread onto any `motion.*` element to get a consistent press-down. */
export const pressable = {
  whileTap: { scale: 0.97 },
  transition: transitions.snappy,
} as const;

/** Spread for a hover-lift affordance on interactive cards/tiles. */
export const hoverLift = {
  whileHover: { y: -2 },
  whileTap: { y: 0, scale: 0.99 },
  transition: transitions.snappy,
} as const;
