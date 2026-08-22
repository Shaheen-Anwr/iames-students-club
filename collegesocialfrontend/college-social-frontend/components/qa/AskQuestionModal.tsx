'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import type { PostScope, Question } from '@/lib/types';

export function AskQuestionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [scope, setScope] = useState<PostScope>('department');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setTitle('');
    setBody('');
    setCourseCode('');
    setScope('department');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      const question = await api.post<Question>('/qa', {
        title: title.trim(),
        body: body.trim(),
        courseCode: courseCode.trim() || undefined,
        scope: user?.department ? scope : 'public',
      });
      handleClose();
      router.push(`/study/qa/${question._id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إرسال السؤال', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="اطرح سؤالاً">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <Input autoFocus placeholder="عنوان السؤال" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          placeholder="اشرح سؤالك بالتفصيل..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="rounded-xl2 border-transparent bg-surface-2/70 px-4 py-3 text-[15px] leading-relaxed focus:bg-surface"
        />
        <Input
          placeholder="رمز المقرر (اختياري)، مثل CS101"
          value={courseCode}
          onChange={(e) => setCourseCode(e.target.value)}
        />

        {user?.department && (
          <div className="flex gap-1 rounded-full bg-surface-2/70 p-1">
            <button
              type="button"
              onClick={() => setScope('department')}
              className={cn(
                'flex-1 rounded-full py-1.5 text-xs font-medium transition-colors',
                scope === 'department' ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {DEPARTMENT_LABELS[user.department]}
            </button>
            <button
              type="button"
              onClick={() => setScope('public')}
              className={cn(
                'flex-1 rounded-full py-1.5 text-xs font-medium transition-colors',
                scope === 'public' ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              عام
            </button>
          </div>
        )}

        <Button type="submit" loading={submitting} disabled={!title.trim() || !body.trim()}>
          إرسال السؤال
        </Button>
      </form>
    </Modal>
  );
}
