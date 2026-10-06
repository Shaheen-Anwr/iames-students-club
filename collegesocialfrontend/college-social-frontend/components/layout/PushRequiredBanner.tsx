'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellOff, BellRing, Download, Share } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import {
  getPushSubscriptionState,
  isPushSupported,
  resyncPushSubscription,
  subscribeToPush,
  type PushSubscriptionState,
} from '@/lib/push-notifications';
import { installPromptAvailable, isIosDevice, isPhone, isStandaloneDisplay, onInstallPromptChange, promptInstall } from '@/lib/pwa-install';
import { cn } from '@/lib/utils';

type Need = 'enable' | 'denied' | 'ios-install' | 'install';

// Chat notifications are mandatory. Until this device can receive them, this strip sits under the
// top bar on every screen with no close button (the app stays usable -- product decision,
// 2026-10-07):
//   enable      -- permission not given yet: one tap turns them on
//   denied      -- blocked in the phone/browser settings; no website can lift that itself, so it
//                  explains where to re-allow it, and re-checks whenever the app comes back
//   ios-install -- iPhone only gets web push once the app is on the home screen
//   install     -- on, but on a phone in a browser tab: install the app so notifications open it
export function PushRequiredBanner() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [state, setState] = useState<PushSubscriptionState | 'checking'>('checking');
  const [canInstall, setCanInstall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  const check = useCallback(() => {
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }
    getPushSubscriptionState()
      .then(setState)
      .catch(() => setState('unsupported'));
  }, []);

  // Re-check whenever the app comes back to the front (e.g. from the phone's settings) or the
  // browser reports a permission change.
  useEffect(() => {
    check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    let status: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: 'notifications' as PermissionName })
      .then((s) => {
        status = s;
        s.onchange = check;
      })
      .catch(() => undefined);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      if (status) status.onchange = null;
    };
  }, [check]);

  useEffect(() => {
    setCanInstall(installPromptAvailable());
    return onInstallPromptChange(() => setCanInstall(installPromptAvailable()));
  }, []);

  // Already subscribed on this device: make sure the server sends it *this* account's chats.
  useEffect(() => {
    if (user && state === 'subscribed') void resyncPushSubscription(user._id);
  }, [user, state]);

  if (!user || state === 'checking') return null;

  const need: Need | null =
    isIosDevice() && !isStandaloneDisplay()
      ? 'ios-install'
      : state === 'denied'
        ? 'denied'
        : state === 'default' || state === 'granted'
          ? 'enable'
          : state === 'subscribed' && isPhone() && !isStandaloneDisplay() && canInstall
            ? 'install'
            : null;
  if (!need) return null;

  async function enable() {
    setBusy(true);
    try {
      await subscribeToPush();
      showToast('تم! ستصلك رسائل الدردشة على شاشتك بصوت حتى والتطبيق مقفول.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذّر تفعيل الإشعارات.', 'error');
    } finally {
      setBusy(false);
      check();
    }
  }

  async function install() {
    if (await promptInstall()) showToast('تم تثبيت التطبيق — افتحه من الشاشة الرئيسية.');
  }

  const android = /android/i.test(navigator.userAgent);
  const button = 'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60';

  return (
    <div
      role="status"
      className={cn(
        'border-b px-4 py-2.5 text-sm',
        need === 'denied' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-accent/30 bg-accent/10 text-accent',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {need === 'denied' ? (
          <BellOff className="h-4 w-4 shrink-0" />
        ) : need === 'ios-install' ? (
          <Share className="h-4 w-4 shrink-0" />
        ) : need === 'install' ? (
          <Download className="h-4 w-4 shrink-0" />
        ) : (
          <BellRing className="h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 leading-relaxed">
          {need === 'enable' && 'فعّل إشعارات الدردشة عشان توصلك الرسائل على موبايلك حتى والتطبيق مقفول.'}
          {need === 'denied' && 'إشعارات الدردشة مقفولة من إعدادات جهازك — لازم تفتحها عشان توصلك الرسائل.'}
          {need === 'ios-install' &&
            'عشان توصلك الرسائل على الآيفون: اضغط مشاركة ⬆️ ثم «إضافة إلى الشاشة الرئيسية»، وافتح التطبيق من هناك.'}
          {need === 'install' && 'ثبّت التطبيق على موبايلك عشان الإشعارات تفتح على التطبيق مباشرة.'}
        </span>
        {need === 'enable' && (
          <button type="button" onClick={() => void enable()} disabled={busy} className={cn(button, 'border-accent/40 hover:bg-accent/15')}>
            {busy ? 'جارٍ التفعيل…' : 'تفعيل'}
          </button>
        )}
        {need === 'denied' && (
          <button type="button" onClick={() => setHelp((v) => !v)} className={cn(button, 'border-danger/40 hover:bg-danger/15')}>
            {help ? 'إخفاء' : 'إزاي؟'}
          </button>
        )}
        {need === 'install' && (
          <button type="button" onClick={() => void install()} className={cn(button, 'border-accent/40 hover:bg-accent/15')}>
            تثبيت
          </button>
        )}
      </div>
      {need === 'denied' && help && (
        <ol className="mt-2 list-decimal space-y-0.5 ps-11 text-xs leading-relaxed">
          {android ? (
            <>
              <li>افتح الإعدادات ← التطبيقات ← IAEMS (أو Chrome لو بتستخدم المتصفح).</li>
              <li>الإشعارات ← اسمح بالإشعارات، وفعّل «الظهور على الشاشة» و«الصوت».</li>
              <li>ارجع للتطبيق — هيتأكد لوحده.</li>
            </>
          ) : (
            <>
              <li>اضغط على أيقونة القفل 🔒 بجوار عنوان الموقع.</li>
              <li>الإشعارات ← سماح، ثم أعد تحميل الصفحة.</li>
            </>
          )}
        </ol>
      )}
    </div>
  );
}
