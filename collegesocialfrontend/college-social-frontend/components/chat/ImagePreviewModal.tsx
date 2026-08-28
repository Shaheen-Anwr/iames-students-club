'use client';

import { useEffect, useState } from 'react';
import { Forward, Pencil, Reply, SmilePlus, Star, Trash2, X } from 'lucide-react';
import { cldOptimize } from '@/lib/images';
import { QuickReactionBar } from './EmojiPicker';

// Shared by ChatWindow (personal chat) and ChannelWindow (group channels). Generic over the
// message shape -- both `Message` and `ChannelMessage` carry the fields used here.
interface PreviewMessage {
  text?: string;
  starredBy?: string[];
}

export function ImagePreviewModal<T extends PreviewMessage>({
  src,
  alt,
  onClose,
  message,
  isOwn,
  onReply,
  onReact,
  onForward,
  onToggleStar,
  onEdit,
  onDelete,
  currentUserId,
}: {
  src: string;
  alt: string;
  onClose: () => void;
  message: T;
  isOwn: boolean;
  onReply: (msg: T) => void;
  onReact: (msg: T, emoji: string) => void;
  onForward?: (msg: T) => void;
  onToggleStar: (msg: T) => void;
  onEdit: (msg: T) => void;
  onDelete: (msg: T, forEveryone: boolean) => void;
  currentUserId: string;
}) {
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [deleteOptionsOpen, setDeleteOptionsOpen] = useState(false);
  const isStarred = message.starredBy?.includes(currentUserId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        setDeleteOptionsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/90 p-4"
      onClick={() => {
        onClose();
        setDeleteOptionsOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="معاينة الصورة"
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        aria-label="إغلاق"
      >
        <X className="h-6 w-6" />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cldOptimize(src, { width: 1600, crop: 'limit' })}
        alt={alt}
        className="max-h-[70vh] w-full flex-1 object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      <div
        className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-surface p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            onReply(message);
            onClose();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-foreground hover:bg-accent hover:text-white"
          title="رد"
        >
          <Reply className="h-5 w-5" />
        </button>

        <div className="relative">
          <button
            onClick={() => setReactionBarOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-foreground hover:bg-accent hover:text-white"
            title="تفاعل"
          >
            <SmilePlus className="h-5 w-5" />
          </button>
          <QuickReactionBar
            open={reactionBarOpen}
            onClose={() => setReactionBarOpen(false)}
            onSelect={(emoji) => {
              onReact(message, emoji);
              setReactionBarOpen(false);
            }}
            onOpenFullPicker={() => setReactionBarOpen(false)}
            align="start"
          />
        </div>

        {onForward && (
          <button
            onClick={() => {
              onForward(message);
              onClose();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-foreground hover:bg-accent hover:text-white"
            title="إعادة توجيه"
          >
            <Forward className="h-5 w-5" />
          </button>
        )}

        <button
          onClick={() => onToggleStar(message)}
          className={`flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 hover:bg-accent hover:text-white ${
            isStarred ? 'text-yellow-400' : 'text-foreground'
          }`}
          title={isStarred ? 'إلغاء التمييز' : 'تمييز بنجمة'}
        >
          <Star className="h-5 w-5" />
        </button>

        {isOwn && message.text && (
          <button
            onClick={() => {
              onEdit(message);
              onClose();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-foreground hover:bg-accent hover:text-white"
            title="تعديل"
          >
            <Pencil className="h-5 w-5" />
          </button>
        )}

        {isOwn && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeleteOptionsOpen((v) => !v);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-danger hover:bg-danger hover:text-white"
              title="حذف"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            {deleteOptionsOpen && (
              <div
                className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-xl bg-surface p-2 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    onDelete(message, true);
                    onClose();
                    setDeleteOptionsOpen(false);
                  }}
                  className="block w-full whitespace-nowrap rounded-lg px-4 py-2 text-sm text-danger hover:bg-danger/10"
                >
                  حذف لدى الجميع
                </button>
                <button
                  onClick={() => {
                    onDelete(message, false);
                    onClose();
                    setDeleteOptionsOpen(false);
                  }}
                  className="block w-full whitespace-nowrap rounded-lg px-4 py-2 text-sm text-foreground hover:bg-surface-2"
                >
                  حذف لديّ
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
