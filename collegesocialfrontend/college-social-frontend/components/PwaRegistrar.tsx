'use client';

import { useEffect } from 'react';

// Registers the service worker unconditionally (regardless of login state) so the browser can
// offer "Add to Home Screen" and receive push events -- separate from the actual push
// subscription, which stays a user-initiated action (see PushNotificationsToggle).
export function PwaRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return null;
}
