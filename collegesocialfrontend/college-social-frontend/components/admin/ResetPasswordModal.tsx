'use client';

import { FormEvent, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { User } from '@/lib/types';

export function ResetPasswordModal({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (password.length < 6) {
      setError('يجب ألا تقل كلمة المرور عن 6 أحرف.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.patch(`/admin/users/${user._id}/password`, { password });
      showToast(`تم تحديث كلمة مرور ${user.name}.`);
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'حدث خطأ ما.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={!!user} onClose={onClose} title={user ? `إعادة تعيين كلمة المرور — ${user.name}` : undefined}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="كلمة المرور الجديدة"
          name="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
        />
        {error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" loading={loading}>
            حفظ كلمة المرور
          </Button>
        </div>
      </form>
    </Modal>
  );
}
