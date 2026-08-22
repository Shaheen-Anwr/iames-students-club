'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl } from '@/lib/utils';
import type { Post } from '@/lib/types';
import { SharedPostPreview } from './SharedPostPreview';

export function ShareModal({ post, onClose, onShared }: { post: Post; onClose: () => void; onShared: (post: Post) => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleShare() {
    setSubmitting(true);
    try {
      const shared = await api.post<Post>(`/posts/${post._id}/share`, { caption: caption.trim() || undefined });
      onShared(shared);
      showToast('تمت مشاركة المنشور.');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّرت مشاركة المنشور.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <Modal open onClose={onClose} title="مشاركة المنشور" className="max-w-lg">
      <div className="flex gap-3">
        <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="md" />
        <Textarea
          autoFocus
          rows={2}
          placeholder={`اكتب شيئًا عن هذا، يا ${user.name.split(' ')[0]}...`}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="rounded-xl2 border-transparent bg-surface-2/70 px-4 py-3 text-[15px] leading-relaxed focus:bg-surface"
        />
      </div>

      <SharedPostPreview post={post} />

      <Button onClick={handleShare} loading={submitting} size="md" className="mt-4 w-full rounded-full">
        مشاركة الآن
      </Button>
    </Modal>
  );
}
