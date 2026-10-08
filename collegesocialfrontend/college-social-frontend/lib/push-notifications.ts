import { api } from './api';
import { AnalyticsEvent, track } from './analytics';

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
  // Push opt-in rate is a headline retention-channel metric.
  track(AnalyticsEvent.PushPermissionResult, { result: permission });
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

// --- Push notification preferences ---
// Two opt-in-by-default pushes: the once-a-day morning digest, and a "your lecture starts in
// 15 min" reminder. Both only matter once phone push is enabled.

export interface PushPreferences {
  dailyDigest: boolean;
  classReminders: boolean;
}

export async function getPushPreferences(): Promise<PushPreferences> {
  return api.get<PushPreferences>('/push/preferences');
}

export async function setPushPreferences(patch: Partial<PushPreferences>): Promise<PushPreferences> {
  return api.patch<PushPreferences>('/push/preferences', patch);
}

// Fires the caller's own digest immediately so they can see what it looks like. `delivered` is
// false when there was nothing to summarise today.
export async function sendDigestTest(): Promise<{ delivered: boolean; message: string }> {
  return api.post<{ delivered: boolean; message: string }>('/digest/test');
}

// Sends a sample "lecture in 15 min" push to the caller.
export async function sendClassReminderTest(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/schedule/reminders/test');
}

// A sample notification a few seconds from now, so the user can leave the app and see exactly
// how a message will pop up (sound, vibration, banner) on this phone.
export async function sendPushTest(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/push/test');
}

// Opening a conversation clears its notification from the phone's notification shade, the way
// WhatsApp does (sw.js tags chat notifications `chat-<conversationId>`).
export async function closeChatNotifications(conversationId: string): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const open = await registration?.getNotifications({ tag: `chat-${conversationId}` });
    open?.forEach((n) => n.close());
    // sw.js keeps groups quiet for a few minutes after they ring; having read the chat, the next
    // message should ring again (same cache name + key format as sw.js).
    await (await caches.open('iaems-notify-state')).delete(`/__notify/${encodeURIComponent(`chat-${conversationId}`)}`);
  } catch {
    /* notifications / Cache Storage unsupported here */
  }
}

// Chat notifications are mandatory, so a device's subscription must follow whoever is signed in.
// Once per app load (and again after switching accounts) this re-posts the existing subscription:
// the server moves the endpoint off any other account (a shared phone stops getting the previous
// person's chats) and re-adds it if it had been pruned.
let syncedFor: string | null = null;
export async function resyncPushSubscription(userId: string): Promise<void> {
  if (syncedFor === userId || !isPushSupported() || Notification.permission !== 'granted') return;
  syncedFor = userId;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const json = subscription.toJSON();
    await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
  } catch {
    syncedFor = null; // try again next time
  }
}

// Signing out: stop sending this account's chats to this device. The browser subscription itself
// stays, so the next account to sign in here picks it up through resyncPushSubscription().
export async function detachPushSubscription(): Promise<void> {
  syncedFor = null;
  try {
    if (!isPushSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) await api.post('/push/unsubscribe', { endpoint: subscription.endpoint });
  } catch {
    /* best effort -- signing out must never fail on this */
  }
}
