'use client';

import { FormEvent, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

export function ChangePasswordForm() {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('كلمتا المرور الجديدتان غير متطابقتين.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      showToast('تم تغيير كلمة المرور بنجاح.');
      reset();
      setEditing(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تغيير كلمة المرور.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">كلمة المرور</h2>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <KeyRound className="h-3.5 w-3.5" />
            تغيير كلمة المرور
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">تغيير كلمة المرور</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="كلمة المرور الحالية"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
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
        <div className="flex gap-2.5 pt-1">
          <Button type="submit" size="sm" loading={saving}>
            حفظ كلمة المرور
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
