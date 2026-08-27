'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe media-query hook. Starts at `defaultState` (server + first client paint) then
 * corrects on mount. Fine for interaction-gated UI (modals, menus) where the first real read
 * happens after hydration anyway.
 */
export function useMediaQuery(query: string, defaultState = false): boolean {
  const [matches, setMatches] = useState(defaultState);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Matches the Tailwind `md` breakpoint boundary -- true on phones. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
