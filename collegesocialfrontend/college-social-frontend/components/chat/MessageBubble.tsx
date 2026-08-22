'use client';

import { useState } from 'react';
import { Check, CheckCheck, Copy, FileText, Forward, Pencil, Reply, SmilePlus, Star, Trash2 } from 'lucide-react';
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

function ReadTicks({ status }: { status: 'sent' | 'delivered' | 'read' }) {
  if (status === 'sent') return <Check className="h-3.5 w-3.5 text-white/70" />;
  return <CheckCheck className={cn('h-3.5 w-3.5', status === 'read' ? 'text-sky-300' : 'text-white/70')} />;
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

  const attachments = message.attachments ?? [];
  const isStarred = message.starredBy?.includes(currentUserId);
  const status = tickStatus(message, conversation, currentUserId);
  const previewUrl = extractFirstUrl(message.text);

  const reactionGroups = (message.reactions ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});
  const myReactionEmoji = (message.reactions ?? []).find(
    (r) => (typeof r.user === 'string' ? r.user : r.user._id) === currentUserId,
  )?.emoji;

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
    { key: 'reply', label: 'رد', icon: <Reply className="h-4 w-4" />, onClick: () => onReply(message) },
    { key: 'forward', label: 'إعادة توجيه', icon: <Forward className="h-4 w-4" />, onClick: () => onForward(message) },
    {
      key: 'star',
      label: isStarred ? 'إلغاء التمييز' : 'تمييز بنجمة',
      icon: <Star className="h-4 w-4" />,
      onClick: () => onToggleStar(message),
    },
    {
      key: 'copy',
      label: 'نسخ النص',
      icon: <Copy className="h-4 w-4" />,
      onClick: () => message.text && navigator.clipboard.writeText(message.text),
    },
  ];
  if (isOwn && message.text) {
    menuItems.push({ key: 'edit', label: 'تعديل', icon: <Pencil className="h-4 w-4" />, onClick: () => onEdit(message) });
  }
  if (isOwn) {
    menuItems.push({
      key: 'delete-everyone',
      label: 'حذف لدى الجميع',
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      onClick: () => onDelete(message, true),
    });
  }
  menuItems.push({
    key: 'delete-me',
    label: 'حذف لديّ',
    icon: <Trash2 className="h-4 w-4" />,
    danger: true,
    onClick: () => onDelete(message, false),
  });

  return (
    <div className={cn('group flex items-end gap-2.5', isOwn && 'flex-row-reverse')}>
      <div className="w-8 shrink-0">
        {!isOwn && showAvatar && (
          <Avatar src={assetUrl(message.sender?.photoUrl)} name={message.sender?.name ?? 'مستخدم محذوف'} size="sm" />
        )}
      </div>
      <div className={cn('relative flex max-w-[75%] flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
        {/* Hover toolbar */}
        <div
          className={cn(
            'pointer-events-none absolute top-0 z-20 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100',
            isOwn ? 'end-full me-1' : 'start-full ms-1',
          )}
        >
          <button
            onClick={() => setReactionBarOpen((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted-foreground shadow-soft hover:text-accent"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onReply(message)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted-foreground shadow-soft hover:text-accent"
          >
            <Reply className="h-3.5 w-3.5" />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted-foreground shadow-soft hover:text-accent"
            >
              ⋮
            </button>
            <MessageMenu open={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} align={isOwn ? 'end' : 'start'} />
          </div>
        </div>
        <div className="relative">
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

        {message.forwarded && <p className="px-1 text-[11px] italic text-muted-foreground">إعادة توجيه</p>}

        {message.replyTo && (
          <button
            onClick={() => onJumpToReply(message.replyTo!._id)}
            className={cn(
              'w-full max-w-full rounded-xl border-s-4 border-accent bg-surface-2/60 px-3 py-1.5 text-start text-xs',
              isOwn && 'bg-white/15 text-white',
            )}
          >
            <p className={cn('font-medium', isOwn ? 'text-white' : 'text-accent')}>
              {message.replyTo.sender?.name ?? 'مستخدم محذوف'}
            </p>
            <p className={cn('truncate', isOwn ? 'text-white/80' : 'text-muted-foreground')}>
              {message.replyTo.deletedForEveryone
                ? 'تم حذف هذه الرسالة'
                : message.replyTo.text || (message.replyTo.attachments?.length ? 'مرفق' : '')}
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
                className="animate-bubble-in max-h-64 w-auto rounded-2xl object-cover"
              />
            );
          }
          if (attachment.type === 'video') {
            return (
              <video key={i} src={url} controls className="animate-bubble-in max-h-64 w-auto rounded-2xl" />
            );
          }
          if (attachment.type === 'voice' || attachment.type === 'audio') {
            return <VoiceMessagePlayer key={i} src={url} isOwn={isOwn} duration={attachment.duration} />;
          }
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[15px] transition-colors',
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
            </a>
          );
        })}

        {message.text && (
          <div
            className={cn(
              'animate-bubble-in whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
              isOwn ? 'rounded-bl-md bg-gradient-accent text-white shadow-soft' : 'rounded-br-md bg-surface-2/70 text-foreground',
            )}
          >
            <TaggedText text={message.text} />
          </div>
        )}

        {previewUrl && !attachments.length && <LinkPreviewCard url={previewUrl} isOwn={isOwn} />}

        {Object.keys(reactionGroups).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(reactionGroups).map(([emoji, count]) => (
              <button
                key={emoji}
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

        <span className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
          {message.edited && <span className="italic">مُعدَّلة ·</span>}
          {timeAgo(message.createdAt)}
          {isOwn && <ReadTicks status={status} />}
        </span>
      </div>
    </div>
  );
}
