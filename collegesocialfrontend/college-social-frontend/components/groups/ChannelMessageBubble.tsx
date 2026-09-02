'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Clock,
  Copy,
  FileText,
  Pencil,
  Reply,
  RotateCw,
  SmilePlus,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { TaggedText } from '@/components/shared/TaggedText';
import { assetUrl, cn, formatBytes, timeAgo } from '@/lib/utils';
import { cldOptimize } from '@/lib/images';
import { extractFirstUrl } from '@/lib/chat-helpers';
import type { Attachment, ChannelMessage } from '@/lib/types';

import { EmojiPicker, QuickReactionBar } from '@/components/chat/EmojiPicker';
import { LinkPreviewCard } from '@/components/chat/LinkPreviewCard';
import { MessageMenu, type MessageMenuItem } from '@/components/chat/MessageMenu';
import { VoiceMessagePlayer } from '@/components/chat/VoiceMessagePlayer';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp)$/i;

interface ChannelMessageBubbleProps {
  message: ChannelMessage;
  isOwn: boolean;
  showAvatar: boolean;
  currentUserId: string;
  onReply: (message: ChannelMessage) => void;
  onEdit: (message: ChannelMessage) => void;
  onDelete: (message: ChannelMessage, forEveryone: boolean) => void;
  onReact: (message: ChannelMessage, emoji: string) => void;
  onToggleStar: (message: ChannelMessage) => void;
  onJumpToReply: (messageId: string) => void;
  onRetry?: (message: ChannelMessage) => void;
  onImageClick?: (url: string, name: string, message: ChannelMessage) => void;
}

// Pre-parity messages only carry a single `attachmentUrl`. Synthesise an Attachment so the
// same render path covers both old and new messages.
function resolveAttachments(message: ChannelMessage): Attachment[] {
  if (message.attachments?.length) return message.attachments;
  if (message.attachmentUrl) {
    const url = message.attachmentUrl;
    return [{ url, type: IMAGE_EXTENSIONS.test(url) ? 'image' : 'document', name: null }];
  }
  return [];
}

export function ChannelMessageBubble({
  message,
  isOwn,
  showAvatar,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onToggleStar,
  onJumpToReply,
  onRetry,
  onImageClick,
}: ChannelMessageBubbleProps) {
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [fullPickerOpen, setFullPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  const attachments = resolveAttachments(message);
  const isStarred = message.starredBy?.includes(currentUserId);
  const previewUrl = extractFirstUrl(message.text);

  const reactionGroups = (message.reactions ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  const myReactionEmoji = (message.reactions ?? []).find(
    (r) => (typeof r.user === 'string' ? r.user : r.user._id) === currentUserId,
  )?.emoji;

  useEffect(() => {
    if (!mobileActionsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileActionsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileActionsOpen]);

  if (message.deletedForEveryone) {
    return (
      <div className={cn('flex items-end gap-2.5', isOwn && 'flex-row-reverse')}>
        <div className="w-8 shrink-0">
          {!isOwn && showAvatar && (
            <Avatar src={assetUrl(message.sender?.photoUrl)} name={message.sender?.name ?? 'مستخدم محذوف'} size="sm" />
          )}
        </div>
        <div className={cn('flex max-w-[75%] flex-col', isOwn ? 'items-end' : 'items-start')}>
          <div className="rounded-2xl bg-surface-2/50 px-4 py-2.5 text-[13px] italic text-muted-foreground">
            {isOwn ? 'قمت بحذف هذه الرسالة' : 'تم حذف هذه الرسالة'}
          </div>
        </div>
      </div>
    );
  }

  const menuItems: MessageMenuItem[] = [
    {
      key: 'reply',
      label: 'رد',
      icon: <Reply className="h-4 w-4" />,
      onClick: () => {
        setMobileActionsOpen(false);
        onReply(message);
      },
    },
    {
      key: 'star',
      label: isStarred ? 'إلغاء التمييز' : 'تمييز بنجمة',
      icon: <Star className="h-4 w-4" />,
      onClick: () => {
        setMobileActionsOpen(false);
        onToggleStar(message);
      },
    },
    {
      key: 'copy',
      label: 'نسخ النص',
      icon: <Copy className="h-4 w-4" />,
      onClick: () => {
        if (message.text) navigator.clipboard.writeText(message.text);
        setMobileActionsOpen(false);
      },
    },
  ];

  if (isOwn && message.text) {
    menuItems.push({
      key: 'edit',
      label: 'تعديل',
      icon: <Pencil className="h-4 w-4" />,
      onClick: () => {
        setMobileActionsOpen(false);
        onEdit(message);
      },
    });
  }

  if (isOwn) {
    menuItems.push({
      key: 'delete-everyone',
      label: 'حذف لدى الجميع',
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      onClick: () => {
        setMobileActionsOpen(false);
        onDelete(message, true);
      },
    });
  }

  menuItems.push({
    key: 'delete-me',
    label: 'حذف لديّ',
    icon: <Trash2 className="h-4 w-4" />,
    danger: true,
    onClick: () => {
      setMobileActionsOpen(false);
      onDelete(message, false);
    },
  });

  function closeMobileActions() {
    setMobileActionsOpen(false);
  }

  function handleMessageClick() {
    setReactionBarOpen(false);
    setFullPickerOpen(false);
    setMenuOpen(false);
    setMobileActionsOpen(true);
  }

  const handleTouchStart = () => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setMobileActionsOpen(true);
    }, 500);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <>
      <div className={cn('group flex items-end gap-2.5', isOwn && 'flex-row-reverse')}>
        <div className="w-8 shrink-0">
          {!isOwn && showAvatar && (
            <Avatar
              src={assetUrl(message.sender?.photoUrl)}
              name={message.sender?.name ?? 'مستخدم محذوف'}
              size="sm"
              viewable
            />
          )}
        </div>

        <div className={cn('relative flex min-w-0 max-w-[75%] flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
          {/* Desktop toolbar */}
          <div
            className={cn(
              'pointer-events-none absolute top-0 z-30 hidden -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity md:flex',
              'group-hover:pointer-events-auto group-hover:opacity-100',
              isOwn ? 'end-full me-1' : 'start-full ms-1',
            )}
          >
            <button
              type="button"
              onClick={() => setReactionBarOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted-foreground shadow-soft hover:text-accent"
              aria-label="إضافة تفاعل"
            >
              <SmilePlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onReply(message)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted-foreground shadow-soft hover:text-accent"
              aria-label="رد"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
            <div className="relative">
              <button
                ref={menuButtonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted-foreground shadow-soft hover:text-accent"
                aria-label="المزيد"
              >
                ⋮
              </button>
              <MessageMenu
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                items={menuItems}
                align={isOwn ? 'end' : 'start'}
                anchorRef={menuButtonRef}
              />
            </div>
          </div>

          {/* Message content */}
          <div
            className="w-full min-w-0 cursor-pointer"
            onClick={handleMessageClick}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleMessageClick();
              }
            }}
          >
            {message.forwarded && <p className="px-1 text-[11px] italic text-muted-foreground">إعادة توجيه</p>}

            {message.replyTo && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onJumpToReply(message.replyTo!._id);
                }}
                className={cn(
                  'mb-1 w-full max-w-full rounded-xl border-s-4 border-accent bg-surface-2 px-3 py-1.5 text-start text-xs',
                  isOwn && 'border-white/50 bg-black/20 text-white',
                )}
              >
                <p className={cn('font-medium', isOwn ? 'text-white' : 'text-accent')}>
                  {message.replyTo.sender?.name ?? 'مستخدم محذوف'}
                </p>
                <p className={cn('truncate', isOwn ? 'text-white/90' : 'text-foreground/75')}>
                  {message.replyTo.deletedForEveryone
                    ? 'تم حذف هذه الرسالة'
                    : message.replyTo.text ||
                      (message.replyTo.attachments?.length || message.replyTo.attachmentUrl ? 'مرفق' : '')}
                </p>
              </button>
            )}

            {attachments.map((attachment, i) => {
              const url = assetUrl(attachment.url) ?? '';

              if (attachment.type === 'image') {
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!isLongPress.current && onImageClick) {
                        onImageClick(url, attachment.name ?? 'صورة', message);
                      }
                      isLongPress.current = false;
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={clearLongPress}
                    onTouchMove={clearLongPress}
                    className="block w-full cursor-pointer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cldOptimize(url, { width: 1000 })}
                      alt={attachment.name ?? 'صورة'}
                      className="animate-bubble-in max-h-64 max-w-full rounded-2xl object-cover"
                    />
                  </button>
                );
              }

              if (attachment.type === 'video') {
                return (
                  <video
                    key={i}
                    src={url}
                    controls
                    onClick={(event) => event.stopPropagation()}
                    className="animate-bubble-in max-h-64 max-w-full rounded-2xl"
                  />
                );
              }

              if (attachment.type === 'voice' || attachment.type === 'audio') {
                return (
                  <div key={i} onClick={(event) => event.stopPropagation()}>
                    <VoiceMessagePlayer src={url} isOwn={isOwn} duration={attachment.duration ?? undefined} />
                  </div>
                );
              }

              return (
                <button
                  key={i}
                  type="button"
                  // A plain <a href> always navigates on tap and swallows the click before it
                  // reaches handleMessageClick, so a file message could never open the actions
                  // sheet on mobile (no hover toolbar there). Mirrors the image attachment's
                  // long-press-for-actions / tap-to-open pattern instead.
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!isLongPress.current) window.open(url, '_blank', 'noopener,noreferrer');
                    isLongPress.current = false;
                  }}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={clearLongPress}
                  onTouchMove={clearLongPress}
                  className={cn(
                    'flex w-full max-w-full items-center gap-2.5 rounded-2xl px-4 py-3 text-start text-[15px] transition-colors',
                    isOwn ? 'bg-gradient-accent text-white' : 'bg-surface-2/70 text-foreground hover:bg-surface-2',
                  )}
                >
                  <FileText className="h-5 w-5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate">{attachment.name ?? 'مرفق'}</span>
                    {attachment.size != null && (
                      <span className={cn('block text-xs', isOwn ? 'text-white/80' : 'text-muted-foreground')}>
                        {formatBytes(attachment.size)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}

            {message.text && (
              <div
                className={cn(
                  'animate-bubble-in whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
                  isOwn
                    ? 'rounded-bl-md bg-gradient-accent text-white shadow-soft'
                    : 'rounded-br-md bg-surface-2/70 text-foreground',
                )}
              >
                <TaggedText text={message.text} />
              </div>
            )}

            {previewUrl && !attachments.length && (
              <div onClick={(event) => event.stopPropagation()}>
                <LinkPreviewCard url={previewUrl} isOwn={isOwn} />
              </div>
            )}

            {Object.keys(reactionGroups).length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>
                {Object.entries(reactionGroups).map(([emoji, count]) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact(message, emoji)}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs shadow-soft transition-transform hover:scale-105',
                      myReactionEmoji === emoji ? 'border-accent bg-accent/10' : 'border-border bg-surface',
                    )}
                  >
                    <span>{emoji}</span>
                    {count > 1 && <span className="text-muted-foreground">{count}</span>}
                  </button>
                ))}
              </div>
            )}

            <span className="mt-1 flex items-center gap-1 px-1 text-xs text-muted-foreground">
              {message.edited && <span className="italic">مُعدَّلة ·</span>}
              {timeAgo(message.createdAt)}
              {isOwn && message.failed ? (
                <button
                  type="button"
                  onClick={() => onRetry?.(message)}
                  className="flex items-center gap-1 font-medium text-danger underline"
                >
                  <RotateCw className="h-3 w-3" /> لم تُرسل — إعادة المحاولة
                </button>
              ) : isOwn && message.pending ? (
                <Clock className="h-3 w-3 text-muted-foreground" />
              ) : null}
            </span>
          </div>

          {/* Reaction picker */}
          <div className="relative" onClick={(event) => event.stopPropagation()}>
            <QuickReactionBar
              open={reactionBarOpen}
              onClose={() => setReactionBarOpen(false)}
              onSelect={(emoji) => {
                onReact(message, emoji);
                setReactionBarOpen(false);
              }}
              onOpenFullPicker={() => {
                setReactionBarOpen(false);
                setFullPickerOpen(true);
              }}
              align={isOwn ? 'end' : 'start'}
            />
            <EmojiPicker
              open={fullPickerOpen}
              onClose={() => setFullPickerOpen(false)}
              onSelect={(emoji) => {
                onReact(message, emoji);
                setFullPickerOpen(false);
              }}
              anchorClassName={cn(
                'absolute bottom-full z-30 mb-2 w-[19rem] rounded-2xl border border-border bg-surface p-2.5 shadow-card animate-slide-up',
                isOwn ? 'end-0' : 'start-0',
              )}
            />
          </div>
        </div>
      </div>

      {/* MOBILE ACTION SHEET */}
      {mobileActionsOpen && (
        <div className="fixed inset-0 z-[9999] md:hidden" role="dialog" aria-modal="true" aria-label="إجراءات الرسالة">
          <button
            type="button"
            aria-label="إغلاق"
            onClick={closeMobileActions}
            className="absolute inset-0 h-full w-full bg-black/40"
          />
          <div
            className="absolute inset-x-0 bottom-0 w-full rounded-t-2xl border-t border-border bg-surface p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-foreground">إجراءات الرسالة</p>
              <button
                type="button"
                onClick={closeMobileActions}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileActionsOpen(false);
                  setReactionBarOpen(true);
                }}
                className="flex flex-col items-center justify-center gap-1 rounded-xl bg-surface-2 px-2 py-3 text-xs text-foreground hover:bg-surface-2/80"
              >
                <SmilePlus className="h-5 w-5" />
                <span>تفاعل</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileActionsOpen(false);
                  onReply(message);
                }}
                className="flex flex-col items-center justify-center gap-1 rounded-xl bg-surface-2 px-2 py-3 text-xs text-foreground hover:bg-surface-2/80"
              >
                <Reply className="h-5 w-5" />
                <span>رد</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (message.text) navigator.clipboard.writeText(message.text);
                  setMobileActionsOpen(false);
                }}
                className="flex flex-col items-center justify-center gap-1 rounded-xl bg-surface-2 px-2 py-3 text-xs text-foreground hover:bg-surface-2/80"
              >
                <Copy className="h-5 w-5" />
                <span>نسخ</span>
              </button>
            </div>
            <div className="space-y-1">
              {menuItems
                .filter((item) => item.key !== 'reply' && item.key !== 'copy')
                .map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={item.onClick}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-start text-sm',
                      'transition-colors hover:bg-surface-2 active:bg-surface-2',
                      item.danger ? 'text-danger' : 'text-foreground',
                    )}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
