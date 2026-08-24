'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Copy,
  FileText,
  Forward,
  Pencil,
  Reply,
  SmilePlus,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { TaggedText } from '@/components/shared/TaggedText';
import { assetUrl, cn, formatBytes, timeAgo } from '@/lib/utils';
import { extractFirstUrl, tickStatus } from '@/lib/chat-helpers';
import type { Conversation, Message } from '@/lib/types';

import { QuickReactionBar } from './EmojiPicker';
import { LinkPreviewCard } from './LinkPreviewCard';
import { MessageMenu, type MessageMenuItem } from './MessageMenu';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  conversation: Conversation;
  currentUserId: string;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message, forEveryone: boolean) => void;
  onReact: (message: Message, emoji: string) => void;
  onForward: (message: Message) => void;
  onToggleStar: (message: Message) => void;
  onJumpToReply: (messageId: string) => void;
}

function ReadTicks({
  status,
}: {
  status: 'sent' | 'delivered' | 'read';
}) {
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
  conversation,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onForward,
  onToggleStar,
  onJumpToReply,
}: MessageBubbleProps) {
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const attachments = message.attachments ?? [];
  const isStarred = message.starredBy?.includes(currentUserId);
  const status = tickStatus(message, conversation, currentUserId);
  const previewUrl = extractFirstUrl(message.text);

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

  if (message.deletedForEveryone) {
    return (
      <div
        className={cn(
          'flex items-end gap-2.5',
          isOwn && 'flex-row-reverse',
        )}
      >
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
    setMenuOpen(false);
    setMobileActionsOpen(true);
  }

  return (
    <>
      <div
        className={cn(
          'group flex items-end gap-2.5',
          isOwn && 'flex-row-reverse',
        )}
      >
        {/* Avatar */}
        <div className="w-8 shrink-0">
          {!isOwn && showAvatar && (
            <Avatar
              src={assetUrl(message.sender?.photoUrl)}
              name={message.sender?.name ?? 'مستخدم محذوف'}
              size="sm"
            />
          )}
        </div>

        {/* Message column */}
        <div
          className={cn(
            'relative flex min-w-0 max-w-[75%] flex-col gap-1',
            isOwn ? 'items-end' : 'items-start',
          )}
        >
          {/* DESKTOP TOOLBAR ONLY */}
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

          {/* MOBILE MESSAGE
              The message itself is a DIV, not a BUTTON. */}
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
            {message.forwarded && (
              <p className="px-1 text-[11px] italic text-muted-foreground">
                إعادة توجيه
              </p>
            )}

            {message.replyTo && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onJumpToReply(message.replyTo!._id);
                }}
                className={cn(
                  'mb-1 w-full max-w-full rounded-xl border-s-4 border-accent bg-surface-2/60 px-3 py-1.5 text-start text-xs',
                  isOwn && 'bg-white/15 text-white',
                )}
              >
                <p
                  className={cn(
                    'font-medium',
                    isOwn ? 'text-white' : 'text-accent',
                  )}
                >
                  {message.replyTo.sender?.name ?? 'مستخدم محذوف'}
                </p>

                <p
                  className={cn(
                    'truncate',
                    isOwn ? 'text-white/80' : 'text-muted-foreground',
                  )}
                >
                  {message.replyTo.deletedForEveryone
                    ? 'تم حذف هذه الرسالة'
                    : message.replyTo.text ||
                      (message.replyTo.attachments?.length ? 'مرفق' : '')}
                </p>
              </button>
            )}

            {attachments.map((attachment, i) => {
              const url = assetUrl(attachment.url) ?? '';

              if (attachment.type === 'image') {
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt={attachment.name ?? 'صورة'}
                    onClick={(event) => event.stopPropagation()}
                    className="animate-bubble-in max-h-64 max-w-full rounded-2xl object-cover"
                  />
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

              if (
                attachment.type === 'voice' ||
                attachment.type === 'audio'
              ) {
                return (
                  <div
                    key={i}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <VoiceMessagePlayer
                      src={url}
                      isOwn={isOwn}
                      duration={attachment.duration}
                    />
                  </div>
                );
              }

              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className={cn(
                    'flex max-w-full items-center gap-2.5 rounded-2xl px-4 py-3 text-[15px] transition-colors',
                    isOwn
                      ? 'bg-gradient-accent text-white'
                      : 'bg-surface-2/70 text-foreground hover:bg-surface-2',
                  )}
                >
                  <FileText className="h-5 w-5 shrink-0" />

                  <span className="min-w-0">
                    <span className="block truncate">
                      {attachment.name ?? 'مرفق'}
                    </span>

                    {attachment.size != null && (
                      <span
                        className={cn(
                          'block text-xs',
                          isOwn
                            ? 'text-white/80'
                            : 'text-muted-foreground',
                        )}
                      >
                        {formatBytes(attachment.size)}
                      </span>
                    )}
                  </span>
                </a>
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
                    {count > 1 && (
                      <span className="text-muted-foreground">
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <span className="mt-1 flex items-center gap-1 px-1 text-xs text-muted-foreground">
              {message.edited && (
                <span className="italic">مُعدَّلة ·</span>
              )}

              {timeAgo(message.createdAt)}

              {isOwn && <ReadTicks status={status} />}
            </span>
          </div>

          {/* Desktop / normal reaction picker */}
          <div
            className="relative"
            onClick={(event) => event.stopPropagation()}
          >
            <QuickReactionBar
              open={reactionBarOpen}
              onClose={() => setReactionBarOpen(false)}
              onSelect={(emoji) => {
                onReact(message, emoji);
                setReactionBarOpen(false);
              }}
              onOpenFullPicker={() => setReactionBarOpen(false)}
              align={isOwn ? 'end' : 'start'}
            />
          </div>
        </div>
      </div>

      {/* ============================================================
          MOBILE ACTION SHEET
          Completely outside the message/scrolling DOM hierarchy.
          ============================================================ */}
      {mobileActionsOpen && (
        <div
          className="fixed inset-0 z-[9999] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="إجراءات الرسالة"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="إغلاق"
            onClick={closeMobileActions}
            className="absolute inset-0 h-full w-full bg-black/40"
          />

          {/* Bottom sheet */}
          <div
            className="absolute inset-x-0 bottom-0 w-full rounded-t-2xl border-t border-border bg-surface p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Handle */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />

            {/* Close */}
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-foreground">
                إجراءات الرسالة
              </p>

              <button
                type="button"
                onClick={closeMobileActions}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick actions */}
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

            {/* Full actions */}
            <div className="space-y-1">
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    item.onClick();
                  }}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-start text-sm',
                    'transition-colors hover:bg-surface-2 active:bg-surface-2',
                    item.danger
                      ? 'text-danger'
                      : 'text-foreground',
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