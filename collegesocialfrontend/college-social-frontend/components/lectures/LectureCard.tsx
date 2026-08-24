'use client';

import { useState } from 'react';
import { Maximize2, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import {
  AttachmentPreview,
  isPdf,
} from '@/components/feed/AttachmentPreview';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { ACADEMIC_YEAR_LABELS } from '@/lib/academic-years';
import { SPECIALIZATION_LABELS } from '@/lib/specializations';
import { assetUrl, timeAgo } from '@/lib/utils';
import type { Post } from '@/lib/types';
import { LecturePdfLightbox } from './LecturePdfLightbox';

export function LectureCard({
  post,
  onDeleted,
}: {
  post: Post;
  onDeleted?: (id: string) => void;
}) {
  const { user } = useAuth();

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canFocus =
    post.attachmentType === 'lecture' &&
    !!post.attachmentUrl &&
    isPdf(post.attachmentUrl, post.attachmentOriginalName);

  const isAuthor =
    !!post.author && user?._id === post.author._id;

  async function handleDelete() {
    setDeleteBusy(true);

    try {
      await api.delete(`/posts/${post._id}`);

      // Remove the card from the browser immediately
      // after the backend confirms successful deletion.
      onDeleted?.(post._id);

      // Only close the confirmation modal after success.
      setConfirmDeleteOpen(false);
    } catch (error) {
      console.error('Failed to delete post:', error);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Avatar
          src={assetUrl(post.author?.photoUrl)}
          name={post.author?.name ?? 'مستخدم محذوف'}
          size="sm"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {post.caption || 'بدون عنوان'}
          </p>

          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{post.author?.name ?? 'مستخدم محذوف'}</span>
            <span>{timeAgo(post.createdAt)}</span>
          </div>
        </div>

        {canFocus && (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            title="فتح في وضع القراءة"
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-accent"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}

        {isAuthor && (
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            title="حذف"
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {post.courseCode && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
            {post.courseCode}
          </span>
        )}

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

      <div className="mt-3">
        <AttachmentPreview
          attachmentType={post.attachmentType}
          attachmentUrl={post.attachmentUrl}
          attachmentOriginalName={post.attachmentOriginalName}
        />
      </div>

      {canFocus && post.attachmentUrl && (
        <LecturePdfLightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          url={assetUrl(post.attachmentUrl)!}
          title={
            post.attachmentOriginalName ??
            post.caption ??
            'معاينة PDF'
          }
        />
      )}

      <ConfirmModal
        open={confirmDeleteOpen}
        onClose={() => {
          if (!deleteBusy) {
            setConfirmDeleteOpen(false);
          }
        }}
        onConfirm={handleDelete}
        title="حذف الملف"
        message="لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        loading={deleteBusy}
      />
    </div>
  );
}