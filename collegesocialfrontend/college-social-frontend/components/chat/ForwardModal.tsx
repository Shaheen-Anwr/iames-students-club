'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/lib/auth-context';
import { conversationAvatarUser, conversationTitle } from '@/lib/chat-helpers';
import { assetUrl, cn } from '@/lib/utils';
import { useChat } from './ChatProvider';

interface ForwardModalProps {
  open: boolean;
  onClose: () => void;
  onForward: (conversationIds: string[]) => Promise<void> | void;
  /** How many messages are being forwarded (multi-select), for the title. */
  count?: number;
}

const MAX_TARGETS = 10;

export function ForwardModal({ open, onClose, onForward, count = 1 }: ForwardModalProps) {
  const { user } = useAuth();
  const { conversations } = useChat();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setQuery('');
    }
  }, [open]);

  const list = useMemo(() => {
    if (!user) return [];
    const q = query.trim().toLowerCase();
    return conversations
      .map((conversation) => ({ conversation, title: conversationTitle(conversation, user._id) }))
      .filter(({ title }) => !q || title.toLowerCase().includes(q));
  }, [conversations, query, user]);

  if (!user) return null;

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_TARGETS ? prev : [...prev, id],
    );
  }

  async function handleForward() {
    if (!selected.length) return;
    setSending(true);
    try {
      await onForward(selected);
      setSelected([]);
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={count > 1 ? `إعادة توجيه ${count} رسائل إلى` : 'إعادة توجيه إلى'}>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن محادثة"
          className="h-10 w-full rounded-full bg-surface-2/80 pe-3 ps-9 text-sm text-foreground ring-1 ring-border/60 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>
      <div className="max-h-80 space-y-0.5 overflow-y-auto scrollbar-thin">
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد محادثات مطابقة</p>
        ) : (
          list.map(({ conversation, title }) => {
            const avatarUser = conversationAvatarUser(conversation, user._id);
            const checked = selected.includes(conversation._id);
            return (
              <button
                key={conversation._id}
                type="button"
                onClick={() => toggle(conversation._id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl2 px-2.5 py-2.5 text-start transition-colors hover:bg-surface-2',
                  checked && 'bg-accent/[0.06]',
                )}
              >
                <Avatar src={assetUrl(conversation.groupIcon ?? avatarUser?.photoUrl)} name={title} size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</p>
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    checked ? 'border-accent bg-accent text-white' : 'border-border',
                  )}
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>
              </button>
            );
          })
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {selected.length >= MAX_TARGETS ? `الحد الأقصى ${MAX_TARGETS} محادثات` : selected.length ? `${selected.length} محددة` : ''}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={handleForward} disabled={!selected.length} loading={sending}>
            إعادة توجيه {selected.length > 0 && `(${selected.length})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
