'use client';

import { useEffect, useState } from 'react';

// Height gap above which the visual viewport is assumed to be covered by an on-screen keyboard.
const KEYBOARD_THRESHOLD_PX = 150;

/**
 * Pins the app shell to the *visible* viewport on mobile. Without this, focusing an input opens
 * the keyboard and the browser (iOS Safari / standalone PWA especially) scrolls the whole
 * document up -- the top bar slides off-screen and fixed bottom bars float over the keyboard.
 *
 * Writes the visible height to `--app-height` on <html> (the shell sizes itself from it), resets
 * any document scroll the browser introduced, and reports whether the keyboard is open (also as
 * `data-keyboard="open"` on <html>).
 */
export function useVisualViewport(): { keyboardOpen: boolean } {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty('--app-height', `${Math.round(vv.height)}px`);
        const open = window.innerHeight - vv.height > KEYBOARD_THRESHOLD_PX;
        setKeyboardOpen(open);
        // CSS hook: the keyboard covers the home indicator, so bottom bars drop their safe-area
        // padding while it's up (see --safe-bottom in globals.css).
        if (open) root.dataset.keyboard = 'open';
        else delete root.dataset.keyboard;
        // The shell is overflow-hidden; any document scroll here was the browser panning the
        // page to reveal the focused input. Undo it so the header stays put.
        if (window.scrollY !== 0) window.scrollTo(0, 0);
      });
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--app-height');
      delete root.dataset.keyboard;
    };
  }, []);

  return { keyboardOpen };
}
