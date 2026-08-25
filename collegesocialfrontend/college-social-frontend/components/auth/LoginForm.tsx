'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { ApiError } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { ForgotPasswordModal } from './ForgotPasswordModal';

export function LoginForm() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [collegeId, setCollegeId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const me = await login(collegeId.trim(), password);
      router.push(me.department ? '/feed?scope=department' : '/feed');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'حدث خطأ ما. حاول مرة أخرى.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-col items-center gap-3 lg:items-start">
        <div className="lg:hidden">
          <Logo size="sm" variant="dark" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">مرحبًا بعودتك</h1>
        <p className="text-sm text-muted-foreground">سجّل الدخول برقمك الجامعي للمتابعة.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="الرقم الجامعي"
          name="collegeId"
          placeholder="مثال: 2430525"
          autoComplete="username"
          value={collegeId}
          onChange={(e) => setCollegeId(e.target.value)}
          required
        />
        <Input
          label="كلمة المرور"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setForgotPasswordOpen(true)}
            className="text-sm font-medium text-accent hover:text-foreground"
          >
            نسيت كلمة المرور؟
          </button>
        </div>

        {error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          تسجيل الدخول
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground lg:text-right">
        ليس لديك حساب؟{' '}
        <Link href="/register" className="font-medium text-accent hover:text-foreground">
          أنشئ حسابًا جديدًا
        </Link>
      </p>

      <ForgotPasswordModal open={forgotPasswordOpen} onClose={() => setForgotPasswordOpen(false)} />
        <p className='mt-6 text-center text-sm text-muted-foreground lg:text-right'>
          منصة مجتمعية وأكاديمية غير هادفة للربح، صُممت بجهد طلابي لتسهيل الحياة الأكاديمية لطلاب الأكاديمية.
                  يُمنع استخدام المنصة في أي أغراض تجارية أو غير أكاديمية.
        </p>
    </div>
  );
}
