'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { GroupVisibility, StudyGroup } from '@/lib/types';
import { useGroups } from '@/lib/groups-context';

type Tab = 'create' | 'join';

export function CreateOrJoinGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { addGroup } = useGroups();
  const [tab, setTab] = useState<Tab>('create');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('private');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setTab('create');
    setName('');
    setDescription('');
    setVisibility('private');
    setCode('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function goToGroup(group: StudyGroup) {
    addGroup(group);
    handleClose();
    router.push(`/groups/${group._id}`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const group = await api.post<StudyGroup>('/groups', {
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
      });
      goToGroup(group);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إنشاء المجموعة', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      const group = await api.post<StudyGroup>('/groups/join', { code: code.trim() });
      goToGroup(group);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'رمز الدعوة غير صحيح', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="المجموعات الدراسية">
      <div className="mb-4 flex gap-1 rounded-full bg-surface-2 p-1">
        <button
          type="button"
          onClick={() => setTab('create')}
          className={cn(
            'flex-1 rounded-full py-1.5 text-sm font-medium transition-colors',
            tab === 'create' ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          إنشاء مجموعة
        </button>
        <button
          type="button"
          onClick={() => setTab('join')}
          className={cn(
            'flex-1 rounded-full py-1.5 text-sm font-medium transition-colors',
            tab === 'join' ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          الانضمام عبر رمز
        </button>
      </div>

      {tab === 'create' ? (
        <form onSubmit={handleCreate} className="flex flex-col gap-3.5">
          <Input autoFocus placeholder="اسم المجموعة" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea placeholder="وصف مختصر (اختياري)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />

          <div className="flex gap-1 rounded-full bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setVisibility('private')}
              className={cn(
                'flex-1 rounded-full py-1.5 text-xs font-medium transition-colors',
                visibility === 'private' ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              خاصة (رمز دعوة)
            </button>
            <button
              type="button"
              onClick={() => setVisibility('public')}
              className={cn(
                'flex-1 rounded-full py-1.5 text-xs font-medium transition-colors',
                visibility === 'public' ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              عامة (قابلة للاكتشاف)
            </button>
          </div>

          <Button type="submit" loading={submitting} disabled={!name.trim()} className="rounded-full">
            إنشاء
          </Button>
        </form>
      ) : (
        <form onSubmit={handleJoin} className="flex flex-col gap-3.5">
          <Input
            autoFocus
            placeholder="رمز الدعوة"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="text-center font-mono tracking-widest"
          />
          <Button type="submit" loading={submitting} disabled={!code.trim()} className="rounded-full">
            الانضمام
          </Button>
        </form>
      )}
    </Modal>
  );
}
