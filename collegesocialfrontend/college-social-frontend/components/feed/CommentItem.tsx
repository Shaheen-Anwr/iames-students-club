'use client';

import { useMemo, useState } from 'react';
import { CornerDownLeft, MoreHorizontal, Pencil, Send, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Dropdown } from '@/components/ui/Dropdown';
import { Skeleton } from '@/components/ui/Skeleton';
import { MentionTextarea } from '@/components/shared/MentionTextarea';
import { TaggedText } from '@/components/shared/TaggedText';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import { REACTION_META, type Comment, type Reaction, type ReactionType } from '@/lib/types';
import { REACTION_COLORS, ReactionIcon } from './reaction-icons';
import { ReactionPicker } from './ReactionPicker';
import { ReactionsListModal } from './ReactionsListModal';

// Renders a single comment (reaction picker + delete) plus its reply thread. Replies are just
// comments with `parentComment` set, nesting indefinitely, so this component renders itself
// recursively for its own replies.
export function CommentItem({ comment, onDeleted }: { comment: Comment; onDeleted: (id: string) => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [reactions, setReactions] = useState<Reaction[]>(comment.reactions);
  const [reactBusy, setReactBusy] = useState(false);
  const [reactionsModalOpen, setReactionsModalOpen] = useState(false);

  const [text, setText] = useState(comment.text);
  const [edited, setEdited] = useState(comment.edited ?? false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [replyCount, setReplyCount] = useState(comment.replyCount);
  const [repliesExpanded, setRepliesExpanded] = useState(false);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const [replies, setReplies] = useState<Comment[]>([]);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const myReaction = user ? reactions.find((r) => r.user === user._id) ?? null : null;

  const { totalReactions, topReactions } = useMemo(() => {
    const counts = new Map<ReactionType, number>();
    for (const r of reactions) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return { totalReactions: reactions.length, topReactions: sorted.slice(0, 3) };
  }, [reactions]);

  async function applyReaction(type: ReactionType) {
    if (!user || reactBusy) return;
    setReactBusy(true);
    const prevReactions = reactions;
    const uid = user._id;
    const existing = reactions.find((r) => r.user === uid);

    let next: Reaction[];
    if (existing?.type === type) next = reactions.filter((r) => r.user !== uid);
    else if (existing) next = reactions.map((r) => (r.user === uid ? { ...r, type } : r));
    else next = [...reactions, { user: uid, type }];
    setReactions(next);

    try {
      await api.post(`/posts/comments/${comment._id}/react`, { type });
    } catch {
      setReactions(prevReactions);
    } finally {
      setReactBusy(false);
    }
  }

  function handleMainButtonClick() {
    if (myReaction) applyReaction(myReaction.type); // toggles it off
    else applyReaction('like');
  }

  async function handleDelete() {
    setDeleteBusy(true);
    try {
      await api.delete(`/posts/comments/${comment._id}`);
      onDeleted(comment._id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف التعليق.', 'error');
    } finally {
      setDeleteBusy(false);
      setConfirmDeleteOpen(false);
    }
  }

  function startEditing() {
    setEditText(text);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditText(text);
  }

  async function handleEditSubmit() {
    if (!editText.trim() || editSubmitting) return;
    setEditSubmitting(true);
    try {
      const updated = await api.patch<Comment>(`/posts/comments/${comment._id}`, { text: editText.trim() });
      setText(updated.text);
      setEdited(true);
      setEditing(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ التعديل.', 'error');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function toggleReplies() {
    setRepliesExpanded((prev) => !prev);
    if (!repliesLoaded) {
      setRepliesLoading(true);
      try {
        const data = await api.get<Comment[]>(`/posts/comments/${comment._id}/replies?limit=50`);
        setReplies(data);
        setRepliesLoaded(true);
      } finally {
        setRepliesLoading(false);
      }
    }
  }

  async function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim() || submittingReply) return;
    setSubmittingReply(true);
    try {
      const reply = await api.post<Comment>(`/posts/comments/${comment._id}/replies`, { text: replyText.trim() });
      setReplies((prev) => [...prev, reply]);
      setReplyCount((prev) => prev + 1);
      setRepliesLoaded(true);
      setRepliesExpanded(true);
      setReplyText('');
      setReplying(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إضافة الرد.', 'error');
    } finally {
      setSubmittingReply(false);
    }
  }

  function handleReplyDeleted(id: string) {
    setReplies((prev) => prev.filter((r) => r._id !== id));
    setReplyCount((prev) => Math.max(0, prev - 1));
  }

  return (
    <div className="flex items-start gap-3">
      <Avatar src={assetUrl(comment.author?.photoUrl)} name={comment.author?.name ?? '؟'} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="relative rounded-2xl border border-transparent bg-surface-2/70 px-3.5 py-2.5 transition-colors hover:border-border hover:bg-surface-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-xs font-semibold text-foreground">{comment.author?.name ?? 'مستخدم محذوف'}</p>
              {comment.author && <RoleBadge role={comment.author.role} />}
            </div>
            {comment.author?._id === user?._id && (
              <Dropdown
                align="end"
                trigger={
                  <span className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </span>
                }
                items={[
                  { label: 'تعديل', icon: Pencil, onClick: startEditing },
                  { label: 'حذف', icon: Trash2, onClick: () => setConfirmDeleteOpen(true), destructive: true },
                ]}
              />
            )}
          </div>
          {editing ? (
            <div className="mt-1.5 space-y-1.5">
              <MentionTextarea
                autoFocus
                rows={2}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="rounded-lg border-transparent bg-surface px-2.5 py-2 text-sm leading-relaxed"
              />
              <div className="flex items-center justify-end gap-2">
                <button onClick={cancelEditing} className="px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                  إلغاء
                </button>
                <Button onClick={handleEditSubmit} loading={editSubmitting} size="sm" className="rounded-full px-3 py-1 text-[11px]">
                  حفظ
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              <TaggedText text={text} />
            </p>
          )}

          {/* The reaction count floats as a small pill over the bubble's corner, like Facebook. */}
          {totalReactions > 0 && (
            <button
              onClick={() => setReactionsModalOpen(true)}
              className="absolute -bottom-2 end-2 flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-soft transition-transform hover:scale-105"
            >
              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full', REACTION_COLORS[topReactions[0][0]].bg, REACTION_COLORS[topReactions[0][0]].text)}>
                <ReactionIcon type={topReactions[0][0]} className="h-2.5 w-2.5" />
              </span>
              <span>{totalReactions}</span>
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-3 px-1 text-xs text-muted-foreground">
          <span>
            {timeAgo(comment.createdAt)}
            {edited && ' · تم التعديل'}
          </span>

          <ReactionPicker
            size="sm"
            align="start"
            onToggle={handleMainButtonClick}
            onSelect={applyReaction}
            trigger={(_open, handlers) => (
              <button
                onClick={handlers.onClick}
                onMouseEnter={handlers.onMouseEnter}
                onPointerDown={handlers.onPointerDown}
                onPointerMove={handlers.onPointerMove}
                onPointerUp={handlers.onPointerUp}
                onPointerCancel={handlers.onPointerCancel}
                className={cn(
                  'touch-none select-none py-1 font-semibold transition-colors hover:text-accent',
                  myReaction && 'text-accent',
                )}
              >
                {myReaction ? REACTION_META[myReaction.type].label : 'إعجاب'}
              </button>
            )}
          />

          {user && (
            <button
              onClick={() => setReplying((prev) => !prev)}
              className="flex items-center gap-1 font-semibold transition-colors hover:text-accent"
            >
              <CornerDownLeft className="h-3 w-3" />
              رد
            </button>
          )}
        </div>

        {reactionsModalOpen && (
          <ReactionsListModal
            url={`/posts/comments/${comment._id}/reactions`}
            onClose={() => setReactionsModalOpen(false)}
          />
        )}

        {replying && user && (
          <form onSubmit={handleReplySubmit} className="mt-2 flex items-center gap-2">
            <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="sm" />
            <MentionTextarea
              autoFocus
              rows={1}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleReplySubmit(e);
                }
              }}
              placeholder="اكتب ردًا... (استخدم @ للإشارة إلى أحد)"
              className="h-9 min-h-9 flex-1 resize-none rounded-full border border-transparent bg-surface-2/70 px-3.5 py-2 text-sm leading-tight shadow-soft transition-colors focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              disabled={!replyText.trim() || submittingReply}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white shadow-soft transition-all hover:shadow-glow active:scale-95 disabled:opacity-40 disabled:hover:shadow-soft"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        )}

        {replyCount > 0 && (
          <button
            onClick={toggleReplies}
            className="mt-1.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-muted-foreground hover:text-accent"
          >
            <CornerDownLeft className="h-3 w-3" />
            {repliesExpanded ? 'إخفاء الردود' : `عرض ${replyCount} ${replyCount === 1 ? 'رد' : 'ردود'}`}
          </button>
        )}

        {(repliesLoading || repliesLoaded) && (
          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-300 ease-in-out',
              repliesExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            )}
          >
            <div className="overflow-hidden">
              <div className="space-y-3 border-s-2 border-border/60 pb-0.5 pt-2.5 ps-3.5">
                {repliesLoading ? (
                  <div className="space-y-3">
                    {[0, 1].map((i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                        <Skeleton className="h-10 flex-1 rounded-2xl" />
                      </div>
                    ))}
                  </div>
                ) : (
                  replies.map((reply) => <CommentItem key={reply._id} comment={reply} onDeleted={handleReplyDeleted} />)
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="حذف التعليق"
        message="لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        loading={deleteBusy}
      />
    </div>
  );
}
