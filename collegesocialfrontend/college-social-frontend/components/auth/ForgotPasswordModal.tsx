'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, KeyRound, Mail } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

const RESEND_COOLDOWN_SECONDS = 60;

type Step = 'email' | 'reset';

interface ForgotPasswordModalProps {
  open: boolean;
  onClose: () => void;
}

// Two steps in one modal, matching the backend's forgot-password/reset-password pair:
// 1) ask for the personal (recovery) email and request a code -- the backend always replies with
//    the same generic success regardless of whether that email matches an account, so this always
//    advances to step 2 rather than branching on the response.
// 2) collect the emailed code + a new password.
export function ForgotPasswordModal({ open, onClose }: ForgotPasswordModalProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>('email');
  const [personalEmail, setPersonalEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!open) {
      // Reset everything once the close animation would have finished, so reopening always
      // starts clean instead of showing the previous attempt's leftover state.
      const t = setTimeout(() => {
        setStep('email');
        setPersonalEmail('');
        setCode('');
        setNewPassword('');
        setConfirmPassword('');
        setCooldown(0);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function requestCode() {
    setRequesting(true);
    try {
      await api.post('/auth/forgot-password', { personalEmail });
      setStep('reset');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إرسال رمز التحقق.', 'error');
    } finally {
      setRequesting(false);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    await requestCode();
  }

  async function handleResetSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('كلمتا المرور الجديدتان غير متطابقتين.', 'error');
      return;
    }
    setResetting(true);
    try {
      await api.post('/auth/reset-password', { personalEmail, code, newPassword });
      showToast('تم تحديث كلمة المرور بنجاح، سجّل الدخول بكلمة المرور الجديدة.');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'رمز التحقق غير صالح أو منتهي الصلاحية.', 'error');
    } finally {
      setResetting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="نسيت كلمة المرور؟">
      {step === 'email' ? (
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            أدخل بريدك الشخصي (وليس البريد الجامعي) المسجّل في إعدادات حسابك، وسنرسل لك رمز تحقق لإعادة تعيين كلمة المرور.
          </p>
          <Input
            label="البريد الشخصي"
            type="email"
            placeholder="example@gmail.com"
            autoComplete="email"
            value={personalEmail}
            onChange={(e) => setPersonalEmail(e.target.value)}
            required
            autoFocus
          />
          <Button type="submit" size="lg" className="w-full" loading={requesting}>
            <Mail className="h-4 w-4" />
            إرسال رمز التحقق
          </Button>
        </form>
      ) : (
        <form onSubmit={handleResetSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            إذا كان <span className="font-medium text-foreground">{personalEmail}</span> مرتبطًا بحساب، فستصلك رسالة بها رمز مكوّن من 6
            أرقام. صالح لمدة 10 دقائق.
          </p>
          <Input
            label="رمز التحقق"
            inputMode="numeric"
            placeholder="123456"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
          />
          <Input
            label="كلمة المرور الجديدة"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={6}
            required
          />
          <Input
            label="تأكيد كلمة المرور الجديدة"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            required
          />

          <Button type="submit" size="lg" className="w-full" loading={resetting}>
            <KeyRound className="h-4 w-4" />
            تحديث كلمة المرور
          </Button>

          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setStep('email')}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              تعديل البريد
            </button>
            <button
              type="button"
              onClick={requestCode}
              disabled={cooldown > 0 || requesting}
              className="text-accent hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground"
            >
              {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ثانية` : 'لم يصلك الرمز؟ إعادة الإرسال'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
