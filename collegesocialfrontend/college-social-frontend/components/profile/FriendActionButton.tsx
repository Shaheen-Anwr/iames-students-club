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
  // 'icon' renders a compact circular icon-only button (no label) -- for tight spaces like the
  // mobile suggestions carousel, where a full-width text button doesn't fit a ~110px card.
  variant?: 'default' | 'icon';
}

export function FriendActionButton({ targetUser, size = 'sm', className, variant = 'default' }: FriendActionButtonProps) {
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

  if (variant === 'icon') {
    const iconButtonClass = cn(
      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 disabled:pointer-events-none disabled:opacity-60',
      className,
    );
    if (requestReceived) {
      return (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={accept}
            disabled={busy}
            title="قبول"
            className={cn(iconButtonClass, 'bg-gradient-accent text-white shadow-soft')}
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={cancelOrDecline}
            disabled={busy}
            title="رفض"
            className={cn(iconButtonClass, 'border border-border bg-surface text-muted-foreground')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      );
    }
    if (isFriend) {
      return (
        <button type="button" onClick={unfriend} disabled={busy} title="أصدقاء" className={cn(iconButtonClass, 'border border-border bg-surface text-accent')}>
          <UserCheck className="h-4 w-4" />
        </button>
      );
    }
    if (requestSent) {
      return (
        <button
          type="button"
          onClick={cancelOrDecline}
          disabled={busy}
          title="تم الإرسال -- اضغط للإلغاء"
          className={cn(iconButtonClass, 'border border-border bg-surface text-muted-foreground')}
        >
          <Check className="h-4 w-4" />
        </button>
      );
    }
    return (
      <button type="button" onClick={sendRequest} disabled={busy} title="إضافة صديق" className={cn(iconButtonClass, 'bg-gradient-accent text-white shadow-soft hover:shadow-glow')}>
        <UserPlus className="h-4 w-4" />
      </button>
    );
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
