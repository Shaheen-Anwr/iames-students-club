'use client';

// Chrome/Edge/Android fire `beforeinstallprompt` once, early, when the app can be installed. It's
// caught here at module load -- PwaRegistrar imports this file and every page mounts it -- so the
// push banner can still offer "install" later even if the event fired before the banner mounted.

export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // our banner offers it instead of the browser's own infobar
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function installPromptAvailable(): boolean {
  return deferred !== null;
}

export function onInstallPromptChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows the browser's install dialog; true if the user accepted. The event is single-use. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  notify();
  await event.prompt();
  return (await event.userChoice).outcome === 'accepted';
}

/** Running as the installed app (home-screen / app window) rather than a browser tab. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIosDevice(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isPhone(): boolean {
  return typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}
