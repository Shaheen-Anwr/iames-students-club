'use client';

// Lightweight haptic feedback for the moments that should feel physical -- sending a message,
// completing a task, a streak ticking up, releasing a swipe/pull gesture. Uses the Vibration API
// (Android Chrome / installed PWA); a no-op everywhere it isn't supported (all of iOS Safari,
// desktop), so callers never have to feature-check.
//
// Respected opt-outs, both checked live on every call:
//   * OS "reduce motion" -- someone who suppresses animation almost certainly doesn't want the
//     phone buzzing either.
//   * localStorage 'haptics' === 'off' -- a future settings toggle can just write this key.

type HapticPattern = 'tap' | 'select' | 'success' | 'warning' | 'error' | 'impact';

// Durations/patterns in ms. Kept short and distinct -- a "tap" is barely perceptible, "error" is
// the only one that repeats so it reads as "something's wrong" without looking.
const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  select: 12,
  success: [14, 40, 22],
  warning: [22, 50, 22],
  error: [30, 45, 30, 45, 30],
  impact: 18,
};

function enabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (window.localStorage.getItem('haptics') === 'off') return false;
  } catch {
    // localStorage/matchMedia can throw in locked-down contexts -- fall through and allow.
  }
  return true;
}

/** Fire a named haptic. Safe to call unconditionally and on every platform. */
export function haptic(pattern: HapticPattern = 'tap'): void {
  if (!enabled()) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Some browsers throw if called outside a user gesture -- nothing to do, just skip.
  }
}

/** Cancel any ongoing vibration (e.g. when a gesture is aborted). */
export function cancelHaptic(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(0);
  } catch {
    /* no-op */
  }
}
