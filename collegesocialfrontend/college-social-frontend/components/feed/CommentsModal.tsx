'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { MentionTextarea } from '@/components/shared/MentionTextarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn } from '@/lib/utils';
import type { Comment } from '@/lib/types';
import { CommentItem } from './CommentItem';

// Comments live in a dedicated panel rather than expanding inline under the post -- opening or
// closing them never reflows the surrounding feed, it just overlays.
export function CommentsModal({
  open,
  onClose,
  postId,
  onCountChange,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  onCountChange: Dispatch<SetStateAction<number>>;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    api
      .get<Comment[]>(`/posts/${postId}/comments?limit=50`)
      .then((data) => {
        setComments(data);
        setLoaded(true);
      })
      .finally(() => setLoading(false));
  }, [open, loaded, postId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const comment = await api.post<Comment>(`/posts/${postId}/comments`, { text: text.trim() });
      setComments((prev) => [...prev, comment]);
      onCountChange((prev) => prev + 1);
      setText('');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إضافة التعليق.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDeleted(commentId: string) {
    setComments((prev) => prev.filter((c) => c._id !== commentId));
    onCountChange((prev) => Math.max(0, prev - 1));
  }

  return (
    <Modal open={open} onClose={onClose} title="التعليقات" className="flex h-[82vh] max-w-lg flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pe-1 scrollbar-thin">
          {loading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <Skeleton className={cn('rounded-2xl', i === 1 ? 'h-9 w-2/3' : 'h-12 w-full')} />
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">لا توجد تعليقات بعد. كن أول من يعلّق.</p>
            </div>
          ) : (
            comments.map((comment) => <CommentItem key={comment._id} comment={comment} onDeleted={handleDeleted} />)
          )}
        </div>

        {user && (
          <form onSubmit={handleSubmit} className="mt-3 flex shrink-0 items-center gap-2.5 border-t border-border pt-3">
            <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="sm" />
            <MentionTextarea
              autoFocus
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="اكتب تعليقًا... (استخدم @ للإشارة إلى أحد)"
              className="h-10 min-h-10 flex-1 resize-none rounded-full border border-transparent bg-surface-2/70 px-4 py-2.5 text-base leading-tight shadow-soft transition-colors focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 md:text-sm"
            />
            <button
              type="submit"
              disabled={!text.trim() || submitting}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white shadow-soft transition-all hover:shadow-glow active:scale-95 disabled:opacity-40 disabled:hover:shadow-soft"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}
