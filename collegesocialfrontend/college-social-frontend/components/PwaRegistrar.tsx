'use client';

import { useEffect } from 'react';
import { initOfflineQueue } from '@/lib/offline-queue';

// Registers the service worker (regardless of login state) so the browser can offer "Add to
// Home Screen", receive push events, and serve the offline layer in public/sw.js. The actual
// push *subscription* stays a user-initiated action (see PushNotificationsToggle).
//
// Also starts the offline write outbox (lib/offline-queue) -- api.sendQueued() writes that
// failed while offline are replayed from here on reconnect.
//
// Update handling: when a new sw.js ships, the fresh worker installs but sits "waiting". We nudge
// it to activate immediately (SKIP_WAITING) and reload the page once when it takes control, so a
// deploy is picked up on the next visit without a hard refresh -- and without an update toast.
export function PwaRegistrar() {
  useEffect(() => {
    initOfflineQueue();
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        const promote = (worker: ServiceWorker | null) => {
          if (worker && navigator.serviceWorker.controller) worker.postMessage('SKIP_WAITING');
        };
        promote(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed') promote(installing);
          });
        });
      })
      .catch(() => {});
  }, []);

  return null;
}
