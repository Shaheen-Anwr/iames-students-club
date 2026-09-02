'use client';

import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

const DISMISS_KEY = 'ai-personalize-dismissed';

/** Whether the student closed the first-run personalise prompt without filling it in. */
export function personalizeDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** The assistant's display name, or the generic label when the student hasn't named it. */
export function assistantDisplayName(user: Pick<User, 'aiAssistantName'> | null | undefined): string {
  return user?.aiAssistantName?.trim() || 'المساعد الذكي';
}

/**
 * "Let's get acquainted" — two fields: what the assistant should call the student, and what the
 * student wants to call the assistant. Saves to PATCH /users/me. Rendered inline in the empty
 * chat state (with a skip) and inside a Modal from the assistant's settings (`bare`).
 */
export function AiPersonalizeCard({
  bare = false,
  onDone,
  onSkip,
}: {
  bare?: boolean;
  onDone?: () => void;
  onSkip?: () => void;
}) {
  const { user, updateLocalUser } = useAuth();
  const { showToast } = useToast();
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0];
  const [preferredName, setPreferredName] = useState(user?.aiPreferredName || firstName);
  const [assistantName, setAssistantName] = useState(user?.aiAssistantName || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await api.patch<User>('/users/me', {
        aiPreferredName: preferredName.trim(),
        aiAssistantName: assistantName.trim(),
      });
      updateLocalUser(updated);
      showToast('تم تخصيص مساعدك ✨');
      onDone?.();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ التخصيص', 'error');
    } finally {
      setSaving(false);
    }
  }

  function skip() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore — the prompt just shows again next time
    }
    onSkip?.();
  }

  return (
    <div className={cn('w-full text-start', !bare && 'relative rounded-2xl border border-accent/20 bg-accent/5 p-4')}>
      {!bare && onSkip && (
        <button
          type="button"
          onClick={skip}
          title="لاحقًا"
          className="absolute end-2 top-2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <p className="text-sm font-semibold text-foreground">لنتعارف قليلًا</p>
      </div>

      <div className="space-y-3">
        <Input
          label="بماذا أناديك؟"
          value={preferredName}
          onChange={(e) => setPreferredName(e.target.value)}
          placeholder="اسمك الأول"
          maxLength={40}
        />
        <Input
          label="وبماذا تحب أن تسمّيني؟"
          value={assistantName}
          onChange={(e) => setAssistantName(e.target.value)}
          placeholder="مثال: رافد، نِبراس، مُرشد…"
          maxLength={40}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={save} loading={saving} disabled={!assistantName.trim()}>
          حفظ
        </Button>
        {onSkip && (
          <Button size="sm" variant="ghost" onClick={skip} disabled={saving}>
            لاحقًا
          </Button>
        )}
      </div>
    </div>
  );
}
