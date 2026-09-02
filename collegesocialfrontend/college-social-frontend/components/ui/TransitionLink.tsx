'use client';

// Drop-in for `next/link` that runs the navigation inside `document.startViewTransition`
// (via next-view-transitions), so the route change cross-fades instead of snapping. Same
// props as `next/link`. Use it for deliberate navigation surfaces (nav bars, command
// palette, quick actions); plain `next/link` is fine everywhere a transition would just be
// noise. Falls back to a normal navigation where the View Transitions API is unavailable or
// the user prefers reduced motion.
export { Link as TransitionLink } from 'next-view-transitions';
export { useTransitionRouter } from 'next-view-transitions';
