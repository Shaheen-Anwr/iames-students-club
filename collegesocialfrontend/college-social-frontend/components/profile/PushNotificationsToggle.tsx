'use client';

import { useEffect, useState } from 'react';
import { Bell, BellRing, Sunrise, Clock3, MessageCircle, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { chatSoundsEnabled, playChatSound, setChatSoundsEnabled } from '@/lib/chat-sounds';
import {
  getPushPreferences,
  getPushSubscriptionState,
  isPushSupported,
  sendClassReminderTest,
  sendDigestTest,
  sendPushTest,
  setPushPreferences,
  subscribeToPush,
  type PushPreferences,
  type PushSubscriptionState,
} from '@/lib/push-notifications';

// Web Push requires https (or localhost) plus an installed service worker (see PwaRegistrar) --
// subscribing itself stays a deliberate, user-initiated click here rather than an automatic
// prompt on page load.
export function PushNotificationsToggle() {
  const { showToast } = useToast();
  const [state, setState] = useState<PushSubscriptionState | 'checking'>('checking');
  const [busy, setBusy] = useState(false);
  // Preferences -- null until loaded (only fetched once push is actually enabled).
  const [prefs, setPrefs] = useState<PushPreferences | null>(null);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [testBusy, setTestBusy] = useState<'digest' | 'class' | 'push' | null>(null);
  // In-app message sounds -- a per-device setting, read after mount (localStorage).
  const [sounds, setSounds] = useState(true);
  useEffect(() => setSounds(chatSoundsEnabled()), []);

  const loadPrefs = () =>
    getPushPreferences()
      .then(setPrefs)
      .catch(() => setPrefs({ dailyDigest: true, classReminders: true }));

  useEffect(() => {
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }
    getPushSubscriptionState().then((next) => {
      setState(next);
      if (next === 'subscribed') loadPrefs();
    });
  }, []);

  async function handleEnable() {
    setBusy(true);
    try {
      await subscribeToPush();
      setState('subscribed');
      showToast('تم تفعيل إشعارات الهاتف بنجاح.');
      loadPrefs();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذّر تفعيل الإشعارات.', 'error');
      setState(await getPushSubscriptionState());
    } finally {
      setBusy(false);
    }
  }

  async function updatePref(patch: Partial<PushPreferences>) {
    if (!prefs) return;
    const prev = prefs;
    setPrefs({ ...prefs, ...patch });
    setPrefsBusy(true);
    try {
      setPrefs(await setPushPreferences(patch));
    } catch {
      setPrefs(prev);
      showToast('تعذّر حفظ التفضيل.', 'error');
    } finally {
      setPrefsBusy(false);
    }
  }

  async function runTest(which: 'digest' | 'class' | 'push') {
    setTestBusy(which);
    try {
      const { message } =
        which === 'push' ? await sendPushTest() : which === 'digest' ? await sendDigestTest() : await sendClassReminderTest();
      showToast(message);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إرسال الإشعار التجريبي.', 'error');
    } finally {
      setTestBusy(null);
    }
  }

  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  function toggleSounds(on: boolean) {
    setChatSoundsEnabled(on);
    setSounds(on);
    if (on) playChatSound('notify', { force: true });
  }

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
            {state === 'subscribed' && 'الإشعارات مفعّلة على هذا الجهاز. إشعارات الدردشة إجبارية ولا يمكن إيقافها.'}
            {state === 'checking' && 'جارٍ التحقق...'}
          </p>
        </div>
        {(state === 'default' || state === 'granted') && (
          <Button variant="ghost" size="sm" onClick={handleEnable} loading={busy}>
            <Bell className="h-3.5 w-3.5" />
            تفعيل
          </Button>
        )}
        {state === 'checking' && <BellRing className="h-4 w-4 animate-pulse text-muted-foreground" />}
      </div>

      {state === 'subscribed' && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {prefs === null ? (
            <BellRing className="h-4 w-4 animate-pulse text-muted-foreground" />
          ) : (
            <>
              <div>
                <div className="flex items-start gap-2.5">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <div>
                    <h3 className="text-sm font-medium text-foreground">رسائل الدردشة</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      كل رسالة جديدة تظهر أعلى الشاشة بصوت واهتزاز حتى والتطبيق مقفول. إشعارات الدردشة لا يمكن إيقافها، ويمكن كتم المجموعات فقط.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => runTest('push')}
                  disabled={testBusy === 'push'}
                  className="mt-2.5 text-xs font-medium text-accent hover:underline disabled:opacity-50"
                >
                  إرسال إشعار تجريبي
                </button>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  {isIos
                    ? 'لا يظهر أو بدون صوت؟ إعدادات الآيفون ← الإشعارات ← التطبيق: فعّل «السماح بالإشعارات» و«الأصوات» و«اللافتات».'
                    : 'لا يظهر أعلى الشاشة أو بدون صوت؟ إعدادات الهاتف ← التطبيقات ← التطبيق (أو Chrome) ← الإشعارات: فعّل «الظهور على الشاشة» و«الصوت».'}
                </p>
              </div>
              <PrefRow
                icon={<Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
                id="class-reminders-pref"
                title="تنبيه قبل المحاضرة"
                desc="إشعار قبل بدء كل محاضرة في جدولك بـ15 دقيقة، مع اسم المادة والقاعة."
                checked={prefs.classReminders}
                disabled={prefsBusy}
                onChange={(v) => updatePref({ classReminders: v })}
                onTest={() => runTest('class')}
                testBusy={testBusy === 'class'}
                testLabel="إرسال تنبيه تجريبي"
              />
              <PrefRow
                icon={<Sunrise className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
                id="digest-pref"
                title="ملخص الصباح اليومي"
                desc="محاضرات اليوم، التسليمات القريبة، والإعلانات الجديدة — في إشعار واحد كل صباح."
                checked={prefs.dailyDigest}
                disabled={prefsBusy}
                onChange={(v) => updatePref({ dailyDigest: v })}
                onTest={() => runTest('digest')}
                testBusy={testBusy === 'digest'}
                testLabel="إرسال ملخص تجريبي"
              />
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-start gap-2.5">
          <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div>
            <h3 id="chat-sounds-pref" className="text-sm font-medium text-foreground">
              أصوات الرسائل داخل التطبيق
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              صوت خفيف عند وصول رسالة أو إرسالها وأنت تستخدم التطبيق.{' '}
              <button type="button" onClick={() => playChatSound('notify', { force: true })} className="font-medium text-accent hover:underline">
                تجربة
              </button>
            </p>
          </div>
        </div>
        <Switch checked={sounds} onCheckedChange={toggleSounds} aria-labelledby="chat-sounds-pref" />
      </div>
    </Card>
  );
}

function PrefRow({
  icon,
  id,
  title,
  desc,
  checked,
  disabled,
  onChange,
  onTest,
  testBusy,
  testLabel,
}: {
  icon: React.ReactNode;
  id: string;
  title: string;
  desc: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  onTest: () => void;
  testBusy: boolean;
  testLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {icon}
          <div>
            <h3 id={id} className="text-sm font-medium text-foreground">
              {title}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
          </div>
        </div>
        <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-labelledby={id} />
      </div>
      {checked && (
        <button
          type="button"
          onClick={onTest}
          disabled={testBusy}
          className="mt-2.5 text-xs font-medium text-accent hover:underline disabled:opacity-50"
        >
          {testLabel}
        </button>
      )}
    </div>
  );
}
