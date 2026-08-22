'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn } from '@/lib/utils';
import type { Conversation, User } from '@/lib/types';
import { useChat } from './ChatProvider';

export function NewGroupChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { addConversation } = useChat();
  const [step, setStep] = useState<'members' | 'name'>('members');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep('members');
      setQuery('');
      setResults([]);
      setSelected([]);
      setGroupName('');
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const users = await api.get<User[]>(`/users/search?q=${encodeURIComponent(query.trim())}`);
        setResults(users);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  function toggle(candidate: User) {
    setSelected((prev) =>
      prev.some((u) => u._id === candidate._id) ? prev.filter((u) => u._id !== candidate._id) : [...prev, candidate],
    );
  }

  async function createGroup() {
    if (!groupName.trim() || selected.length === 0) return;
    setCreating(true);
    try {
      const conversation = await api.post<Conversation>('/chat/conversations', {
        participantIds: selected.map((u) => u._id),
        isGroup: true,
        name: groupName.trim(),
      });
      addConversation(conversation);
      onClose();
      router.push(`/chat/${conversation._id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إنشاء المجموعة.', 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={step === 'members' ? 'أعضاء المجموعة الجديدة' : 'اسم المجموعة'}>
      {step === 'members' ? (
        <>
          {selected.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <span key={u._id} className="flex items-center gap-1.5 rounded-full bg-accent/10 py-1 ps-1 pe-2.5 text-xs text-accent">
                  <Avatar src={assetUrl(u.photoUrl)} name={u.name} size="xs" />
                  {u.name}
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="ابحث بالاسم أو الرقم الجامعي"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="ps-9"
            />
          </div>
          <div className="mt-4 max-h-64 space-y-1 overflow-y-auto scrollbar-thin">
            {loading && (
              <div className="flex justify-center py-6">
                <Spinner className="h-5 w-5" />
              </div>
            )}
            {!loading &&
              results.map((r) => {
                const checked = selected.some((u) => u._id === r._id);
                return (
                  <button
                    key={r._id}
                    onClick={() => toggle(r)}
                    className="flex w-full items-center gap-3 rounded-xl2 px-2.5 py-2.5 text-start transition-colors hover:bg-surface-2"
                  >
                    <Avatar src={assetUrl(r.photoUrl)} name={r.name} size="sm" />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{r.name}</p>
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                        checked ? 'border-accent bg-accent text-white' : 'border-border',
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                );
              })}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setStep('name')} disabled={selected.length === 0}>
              التالي ({selected.length})
            </Button>
          </div>
        </>
      ) : (
        <>
          <Input autoFocus placeholder="اسم المجموعة" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          <div className="mt-4 flex justify-between">
            <Button variant="ghost" onClick={() => setStep('members')}>
              رجوع
            </Button>
            <Button onClick={createGroup} loading={creating} disabled={!groupName.trim()}>
              إنشاء المجموعة
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
