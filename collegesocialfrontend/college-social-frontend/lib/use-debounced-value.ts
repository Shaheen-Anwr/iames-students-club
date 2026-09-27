'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value` only after it has stopped changing for `delayMs`. Use it to drive a query from a
 * text input so typing "رياضيات" fires one request instead of seven (and a slow early response
 * can't overwrite the final one).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
