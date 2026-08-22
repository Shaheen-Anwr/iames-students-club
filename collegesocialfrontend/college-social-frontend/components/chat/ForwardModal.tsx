'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
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
}

export function ForwardModal({ open, onClose, onForward }: ForwardModalProps) {
  const { user } = useAuth();
  const { conversations } = useChat();
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  if (!user) return null;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
    <Modal open={open} onClose={onClose} title="إعادة توجيه إلى">
      <div className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin">
        {conversations.map((conversation) => {
          const title = conversationTitle(conversation, user._id);
          const avatarUser = conversationAvatarUser(conversation, user._id);
          const checked = selected.includes(conversation._id);
          return (
            <button
              key={conversation._id}
              onClick={() => toggle(conversation._id)}
              className="flex w-full items-center gap-3 rounded-xl2 px-2.5 py-2.5 text-start transition-colors hover:bg-surface-2"
            >
              <Avatar src={assetUrl(avatarUser?.photoUrl)} name={title} size="sm" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</p>
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
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={handleForward} disabled={!selected.length} loading={sending}>
          إعادة توجيه {selected.length > 0 && `(${selected.length})`}
        </Button>
      </div>
    </Modal>
  );
}
