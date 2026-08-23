'use client';

import { useState } from 'react';
import { Check, UserCheck, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

interface FriendActionButtonProps {
  targetUser: Pick<User, '_id' | 'name'>;
  size?: 'sm' | 'lg';
  className?: string;
}

export function FriendActionButton({ targetUser, size = 'sm', className }: FriendActionButtonProps) {
  const { user, updateLocalUser } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!user || user._id === targetUser._id) return null;

  const isFriend = user.friends?.includes(targetUser._id);
  const requestSent = user.friendRequestsSent?.includes(targetUser._id);
  const requestReceived = user.friendRequestsReceived?.includes(targetUser._id);

  async function run(action: () => Promise<User>) {
    setBusy(true);
    try {
      const updated = await action();
      updateLocalUser(updated);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تنفيذ الإجراء.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function sendRequest() {
    run(() => api.post<User>(`/users/${targetUser._id}/friend-request`));
  }

  function cancelOrDecline() {
    run(() => api.delete<User>(`/users/${targetUser._id}/friend-request`));
  }

  function accept() {
    run(() => api.post<User>(`/users/${targetUser._id}/friend-accept`));
  }

  function unfriend() {
    if (!confirm(`هل تريد إلغاء صداقة ${targetUser.name}؟`)) return;
    run(() => api.delete<User>(`/users/${targetUser._id}/friend`));
  }

  if (requestReceived) {
    return (
      <div className={cn('flex gap-2', className)}>
        <Button size={size} onClick={accept} loading={busy} className="flex-1">
          <Check className="h-4 w-4" /> قبول
        </Button>
        <Button size={size} variant="outline" onClick={cancelOrDecline} loading={busy} className="flex-1">
          <X className="h-4 w-4" /> رفض
        </Button>
      </div>
    );
  }

  if (isFriend) {
    return (
      <div className={cn('flex', className)}>
        <Button size={size} variant="outline" onClick={unfriend} loading={busy} className="flex-1">
          <UserCheck className="h-4 w-4" /> أصدقاء
        </Button>
      </div>
    );
  }

  if (requestSent) {
    return (
      <div className={cn('flex', className)}>
        <Button size={size} variant="outline" onClick={cancelOrDecline} loading={busy} className="flex-1">
          تم الإرسال
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex', className)}>
      <Button size={size} onClick={sendRequest} loading={busy} className="flex-1">
        <UserPlus className="h-4 w-4" /> إضافة صديق
      </Button>
    </div>
  );
}
