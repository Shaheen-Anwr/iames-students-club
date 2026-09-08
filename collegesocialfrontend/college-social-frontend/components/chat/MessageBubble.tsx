'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  Copy,
  FileText,
  Forward,
  Loader2,
  Lock,
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
import { haptic } from '@/lib/haptics';
import { useSwipeToReply } from '@/lib/use-swipe-to-reply';
import { cldOptimize } from '@/lib/images';
import { extractFirstUrl, tickStatus } from '@/lib/chat-helpers';
import { fetchAttachmentBlob, ApiError } from '@/lib/api';
import { openBlob } from '@/lib/download';
import { useToast } from '@/lib/toast-context';
import type { Conversation, Message } from '@/lib/types';

import { EmojiPicker, QuickReactionBar } from './EmojiPicker';
import { EncryptedMedia } from './EncryptedMedia';
import { LinkPreviewCard } from './LinkPreviewCard';
import { MessageMenu, type MessageMenuItem } from './MessageMenu';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  /** Group chat, first bubble of a same-sender cluster: render the sender's name. */
  showName?: boolean;
  firstInGroup?: boolean;
  /** Last bubble of a cluster: show the timestamp + read ticks. */
  lastInGroup?: boolean;
  conversation: Conversation;
  currentUserId: string;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message, forEveryone: boolean) => void;
  onReact: (message: Message, emoji: string) => void;
  onForward: (message: Message) => void;
  onToggleStar: (message: Message) => void;
  onJumpToReply: (messageId: string) => void;
  onRetry?: (message: Message) => void;
  onImageClick?: (url: string, name: string, message: Message) => void;
}

function ReadTicks({ status }: { status: 'sent' | 'delivered' | 'read' }) {
  if (status === 'sent') {
    return <Check className="h-3.5 w-3.5 text-white/70" />;
  }
  return (
    <CheckCheck
      className={cn(
        'h-3.5 w-3.5',
        status === 'read' ? 'text-sky-300' : 'text-white/70',
      )}
    />
  );
}

export function MessageBubble({
  message,
  isOwn,
  showAvatar,
  showName = false,
  firstInGroup = true,
  lastInGroup = true,
  conversation,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onForward,
  onToggleStar,
  onJumpToReply,
  onRetry,
  onImageClick,
}: MessageBubbleProps) {
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [fullPickerOpen, setFullPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  // Index (within this message's attachments) currently being fetched for a chunked document open
  // -- see openDocumentAttachment below.
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const { showToast } = useToast();

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const swipeEnabled = !message.pending && !message.failed && !message.deletedForEveryone;
  const { dx, swipeHandlers, progress } = useSwipeToReply(() => onReply(message), swipeEnabled);

  const attachments = message.attachments ?? [];
  const isStarred = message.starredBy?.includes(currentUserId);
  const status = tickStatus(message, conversation, currentUserId);
  // No server round-trip for link previews on an encrypted message -- it would hand the server a
  // URL from content it otherwise can't see.
  const previewUrl = message.encrypted ? null : extractFirstUrl(message.text);
  // Still-decrypting vs. gave-up. `decrypted === undefined` = the worker hasn't reached it yet.
  const decrypting = !!message.encrypted && !message.decryptFailed && message.decrypted === undefined && !message.text;

  // A document attachment that was too large for a single Cloudinary asset (chunkCount > 1, see
  // StorageService.upload()'s chunked path) only has its FIRST piece at `attachment.url` -- opening
  // that directly would silently open a truncated file. Fetch the backend's reassembled copy
  // instead; an unsplit attachment just points straight at its Cloudinary URL as before.
  async function openDocumentAttachment(
    rawUrl: string,
    index: number,
    chunkCount?: number | null,
    name?: string | null,
  ) {
    if (!chunkCount || chunkCount <= 1) {
      // A real https URL opened synchronously inside the tap -- fine on every device.
      window.open(rawUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setDownloadingIndex(index);
    try {
      // Chunked: fetch the reassembled bytes, then hand them to openBlob() -- on mobile that routes
      // through the share sheet, because a `window.open()` after this await has lost its user
      // gesture and mobile browsers won't open a blob: URL in a new tab anyway.
      const blob = await fetchAttachmentBlob(`chat/messages/${message._id}/attachments/${index}/download`);
      await openBlob(blob, name || 'file');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر فتح المرفق.', 'error');
    } finally {
      setDownloadingIndex(null);
    }
  }

  const reactionGroups = (message.reactions ?? []).reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const myReactionEmoji = (message.reactions ?? []).find(
    (r) =>
      (typeof r.user === 'string' ? r.user : r.user._id) === currentUserId,
  )?.emoji;

  useEffect(() => {
    if (!mobileActionsOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileActionsOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileActionsOpen]);

  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
  }, []);

  if (message.deletedForEveryone) {
    return (
      <div className={cn('flex items-end gap-2.5', isOwn && 'flex-row-reverse')}>
        <div className="w-8 shrink-0">
          {!isOwn && showAvatar && (
            <Avatar
              src={assetUrl(message.sender?.photoUrl)}
              name={message.sender?.name ?? 'مستخدم محذوف'}
              size="sm"
            />
          )}
        </div>
        <div
          className={cn(
            'flex max-w-[75%] flex-col',
            isOwn ? 'items-end' : 'items-start',
          )}
        >
          <div className="rounded-2xl bg-surface-2/50 px-4 py-2.5 text-[13px] italic text-muted-foreground">
            {isOwn ? 'قمت بحذف هذه الرسالة' : 'تم حذف هذه الرسالة'}
          </div>
        </div>
      </div>
    );
  }

  // --- Menu items (unchanged) ---
  const desktopMenuItems: MessageMenuItem[] = [
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
      key: 'forward',
      label: 'إعادة توجيه',
      icon: <Forward className="h-4 w-4" />,
      onClick: () => {
        setMobileActionsOpen(false);
        onForward(message);
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
        if (message.text) {
          navigator.clipboard.writeText(message.text);
        }
        setMobileActionsOpen(false);
      },
    },
  ];

  if (isOwn && message.text) {
    desktopMenuItems.push({
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
    desktopMenuItems.push({
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

  desktopMenuItems.push({
    key: 'delete-me',
    label: 'حذف لديّ',
    icon: <Trash2 className="h-4 w-4" />,
    danger: true,
    onClick: () => {
      setMobileActionsOpen(false);
      onDelete(message, false);
    },
  });

  const mobileMenuItems: MessageMenuItem[] = [
    {
      key: 'forward',
      label: 'إعادة توجيه',
      icon: <Forward className="h-4 w-4" />,
      onClick: () => {
        setMobileActionsOpen(false);
        onForward(message);
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
  ];

  if (isOwn && message.text) {
    mobileMenuItems.push({
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
    mobileMenuItems.push({
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

  mobileMenuItems.push({
    key: 'delete-me',
    label: 'حذف لديّ',
    icon: <Trash2 className="h-4 w-4" />,
    danger: true,
    onClick: () => {
      setMobileActionsOpen(false);
      onDelete(message, false);
    },
  });

  // An encrypted attachment can't be forwarded in v1 (no re-upload path); encrypted text is
  // re-encrypted into each destination by ChatWindow.
  const visibleMenu = (items: MessageMenuItem[]) =>
    message.encrypted && (message.media || message.localMediaUrl)
      ? items.filter((i) => i.key !== 'forward')
      : items;

  function closeMobileActions() {
    setMobileActionsOpen(false);
  }

  // Single tap opens the action sheet; a quick second tap reacts with a heart instead
  // (the sheet-open is deferred just long enough to catch the double).
  function handleMessageClick() {
    if (isLongPress.current) {
      isLongPress.current = false;
      return;
    }
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      if (!message._id.startsWith('tmp_') && !message.deletedForEveryone) {
        haptic('tap');
        onReact(message, '❤️');
      }
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      setReactionBarOpen(false);
      setFullPickerOpen(false);
      setMenuOpen(false);
      setMobileActionsOpen(true);
    }, 240);
  }

  // ---------- Long‑press handlers for images ----------
  const handleTouchStart = (e: React.TouchEvent) => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setMobileActionsOpen(true);
    }, 500);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // ---------- Render ----------
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

        <div
          className={cn(
            'relative flex min-w-0 max-w-[75%] flex-col gap-1',
            isOwn ? 'items-end' : 'items-start',
          )}
        >
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
                items={visibleMenu(desktopMenuItems)}
                align={isOwn ? 'end' : 'start'}
                anchorRef={menuButtonRef}
              />
            </div>
          </div>

          {/* Swipe-to-reply cue -- fades/scales in as the bubble is dragged */}
          {dx !== 0 && (
            <div
              className="pointer-events-none absolute top-1/2 z-0 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-accent/15 text-accent"
              style={{
                ...(isOwn ? { insetInlineEnd: -34 } : { insetInlineStart: -34 }),
                opacity: progress,
                transform: `translateY(-50%) scale(${0.6 + progress * 0.4})`,
              }}
            >
              <Reply className="h-3.5 w-3.5" />
            </div>
          )}

          {/* Message content */}
          <div
            className="w-full min-w-0 cursor-pointer"
            style={{
              transform: dx ? `translateX(${dx}px)` : undefined,
              transition: dx ? 'none' : 'transform 0.18s ease-out',
            }}
            {...swipeHandlers}
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
            {showName && (
              <p className="mb-0.5 px-1 text-[11px] font-semibold text-accent">
                {message.sender?.name ?? 'مستخدم محذوف'}
              </p>
            )}

            {message.forwarded && (
              <p className="px-1 text-[11px] italic text-muted-foreground">إعادة توجيه</p>
            )}

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
                      (message.replyTo.encrypted
                        ? '🔒 رسالة مشفّرة'
                        : message.replyTo.attachments?.length
                          ? 'مرفق'
                          : '')}
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
                      // Only open lightbox if it was NOT a long-press
                      if (!isLongPress.current && onImageClick) {
                        onImageClick(url, attachment.name ?? 'صورة', message);
                      }
                      isLongPress.current = false;
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
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
                    <VoiceMessagePlayer
                      src={url}
                      isOwn={isOwn}
                      duration={attachment.duration}
                    />
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
                    if (!isLongPress.current) void openDocumentAttachment(url, i, attachment.chunkCount, attachment.name);
                    isLongPress.current = false;
                  }}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchMove}
                  disabled={downloadingIndex === i}
                  className={cn(
                    'flex w-full max-w-full items-center gap-2.5 rounded-2xl px-4 py-3 text-start text-[15px] transition-colors disabled:opacity-70',
                    isOwn
                      ? 'bg-gradient-accent text-white'
                      : 'bg-surface-2/70 text-foreground hover:bg-surface-2',
                  )}
                >
                  {downloadingIndex === i ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                  ) : (
                    <FileText className="h-5 w-5 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{attachment.name ?? 'مرفق'}</span>
                    {attachment.size != null && (
                      <span
                        className={cn(
                          'block text-xs',
                          isOwn ? 'text-white/80' : 'text-muted-foreground',
                        )}
                      >
                        {formatBytes(attachment.size)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}

            {(message.media || message.localMediaUrl) && !message.decryptFailed && (
              <EncryptedMedia message={message} isOwn={isOwn} onImageClick={onImageClick} />
            )}

            {message.decryptFailed ? (
              <div className="flex items-center gap-2 rounded-2xl bg-surface-2/50 px-4 py-2.5 text-[13px] italic text-muted-foreground">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                تعذّر فك تشفير هذه الرسالة على هذا الجهاز
              </div>
            ) : message.media || message.localMediaUrl ? null : decrypting ? (
              <div className="flex items-center gap-2 rounded-2xl bg-surface-2/50 px-4 py-2.5 text-[13px] italic text-muted-foreground">
                <Lock className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                جارٍ فك التشفير…
              </div>
            ) : (
              message.text && (
                <div
                  className={cn(
                    'animate-bubble-in whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
                    isOwn
                      ? 'bg-gradient-accent text-white shadow-soft'
                      : 'bg-surface-2/70 text-foreground',
                    // Tail notch only on the last bubble of a cluster; tighten the inner corner
                    // on continuation bubbles so a cluster reads as one shape.
                    lastInGroup && (isOwn ? 'rounded-bl-md' : 'rounded-br-md'),
                    !firstInGroup && (isOwn ? 'rounded-tl-md' : 'rounded-tr-md'),
                  )}
                >
                  <TaggedText text={message.text} />
                </div>
              )
            )}

            {previewUrl && !attachments.length && (
              <div onClick={(event) => event.stopPropagation()}>
                <LinkPreviewCard url={previewUrl} isOwn={isOwn} />
              </div>
            )}

            {Object.keys(reactionGroups).length > 0 && (
              <div
                className="mt-1 flex flex-wrap gap-1"
                onClick={(event) => event.stopPropagation()}
              >
                {Object.entries(reactionGroups).map(([emoji, count]) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact(message, emoji)}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs shadow-soft transition-transform hover:scale-105',
                      myReactionEmoji === emoji
                        ? 'border-accent bg-accent/10'
                        : 'border-border bg-surface',
                    )}
                  >
                    <span>{emoji}</span>
                    {count > 1 && <span className="text-muted-foreground">{count}</span>}
                  </button>
                ))}
              </div>
            )}

            {(lastInGroup || message.edited || (isOwn && (message.pending || message.failed))) && (
              <span className="mt-1 flex items-center gap-1 px-1 text-xs text-muted-foreground">
                {message.encrypted && <Lock className="h-3 w-3 shrink-0 opacity-70" />}
                {message.edited && <span className="italic">مُعدَّلة ·</span>}
                {timeAgo(message.createdAt)}
                {isOwn && message.failed ? (
                  <button
                    type="button"
                    onClick={() => onRetry?.(message)}
                    className="flex items-center gap-1 font-medium text-red-200 underline"
                  >
                    <RotateCw className="h-3 w-3" /> لم تُرسل — إعادة المحاولة
                  </button>
                ) : isOwn && message.pending ? (
                  <Clock className="h-3 w-3 text-white/60" />
                ) : isOwn ? (
                  <ReadTicks status={status} />
                ) : null}
              </span>
            )}
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
        <div
          className="fixed inset-0 z-[9999] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="إجراءات الرسالة"
        >
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
                  if (message.text) {
                    navigator.clipboard.writeText(message.text);
                  }
                  setMobileActionsOpen(false);
                }}
                className="flex flex-col items-center justify-center gap-1 rounded-xl bg-surface-2 px-2 py-3 text-xs text-foreground hover:bg-surface-2/80"
              >
                <Copy className="h-5 w-5" />
                <span>نسخ</span>
              </button>
            </div>
            <div className="space-y-1">
              {visibleMenu(mobileMenuItems).map((item) => (
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