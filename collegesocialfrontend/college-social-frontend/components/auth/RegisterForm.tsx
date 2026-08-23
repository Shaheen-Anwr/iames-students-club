'use client';

import { FormEvent, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, GraduationCap, BookOpen, Check, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/types';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/lib/departments';
import { buildCollegeEmail } from '@/lib/constants';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';

export function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [collegeId, setCollegeId] = useState('');
  const [name, setName] = useState('');
  const [collegeEmail, setCollegeEmail] = useState('');
  const [emailEditedManually, setEmailEditedManually] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [department, setDepartment] = useState<Department | ''>('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function handleCollegeIdChange(value: string) {
    setCollegeId(value);
    if (!emailEditedManually) {
      setCollegeEmail(value.trim() ? buildCollegeEmail(value.trim()) : '');
    }
  }

  function handleCollegeEmailChange(value: string) {
    setCollegeEmail(value);
    setEmailEditedManually(value !== buildCollegeEmail(collegeId.trim()));
  }

  const expectedEmail = collegeId.trim() ? buildCollegeEmail(collegeId.trim()) : '';
  const emailMatches = collegeEmail.length > 0 && collegeEmail.toLowerCase() === expectedEmail.toLowerCase();
  const emailMismatch = collegeEmail.length > 0 && expectedEmail.length > 0 && !emailMatches;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    if (password.length < 6) {
      setError('يجب ألا تقل كلمة المرور عن 6 أحرف.');
      return;
    }
    if (!department) {
      setError('الرجاء اختيار الشعبة.');
      return;
    }
    if (emailMismatch) {
      setError(`البريد الجامعي يجب أن يكون ⁦${expectedEmail}⁩ بالضبط`);
      return;
    }

    setLoading(true);
    try {
      const me = await register({
        collegeId: collegeId.trim(),
        name: name.trim(),
        collegeEmail: collegeEmail.trim(),
        password,
        role,
        department,
        photo,
      });
      if (me.role === 'professor') {
        router.push('/study/assignments?new=1');
      } else {
        router.push(me.department ? '/feed?scope=department&new=1' : '/feed?new=1');
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'حدث خطأ ما. حاول مرة أخرى.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col items-center gap-3 lg:items-start">
        <div className="lg:hidden">
          <Logo size="sm" variant="dark" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">أنشئ حسابك</h1>
        <p className="text-sm text-muted-foreground">حصريًا لطلاب وأساتذة IEAMS.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-dashed border-border bg-surface-2 transition-colors hover:border-accent"
          >
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="معاينة الصورة الشخصية" className="h-full w-full object-cover" />
            ) : (
              <Camera className="mx-auto mt-6 h-7 w-7 text-muted-foreground group-hover:text-accent" />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-background/70 py-0.5 text-[10px] text-white">
              {photoPreview ? 'تغيير' : 'إضافة صورة'}
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <RoleOption icon={GraduationCap} label="طالب" selected={role === 'student'} onClick={() => setRole('student')} />
          <RoleOption icon={BookOpen} label="أستاذ" selected={role === 'professor'} onClick={() => setRole('professor')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="department" className="text-sm font-medium text-foreground">
            الشعبة
          </label>
          <select
            id="department"
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department)}
            required
            className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            <option value="" disabled>
              اختر الشعبة
            </option>
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>
                {DEPARTMENT_LABELS[dept]}
              </option>
            ))}
          </select>
        </div>

        <Input label="الاسم الكامل" name="name" placeholder="محمد أحمد" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input
          label="الرقم الجامعي"
          name="collegeId"
          placeholder="مثال: 2430525"
          value={collegeId}
          onChange={(e) => handleCollegeIdChange(e.target.value)}
          required
        />
        <div>
          <Input
            label="البريد الجامعي"
            name="collegeEmail"
            type="email"
            dir="ltr"
            placeholder="2430525@iames.mans.edu.eg"
            value={collegeEmail}
            onChange={(e) => handleCollegeEmailChange(e.target.value)}
            required
          />
          {emailMatches ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-success">
              <Check className="h-3.5 w-3.5" />
              يطابق الرقم الجامعي
            </p>
          ) : emailMismatch ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-danger">
              <X className="h-3.5 w-3.5" />
              يجب أن يكون البريد <bdi dir="ltr">{expectedEmail}</bdi> بالضبط
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              يُملأ تلقائيًا من رقمك الجامعي، مثل <bdi dir="ltr">2430525@iames.mans.edu.eg</bdi>
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="كلمة المرور"
            name="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Input
            label="تأكيد كلمة المرور"
            name="confirmPassword"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          إنشاء الحساب
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground lg:text-right">
        لديك حساب بالفعل؟{' '}
        <Link href="/login" className="font-medium text-accent hover:text-foreground">
          سجّل الدخول
        </Link>
      </p>
    </div>
  );
}

function RoleOption({
  icon: Icon,
  label,
  selected,
  onClick,
}: {
  icon: typeof GraduationCap;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
        selected ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:bg-surface-2',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
