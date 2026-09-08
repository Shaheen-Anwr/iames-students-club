'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DownloadCloud, KeyRound, Lock, RotateCcw, ShieldCheck, UploadCloud } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import {
  createBackup,
  deleteServerBackup,
  ensureDeviceRegistered,
  fetchServerBackup,
  fetchStatus,
  forceCreateIdentity,
  hasLocalKeys,
  isE2eeAvailable,
  isE2eeEnabledOnThisDevice,
  putServerBackup,
  republishAfterRestore,
  restoreBackup,
  setE2eeEnabledOnThisDevice,
  wipeE2ee,
  type E2eeStatus,
} from '@/lib/e2ee';

const inputCls =
  'w-full rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none';

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Per-device control for chat end-to-end encryption + passphrase key backup (P6). Hidden entirely
// until the feature flag is live, so it stays invisible on production until we flip it on.
export function EncryptionSettings() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const available = isE2eeAvailable();

  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<E2eeStatus | null>(null);
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);

  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!available) return;
    setEnabled(isE2eeEnabledOnThisDevice());
    setHasKeys(await hasLocalKeys());
    fetchStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [available]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!available || !user) return null;
  const uid = user._id;

  async function toggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        setE2eeEnabledOnThisDevice(true);
        setEnabled(true);
        await ensureDeviceRegistered(uid);
        await refresh();
        showToast('تم تفعيل التشفير على هذا الجهاز.', 'success');
      } else {
        if (
          !window.confirm(
            'إيقاف التشفير على هذا الجهاز سيحذف مفاتيحه، ولن تتمكّن من قراءة المحادثات المشفّرة هنا حتى تعيد تفعيله. متابعة؟',
          )
        )
          return;
        setE2eeEnabledOnThisDevice(false);
        setEnabled(false);
        await wipeE2ee();
        await refresh();
        showToast('تم إيقاف التشفير على هذا الجهاز.', 'success');
      }
    } catch {
      showToast('تعذّر تحديث إعداد التشفير.', 'error');
      setEnabled(isE2eeEnabledOnThisDevice());
    } finally {
      setBusy(false);
    }
  }

  async function saveBackup(toFile: boolean) {
    if (busy) return;
    if (pass.length < 8) return showToast('اختر كلمة مرور من ٨ أحرف على الأقل.', 'error');
    if (pass !== pass2) return showToast('كلمتا المرور غير متطابقتين.', 'error');
    setBusy(true);
    try {
      const blob = await createBackup(pass);
      if (toFile) {
        downloadText(blob, `iaems-encryption-backup-${new Date().toISOString().slice(0, 10)}.json`);
      } else {
        await putServerBackup(blob);
        showToast('تم حفظ النسخة الاحتياطية.', 'success');
      }
      setPass('');
      setPass2('');
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'تعذّر إنشاء النسخة الاحتياطية.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeBackup() {
    if (busy || !window.confirm('حذف النسخة الاحتياطية من الخادم؟ لن تتمكّن من الاستعادة بها لاحقًا.'))
      return;
    setBusy(true);
    try {
      await deleteServerBackup();
      await refresh();
      showToast('تم حذف النسخة الاحتياطية.', 'success');
    } catch {
      showToast('تعذّر الحذف.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function doRestore(envelopeJson: string) {
    if (!restorePass) return showToast('أدخل كلمة مرور النسخة الاحتياطية.', 'error');
    setBusy(true);
    try {
      await restoreBackup(restorePass, envelopeJson);
      await republishAfterRestore(uid);
      showToast('تمت استعادة المفاتيح. جارٍ إعادة التحميل…', 'success');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'تعذّرت الاستعادة.', 'error');
      setBusy(false);
    }
  }

  async function restoreFromServer() {
    if (busy) return;
    try {
      const b = await fetchServerBackup();
      if (!b.blob) return showToast('لا توجد نسخة احتياطية على الخادم.', 'error');
      await doRestore(b.blob);
    } catch {
      showToast('تعذّر جلب النسخة الاحتياطية.', 'error');
    }
  }

  async function restoreFromFile(file: File) {
    try {
      await doRestore(await file.text());
    } catch {
      showToast('تعذّرت قراءة الملف.', 'error');
    }
  }

  async function startFresh() {
    if (
      busy ||
      !window.confirm(
        'البدء من جديد ينشئ هويّة تشفير جديدة. لن تُقرأ رسائلك المشفّرة القديمة وسيحتاج من يراسلك إلى تأكيد هويّتك من جديد. متابعة؟',
      )
    )
      return;
    setBusy(true);
    try {
      await forceCreateIdentity(uid);
      showToast('تم إنشاء هويّة جديدة. جارٍ إعادة التحميل…', 'success');
      setTimeout(() => window.location.reload(), 800);
    } catch {
      showToast('تعذّر الإنشاء.', 'error');
      setBusy(false);
    }
  }

  async function resetKeys() {
    if (
      busy ||
      !window.confirm(
        'إعادة تعيين المفاتيح تنشئ هويّة تشفير جديدة لهذا الجهاز. لن تُقرأ الرسائل المشفّرة القديمة، وسيحتاج من يراسلك إلى تأكيد هويّتك من جديد. متابعة؟',
      )
    )
      return;
    setBusy(true);
    try {
      await forceCreateIdentity(uid);
      await refresh();
      showToast('تمت إعادة تعيين مفاتيح التشفير.', 'success');
    } catch {
      showToast('تعذّرت إعادة التعيين.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const needsRestore = enabled && hasKeys === false && !!status?.registered;
  const ready = enabled && hasKeys === true;

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
            {!enabled
              ? 'المحادثات المشفّرة لن تظهر على هذا الجهاز.'
              : needsRestore
                ? 'لديك مفاتيح على جهاز آخر — استعدها أدناه.'
                : ready
                  ? 'الجهاز مُسجَّل وجاهز.'
                  : 'جارٍ تجهيز مفاتيح هذا الجهاز…'}
          </p>
        </div>
        <Switch checked={enabled} disabled={busy} onCheckedChange={toggle} aria-label="تفعيل التشفير على هذا الجهاز" />
      </div>

      {/* Restore flow: keys exist elsewhere, this device has none */}
      {needsRestore && (
        <div className="space-y-2.5 border-b border-border/60 py-3">
          <p className="text-xs font-medium text-foreground">استعادة المفاتيح</p>
          <input
            type="password"
            className={inputCls}
            placeholder="كلمة مرور النسخة الاحتياطية"
            value={restorePass}
            onChange={(e) => setRestorePass(e.target.value)}
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={restoreFromServer} loading={busy}>
              <DownloadCloud className="h-3.5 w-3.5" /> استعادة من الخادم
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <UploadCloud className="h-3.5 w-3.5" /> من ملف
            </Button>
          </div>
          <button
            type="button"
            onClick={startFresh}
            disabled={busy}
            className="flex items-center gap-1.5 text-[11px] font-medium text-danger hover:underline disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" /> ليس لديّ نسخة — ابدأ من جديد
          </button>
        </div>
      )}

      {/* Backup + reset: this device has keys */}
      {ready && (
        <div className="space-y-3 pt-3">
          {status?.registered && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              مفاتيح لمرة واحدة متبقّية على الخادم: {status.oneTimePreKeysLeft}
            </div>
          )}

          <div className="rounded-xl border border-border/70 p-3">
            <p className="text-xs font-medium text-foreground">النسخ الاحتياطي بكلمة مرور</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              نسخة مشفّرة من هويّتك تتيح استعادتها على جهاز جديد دون أن يرى مراسلوك تحذير «تغيّر رمز
              الأمان». احفظ كلمة المرور — لا يمكننا استرجاعها.
              {status?.hasBackup && status.enabled ? ' • لديك نسخة محفوظة على الخادم.' : ''}
            </p>
            <div className="mt-2.5 space-y-2">
              <input
                type="password"
                className={inputCls}
                placeholder="كلمة مرور جديدة (٨ أحرف فأكثر)"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="new-password"
              />
              <input
                type="password"
                className={inputCls}
                placeholder="تأكيد كلمة المرور"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                autoComplete="new-password"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => saveBackup(false)} loading={busy}>
                  {status?.hasBackup ? 'تحديث النسخة على الخادم' : 'حفظ على الخادم'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => saveBackup(true)} disabled={busy}>
                  <DownloadCloud className="h-3.5 w-3.5" /> تنزيل كملف
                </Button>
              </div>
              {status?.hasBackup && (
                <button
                  type="button"
                  onClick={removeBackup}
                  disabled={busy}
                  className="text-[11px] font-medium text-danger hover:underline disabled:opacity-50"
                >
                  حذف النسخة من الخادم
                </button>
              )}
            </div>
          </div>

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

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void restoreFromFile(f);
        }}
      />
    </Card>
  );
}
