'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Forward, Pencil, Reply, SmilePlus, Star, Trash2, X } from 'lucide-react';
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
  gallery,
  initialIndex = 0,
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
  /** Album mode: every photo of the message, swipe / arrow keys between them. */
  gallery?: { url: string; name: string }[];
  initialIndex?: number;
}) {
  const [index, setIndex] = useState(initialIndex);
  const touchStart = useRef<number | null>(null);
  const count = gallery?.length ?? 1;
  const current = gallery?.[index] ?? { url: src, name: alt };
  // One photo forward (+1) / back (-1); the album reads right-to-left under RTL, so "next" is leftward.
  const step = (delta: number) => setIndex((i) => Math.min(count - 1, Math.max(0, i + delta)));
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [deleteOptionsOpen, setDeleteOptionsOpen] = useState(false);
  const isStarred = message.starredBy?.includes(currentUserId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        setDeleteOptionsOpen(false);
      }
      // RTL reading order: ArrowLeft moves forward through the album.
      if (e.key === 'ArrowLeft') setIndex((i) => Math.min(count - 1, i + 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, count]);

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

      {count > 1 && (
        <span className="absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm font-medium tabular-nums text-white">
          {index + 1} / {count}
        </span>
      )}
      <a
        href={current.url}
        target="_blank"
        rel="noopener noreferrer"
        download
        onClick={(e) => e.stopPropagation()}
        className="absolute left-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        aria-label="فتح الصورة الأصلية"
        title="فتح الصورة الأصلية"
      >
        <Download className="h-6 w-6" />
      </a>
      {count > 1 && index > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            step(-1);
          }}
          className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/45 p-2.5 text-white hover:bg-black/70"
          aria-label="الصورة السابقة"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
      {count > 1 && index < count - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            step(1);
          }}
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/45 p-2.5 text-white hover:bg-black/70"
          aria-label="الصورة التالية"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={current.url}
        src={cldOptimize(current.url, { width: 1600, crop: 'limit' })}
        alt={current.name}
        onTouchStart={(e) => {
          touchStart.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchStart.current === null) return;
          const dx = e.changedTouches[0].clientX - touchStart.current;
          touchStart.current = null;
          // Swipe right -> forward (RTL), swipe left -> back.
          if (Math.abs(dx) > 50) step(dx > 0 ? 1 : -1);
        }}
        className="max-h-[70vh] w-full flex-1 animate-fade-in object-contain"
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
