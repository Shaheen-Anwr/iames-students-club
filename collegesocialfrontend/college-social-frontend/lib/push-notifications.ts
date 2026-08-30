import { api } from './api';

export type PushSubscriptionState = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed';

// iOS Safari only supports Web Push once the app has been added to the home screen (16.4+).
// In-browser Safari (not installed) has no Push API at all -- treat it as unsupported so the UI
// can show install instructions instead of a dead "enable" button.
function isIosStandaloneRequired(): boolean {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIos && !isStandalone;
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && !isIosStandaloneRequired();
}

export async function getPushSubscriptionState(): Promise<PushSubscriptionState> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) return 'subscribed';
  return Notification.permission === 'granted' ? 'granted' : 'default';
}

// Base64url (VAPID key format) -> Uint8Array, as required by pushManager.subscribe(). Built via
// `new Uint8Array(length)` (not `.from()`) so it's concretely ArrayBuffer-backed, not the wider
// ArrayBufferLike TS infers from `.from()`, which pushManager.subscribe()'s types reject.
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

export async function subscribeToPush(): Promise<void> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) throw new Error('الإشعارات غير مفعّلة على الخادم حاليًا.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('لم يتم منح إذن الإشعارات.');

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const json = subscription.toJSON();
  await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await api.post('/push/unsubscribe', { endpoint });
}

// --- Morning digest preference ---
// A once-a-day push summarising the day ahead (lectures, assignments due soon, new
// announcements). Server-side default is opted-in; this only matters once push is enabled.

export async function getDigestPreference(): Promise<boolean> {
  const { dailyDigest } = await api.get<{ dailyDigest: boolean }>('/push/preferences');
  return dailyDigest;
}

export async function setDigestPreference(dailyDigest: boolean): Promise<void> {
  await api.patch('/push/preferences', { dailyDigest });
}

// Fires the caller's own digest immediately so they can see what it looks like. `delivered` is
// false when there was nothing to summarise today.
export async function sendDigestTest(): Promise<{ delivered: boolean; message: string }> {
  return api.post<{ delivered: boolean; message: string }>('/digest/test');
}
