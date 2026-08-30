'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Sunrise } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import {
  getDigestPreference,
  getPushSubscriptionState,
  isPushSupported,
  sendDigestTest,
  setDigestPreference,
  subscribeToPush,
  unsubscribeFromPush,
  type PushSubscriptionState,
} from '@/lib/push-notifications';

// Web Push requires https (or localhost) plus an installed service worker (see PwaRegistrar) --
// subscribing itself stays a deliberate, user-initiated click here rather than an automatic
// prompt on page load.
export function PushNotificationsToggle() {
  const { showToast } = useToast();
  const [state, setState] = useState<PushSubscriptionState | 'checking'>('checking');
  const [busy, setBusy] = useState(false);
  // Morning digest opt-in -- null until loaded (only fetched once push is actually enabled).
  const [digest, setDigest] = useState<boolean | null>(null);
  const [digestBusy, setDigestBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }
    getPushSubscriptionState().then((next) => {
      setState(next);
      if (next === 'subscribed') getDigestPreference().then(setDigest).catch(() => setDigest(true));
    });
  }, []);

  async function handleEnable() {
    setBusy(true);
    try {
      await subscribeToPush();
      setState('subscribed');
      showToast('تم تفعيل إشعارات الهاتف بنجاح.');
      getDigestPreference().then(setDigest).catch(() => setDigest(true));
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
      setDigest(null);
      showToast('تم إلغاء تفعيل إشعارات الهاتف.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إلغاء تفعيل الإشعارات.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDigestChange(next: boolean) {
    const prev = digest;
    setDigest(next);
    setDigestBusy(true);
    try {
      await setDigestPreference(next);
    } catch {
      setDigest(prev);
      showToast('تعذّر حفظ التفضيل.', 'error');
    } finally {
      setDigestBusy(false);
    }
  }

  async function handleSendTest() {
    setTestBusy(true);
    try {
      const { message } = await sendDigestTest();
      showToast(message);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إرسال الملخص التجريبي.', 'error');
    } finally {
      setTestBusy(false);
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

      {state === 'subscribed' && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Sunrise className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div>
                <h3 id="digest-pref-label" className="text-sm font-medium text-foreground">
                  ملخص الصباح اليومي
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  محاضرات اليوم، التسليمات القريبة، والإعلانات الجديدة — في إشعار واحد كل صباح.
                </p>
              </div>
            </div>
            {digest === null ? (
              <BellRing className="h-4 w-4 animate-pulse text-muted-foreground" />
            ) : (
              <Switch
                checked={digest}
                onCheckedChange={handleDigestChange}
                disabled={digestBusy}
                aria-labelledby="digest-pref-label"
              />
            )}
          </div>
          {digest && (
            <button
              type="button"
              onClick={handleSendTest}
              disabled={testBusy}
              className="mt-2.5 text-xs font-medium text-accent hover:underline disabled:opacity-50"
            >
              إرسال ملخص تجريبي الآن
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
