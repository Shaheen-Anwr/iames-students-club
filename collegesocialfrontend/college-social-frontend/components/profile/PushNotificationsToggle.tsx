'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { getPushSubscriptionState, isPushSupported, subscribeToPush, unsubscribeFromPush, type PushSubscriptionState } from '@/lib/push-notifications';

// Web Push requires https (or localhost) plus an installed service worker (see PwaRegistrar) --
// subscribing itself stays a deliberate, user-initiated click here rather than an automatic
// prompt on page load.
export function PushNotificationsToggle() {
  const { showToast } = useToast();
  const [state, setState] = useState<PushSubscriptionState | 'checking'>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }
    getPushSubscriptionState().then(setState);
  }, []);

  async function handleEnable() {
    setBusy(true);
    try {
      await subscribeToPush();
      setState('subscribed');
      showToast('تم تفعيل إشعارات الهاتف بنجاح.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذّر تفعيل الإشعارات.', 'error');
      setState(await getPushSubscriptionState());
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setState('granted');
      showToast('تم إلغاء تفعيل إشعارات الهاتف.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إلغاء تفعيل الإشعارات.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">إشعارات الهاتف</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {state === 'unsupported' && isIos && 'متاح فقط إذا أضفت التطبيق إلى الشاشة الرئيسية على آيفون (شارك ← إضافة إلى الشاشة الرئيسية).'}
            {state === 'unsupported' && !isIos && 'متصفحك لا يدعم إشعارات الدفع.'}
            {state === 'denied' && 'تم رفض إذن الإشعارات من إعدادات المتصفح. فعّله من هناك للمتابعة.'}
            {(state === 'default' || state === 'granted') && 'فعّل الإشعارات لتصلك تنبيهات على هاتفك حتى عند إغلاق التطبيق.'}
            {state === 'subscribed' && 'الإشعارات مفعّلة على هذا الجهاز.'}
            {state === 'checking' && 'جارٍ التحقق...'}
          </p>
        </div>
        {(state === 'default' || state === 'granted') && (
          <Button variant="ghost" size="sm" onClick={handleEnable} loading={busy}>
            <Bell className="h-3.5 w-3.5" />
            تفعيل
          </Button>
        )}
        {state === 'subscribed' && (
          <Button variant="ghost" size="sm" onClick={handleDisable} loading={busy}>
            <BellOff className="h-3.5 w-3.5" />
            إلغاء التفعيل
          </Button>
        )}
        {state === 'checking' && <BellRing className="h-4 w-4 animate-pulse text-muted-foreground" />}
      </div>
    </Card>
  );
}
