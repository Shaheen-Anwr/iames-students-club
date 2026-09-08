'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import {
  ensureDeviceRegistered,
  fetchStatus,
  isE2eeAvailable,
  isE2eeEnabledOnThisDevice,
  setE2eeEnabledOnThisDevice,
  wipeE2ee,
  type E2eeStatus,
} from '@/lib/e2ee';

// Per-device control for chat end-to-end encryption. Hidden entirely until the feature flag is
// live (isE2eeAvailable), so it stays invisible on production until we flip it on.
export function EncryptionSettings() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<E2eeStatus | null>(null);

  const available = isE2eeAvailable();

  const refreshStatus = useCallback(() => {
    if (!available) return;
    fetchStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [available]);

  useEffect(() => {
    if (!available) return;
    setEnabled(isE2eeEnabledOnThisDevice());
    refreshStatus();
  }, [available, refreshStatus]);

  if (!available || !user) return null;

  async function toggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        setE2eeEnabledOnThisDevice(true);
        setEnabled(true);
        await ensureDeviceRegistered(user!._id);
        refreshStatus();
        showToast('تم تفعيل التشفير على هذا الجهاز.', 'success');
      } else {
        const ok = window.confirm(
          'إيقاف التشفير على هذا الجهاز سيحذف مفاتيحه، ولن تتمكّن من قراءة المحادثات المشفّرة هنا حتى تعيد تفعيله. متابعة؟',
        );
        if (!ok) return;
        setE2eeEnabledOnThisDevice(false);
        setEnabled(false);
        await wipeE2ee();
        setStatus(null);
        showToast('تم إيقاف التشفير على هذا الجهاز.', 'success');
      }
    } catch {
      showToast('تعذّر تحديث إعداد التشفير.', 'error');
      setEnabled(isE2eeEnabledOnThisDevice());
    } finally {
      setBusy(false);
    }
  }

  async function resetKeys() {
    if (busy) return;
    const ok = window.confirm(
      'إعادة تعيين المفاتيح تنشئ هويّة تشفير جديدة لهذا الجهاز. لن تُقرأ الرسائل المشفّرة القديمة، وسيحتاج من يراسلك إلى تأكيد هويّتك من جديد. متابعة؟',
    );
    if (!ok) return;
    setBusy(true);
    try {
      await wipeE2ee();
      await ensureDeviceRegistered(user!._id);
      refreshStatus();
      showToast('تمت إعادة تعيين مفاتيح التشفير.', 'success');
    } catch {
      showToast('تعذّرت إعادة التعيين.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-2.5">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">التشفير من طرف إلى طرف</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            محادثاتك الفردية تُشفَّر على جهازك، ولا يمكن لأحد قراءتها في الطريق — ولا حتى نحن. المفاتيح
            الخاصة لا تغادر هذا المتصفح.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5">
        <div className="min-w-0">
          <p className="text-sm text-foreground">مُفعّل على هذا الجهاز</p>
          <p className="text-[11px] text-muted-foreground">
            {enabled
              ? status?.registered
                ? 'الجهاز مُسجَّل وجاهز.'
                : 'جارٍ تجهيز مفاتيح هذا الجهاز…'
              : 'المحادثات المشفّرة لن تظهر على هذا الجهاز.'}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy}
          onCheckedChange={toggle}
          aria-label="تفعيل التشفير على هذا الجهاز"
        />
      </div>

      {enabled && (
        <div className="space-y-2 pt-3">
          {status?.registered && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              مفاتيح لمرة واحدة متبقّية على الخادم: {status.oneTimePreKeysLeft}
            </div>
          )}
          <button
            type="button"
            onClick={resetKeys}
            disabled={busy}
            className="flex items-center gap-2 text-xs font-medium text-danger hover:underline disabled:opacity-50"
          >
            <KeyRound className="h-3.5 w-3.5" />
            إعادة تعيين مفاتيح هذا الجهاز
          </button>
        </div>
      )}
    </Card>
  );
}
