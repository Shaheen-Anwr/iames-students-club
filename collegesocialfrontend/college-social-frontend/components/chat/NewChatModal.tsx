'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { assetUrl } from '@/lib/utils';
import type { Conversation, User } from '@/lib/types';
import { useChat } from './ChatProvider';

export function NewChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { addConversation } = useChat();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      return;
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

  async function startConversation(userId: string) {
    setStarting(userId);
    try {
      const conversation = await api.post<Conversation>('/chat/conversations', { participantIds: [userId] });
      addConversation(conversation);
      onClose();
      router.push(`/chat/${conversation._id}`);
    } finally {
      setStarting(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="بدء محادثة جديدة">
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

      <div className="mt-4 max-h-72 space-y-1 overflow-y-auto scrollbar-thin">
        {loading && (
          <div className="flex justify-center py-6">
            <Spinner className="h-5 w-5" />
          </div>
        )}
        {!loading &&
          results.map((result) => (
            <button
              key={result._id}
              onClick={() => startConversation(result._id)}
              disabled={!!starting}
              className="flex w-full items-center gap-3 rounded-xl2 px-2.5 py-2.5 text-start transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <Avatar src={assetUrl(result.photoUrl)} name={result.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{result.name}</p>
                <p className="truncate text-xs text-muted-foreground">الرقم الجامعي {result.collegeId}</p>
              </div>
              <RoleBadge role={result.role} />
            </button>
          ))}
        {!loading && query.trim() && results.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">لم يتم العثور على أحد.</p>
        )}
      </div>
    </Modal>
  );
}
