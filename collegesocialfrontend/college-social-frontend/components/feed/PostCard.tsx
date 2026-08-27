'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bookmark, Bot, Lock, MessageCircle, MoreHorizontal, Pencil, Share2, ThumbsUp, Trash2, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Dropdown } from '@/components/ui/Dropdown';
import { MentionTextarea } from '@/components/shared/MentionTextarea';
import { TaggedText } from '@/components/shared/TaggedText';
import { api, ApiError } from '@/lib/api';
import { useAi } from '@/lib/ai-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { ACADEMIC_YEAR_LABELS } from '@/lib/academic-years';
import { SPECIALIZATION_LABELS } from '@/lib/specializations';
import { REACTION_META, type Post, type Reaction, type ReactionType } from '@/lib/types';
import { AttachmentPreview } from './AttachmentPreview';
import { CommentsModal } from './CommentsModal';
import { REACTION_COLORS, ReactionIcon } from './reaction-icons';
import { ReactionPicker } from './ReactionPicker';
import { ReactionsListModal } from './ReactionsListModal';
import { ShareModal } from './ShareModal';

// A plain icon action button -- the shared look for the like/comment/share/save row below.
function ActionIconButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-90',
        active ? 'text-accent' : 'text-muted-foreground hover:bg-surface-2 hover:text-accent',
      )}
    >
      {children}
    </button>
  );
}

export function PostCard({
  post,
  onDeleted,
  onSavedChange,
  onShared,
}: {
  post: Post;
  onDeleted: (id: string) => void;
  onSavedChange?: (id: string, saved: boolean) => void;
  onShared?: (post: Post) => void;
}) {
  const { user } = useAuth();
  const { shareToAi } = useAi();
  const { showToast } = useToast();
  const [reactions, setReactions] = useState<Reaction[]>(post.reactions);
  const [savedBy, setSavedBy] = useState(post.savedBy);
  const [busy, setBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [reactionsModalOpen, setReactionsModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareCount, setShareCount] = useState(post.shareCount ?? 0);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(post.caption);
  const [edited, setEdited] = useState(post.edited ?? false);
  const [editText, setEditText] = useState(post.caption);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const myReaction = user ? reactions.find((r) => r.user === user._id) ?? null : null;
  const saved = !!user && savedBy.includes(user._id);
  const isAuthor = !!post.author && user?._id === post.author._id;

  const { totalReactions, topReactions } = useMemo(() => {
    const counts = new Map<ReactionType, number>();
    for (const r of reactions) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return { totalReactions: reactions.length, topReactions: sorted.slice(0, 3) };
  }, [reactions]);

  async function applyReaction(type: ReactionType) {
    if (!user || busy) return;
    setBusy(true);
    const prevReactions = reactions;
    const uid = user._id;
    const existing = reactions.find((r) => r.user === uid);

    let next: Reaction[];
    if (existing?.type === type) next = reactions.filter((r) => r.user !== uid);
    else if (existing) next = reactions.map((r) => (r.user === uid ? { ...r, type } : r));
    else next = [...reactions, { user: uid, type }];
    setReactions(next);

    try {
      await api.post(`/posts/${post._id}/react`, { type });
    } catch {
      setReactions(prevReactions);
    } finally {
      setBusy(false);
    }
  }

  function handleMainButtonClick() {
    if (myReaction) applyReaction(myReaction.type); // toggles it off
    else applyReaction('like');
  }

  async function toggleSave() {
    if (!user || saveBusy) return;
    setSaveBusy(true);
    const wasSaved = saved;
    setSavedBy((prev) => (wasSaved ? prev.filter((id) => id !== user._id) : [...prev, user._id]));
    try {
      await api.post(`/posts/${post._id}/save`);
      onSavedChange?.(post._id, !wasSaved);
    } catch {
      setSavedBy((prev) => (wasSaved ? [...prev, user._id] : prev.filter((id) => id !== user._id)));
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleDelete() {
    setDeleteBusy(true);
    try {
      await api.delete(`/posts/${post._id}`);
      onDeleted(post._id);
    } finally {
      setDeleteBusy(false);
      setConfirmDeleteOpen(false);
    }
  }

  function startEditing() {
    setEditText(caption);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditText(caption);
  }

  async function handleEditSubmit() {
    if (!editText.trim() || editSubmitting) return;
    setEditSubmitting(true);
    try {
      const updated = await api.patch<Post>(`/posts/${post._id}`, { caption: editText.trim() });
      setCaption(updated.caption);
      setEdited(true);
      setEditing(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ التعديل.', 'error');
    } finally {
      setEditSubmitting(false);
    }
  }

  return (
    <Card
      className={cn(
        'p-4 transition-shadow duration-300 hover:shadow-card',
        post.scope === 'department' ? 'border-s-4 border-s-accent-2' : 'border-s-4 border-s-accent',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {post.author ? (
          <Link href={`/profile/${post.author._id}`} className="flex items-center gap-3">
            <Avatar src={assetUrl(post.author.photoUrl)} name={post.author.name} size="md" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground hover:underline">{post.author.name}</p>
                <RoleBadge role={post.author.role} />
              </div>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                {timeAgo(post.createdAt)}
                {edited && <span>· تم التعديل</span>}
                {post.courseCode && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground">{post.courseCode}</span>}
                {post.scope === 'friends' && (
                  <span className="inline-flex items-center gap-1" title="مرئي للأصدقاء فقط">
                    <Users className="h-3 w-3" />
                    الأصدقاء
                  </span>
                )}
                {post.scope === 'private' && (
                  <span className="inline-flex items-center gap-1" title="مرئي لك فقط">
                    <Lock className="h-3 w-3" />
                    أنا فقط
                  </span>
                )}
              </p>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar src={undefined} name="؟" size="md" />
            <div>
              <p className="text-sm font-semibold text-muted-foreground">مستخدم محذوف</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(post.createdAt)}</p>
            </div>
          </div>
        )}
        {isAuthor && (
          <Dropdown
            trigger={
              <span className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </span>
            }
            items={[
              { label: 'تعديل المنشور', icon: Pencil, onClick: startEditing },
              { label: 'حذف المنشور', icon: Trash2, onClick: () => setConfirmDeleteOpen(true), destructive: true },
            ]}
          />
        )}
      </div>

      {(post.department || post.academicYear || post.specialization) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {post.department && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
              {DEPARTMENT_LABELS[post.department]}
            </span>
          )}
          {post.academicYear && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
              {ACADEMIC_YEAR_LABELS[post.academicYear]}
            </span>
          )}
          {post.specialization && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
              {SPECIALIZATION_LABELS[post.specialization]}
            </span>
          )}
        </div>
      )}

      {editing ? (
        <div className="mt-4 space-y-2">
          <MentionTextarea
            autoFocus
            rows={3}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="rounded-xl2 border-transparent bg-surface-2/70 px-4 py-3 text-[15px] leading-relaxed focus:bg-surface"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={cancelEditing}
              className="rounded-full px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-2"
            >
              إلغاء
            </button>
            <Button onClick={handleEditSubmit} loading={editSubmitting} size="sm" className="rounded-full px-4">
              حفظ
            </Button>
          </div>
        </div>
      ) : (
        caption && (
          <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            <TaggedText text={caption} />
          </p>
        )
      )}

      {post.attachmentType !== 'none' && (
        <div className="mt-4">
          <AttachmentPreview
            postId={post._id}
            attachmentType={post.attachmentType}
            attachmentUrl={post.attachmentUrl}
            attachmentOriginalName={post.attachmentOriginalName}
            attachmentSize={post.attachmentSize}
            attachmentChunkCount={post.attachmentChunkCount}
            images={post.images}
          />
        </div>
      )}

      {(totalReactions > 0 || commentCount > 0 || shareCount > 0) && (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          {totalReactions > 0 ? (
            <button
              onClick={() => setReactionsModalOpen(true)}
              className="group flex items-center gap-1.5 rounded-full bg-surface-2/70 py-1 pe-2.5 ps-1.5 transition-colors hover:bg-surface-2"
            >
              <span className="flex items-center">
                {topReactions.map(([type], i) => (
                  <span
                    key={type}
                    style={{ marginInlineStart: i === 0 ? 0 : -6, zIndex: topReactions.length - i }}
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-surface',
                      REACTION_COLORS[type].bg,
                      REACTION_COLORS[type].text,
                    )}
                  >
                    <ReactionIcon type={type} className="h-3 w-3" />
                  </span>
                ))}
              </span>
              <span key={totalReactions} className="animate-bubble-in font-medium text-foreground/70 group-hover:text-foreground">
                {totalReactions}
              </span>
            </button>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-3">
            {commentCount > 0 && (
              <button onClick={() => setCommentsOpen(true)} className="hover:text-foreground hover:underline">
                {commentCount} تعليق
              </button>
            )}
            {shareCount > 0 && <span>{shareCount} مشاركة</span>}
          </span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-border pt-1">
        <div className="flex items-center gap-0.5">
          <ReactionPicker
            onToggle={handleMainButtonClick}
            onSelect={applyReaction}
            trigger={(_open, handlers) => (
              <button
                onClick={handlers.onClick}
                onMouseEnter={handlers.onMouseEnter}
                onFocus={handlers.onMouseEnter}
                onPointerDown={handlers.onPointerDown}
                onPointerMove={handlers.onPointerMove}
                onPointerUp={handlers.onPointerUp}
                onPointerCancel={handlers.onPointerCancel}
                title={myReaction ? REACTION_META[myReaction.type].label : 'إعجاب'}
                aria-pressed={!!myReaction}
                className={cn(
                  'flex h-10 min-w-10 touch-none select-none items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-semibold transition-all active:scale-90',
                  myReaction
                    ? cn(REACTION_COLORS[myReaction.type].bg, REACTION_COLORS[myReaction.type].text)
                    : 'text-muted-foreground hover:bg-surface-2 hover:text-accent',
                )}
              >
                {myReaction ? (
                  <>
                    <span key={myReaction.type} className="animate-reaction-pop">
                      <ReactionIcon type={myReaction.type} className="h-5 w-5" />
                    </span>
                    <span className="animate-fade-in">{REACTION_META[myReaction.type].label}</span>
                  </>
                ) : (
                  <ThumbsUp className="h-[22px] w-[22px]" />
                )}
              </button>
            )}
          />

          <ActionIconButton onClick={() => setCommentsOpen(true)} title="التعليقات">
            <MessageCircle className="h-[22px] w-[22px]" />
          </ActionIconButton>

          {/* Friends-only / "only me" posts can't be reshared -- forwarding one to the sharer's
              own audience would leak it past the author's chosen circle (server enforces this too). */}
          {post.scope !== 'friends' && post.scope !== 'private' && (
            <ActionIconButton onClick={() => setShareModalOpen(true)} title="مشاركة">
              <Share2 className="h-5 w-5" />
            </ActionIconButton>
          )}

          <ActionIconButton onClick={() => shareToAi(post)} title="اسأل المساعد الذكي عن هذا المنشور">
            <Bot className="h-5 w-5" />
          </ActionIconButton>
        </div>

        <ActionIconButton active={saved} onClick={toggleSave} title={saved ? 'محفوظ' : 'حفظ'}>
          <Bookmark className={cn('h-5 w-5', saved && 'fill-accent')} />
        </ActionIconButton>
      </div>

      {reactionsModalOpen && (
        <ReactionsListModal url={`/posts/${post._id}/reactions`} onClose={() => setReactionsModalOpen(false)} />
      )}

      {shareModalOpen && (
        <ShareModal
          post={post}
          onClose={() => setShareModalOpen(false)}
          onShared={(shared) => {
            setShareCount((c) => c + 1);
            onShared?.(shared);
            setShareModalOpen(false);
          }}
        />
      )}

      {commentsOpen && (
        <CommentsModal open={commentsOpen} onClose={() => setCommentsOpen(false)} postId={post._id} onCountChange={setCommentCount} />
      )}

      <ConfirmModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="حذف المنشور"
        message="لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        loading={deleteBusy}
      />
    </Card>
  );
}
