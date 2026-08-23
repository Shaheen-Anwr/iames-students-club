'use client';

import { FormEvent, useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import type { User } from '@/lib/types';

// Sets/updates the recovery email used by the "forgot password" flow (see ForgotPasswordModal) --
// deliberately separate from the college email, which a locked-out student may not be able to
// check independently of this platform. Mirrors ChangePasswordForm's collapsed/expanded layout,
// and the same "confirm with current password" gate for a sensitive account change.
export function PersonalEmailForm() {
  const { user, updateLocalUser } = useAuth();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setCurrentPassword('');
    setPersonalEmail('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/auth/personal-email', { currentPassword, personalEmail });
      updateLocalUser({ personalEmail } as Partial<User>);
      showToast('تم حفظ البريد الشخصي بنجاح.');
      reset();
      setEditing(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ البريد الشخصي.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">البريد الشخصي</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {user?.personalEmail ? user.personalEmail : 'لم يتم تعيين بريد شخصي بعد -- يُستخدم لاستعادة كلمة المرور إن نسيتها.'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Mail className="h-3.5 w-3.5" />
            {user?.personalEmail ? 'تغيير' : 'إضافة'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">البريد الشخصي</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        يُستخدم فقط لاستعادة كلمة المرور -- استخدم بريدك الشخصي (مثل Gmail)، وليس بريدك الجامعي.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="البريد الشخصي الجديد"
          type="email"
          placeholder="example@gmail.com"
          value={personalEmail}
          onChange={(e) => setPersonalEmail(e.target.value)}
          required
        />
        <Input
          label="كلمة المرور الحالية"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
        <div className="flex gap-2.5 pt-1">
          <Button type="submit" size="sm" loading={saving}>
            حفظ
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              reset();
              setEditing(false);
            }}
          >
            إلغاء
          </Button>
        </div>
      </form>
    </Card>
  );
}
