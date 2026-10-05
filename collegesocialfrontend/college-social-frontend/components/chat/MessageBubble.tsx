'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Ban,
  Captions,
  Check,
  CheckCheck,
  Clock,
  Forward,
  Languages,
  MoreHorizontal,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Pin,
  Reply,
  RotateCw,
  SmilePlus,
  Sparkles,
  Star,
  Video,
  X,
} from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { fetchAttachmentBlob, ApiError } from '@/lib/api';
import { openBlob } from '@/lib/download';
import { useToast } from '@/lib/toast-context';
import { haptic } from '@/lib/haptics';
import { cldOptimize } from '@/lib/images';
import { useSwipeToReply } from '@/lib/use-swipe-to-reply';
import { useLongPress } from '@/lib/use-long-press';
import { EFFECT_META } from '@/lib/chat-effects';
import {
  bigEmojiCount,
  extractFirstUrl,
  formatClock,
  formatDuration,
  formatFullDate,
  messagePreview,
  senderColor,
  type TickStatus,
} from '@/lib/chat-helpers';
import { aiErrorMessage, chatApi } from '@/lib/chat-api';
import { assetUrl, cn } from '@/lib/utils';
import type { Attachment, Message, ReplyPreview, User } from '@/lib/types';

import { EmojiPicker, QuickReactionBar } from './EmojiPicker';
import { LinkPreviewCard } from './LinkPreviewCard';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { FormattedText } from './FormattedText';
import { PollBubble } from './PollBubble';
import { DocumentAttachment, ImageAlbum, VideoAttachment } from './MessageAttachments';
import { useChatActions, useChatInfo } from './ChatThreadContext';

export interface TranslationState {
  status: 'loading' | 'done' | 'error';
  text?: string;
  target: 'ar' | 'en';
}

export interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isGroup: boolean;
  /** Last bubble of a same-sender cluster: avatar + tail. */
  showAvatar: boolean;
  /** Group chat, first bubble of a cluster: the sender's name inside the bubble. */
  showName: boolean;
  firstInGroup: boolean;
  lastInGroup: boolean;
  /** Number of consecutive deleted-for-everyone messages this compact row stands for. */
  deletedCount?: number;
  status: TickStatus;
  currentUserId: string;
  selectionMode: boolean;
  selected: boolean;
  /** Changes (non-zero) to flash the row -- jump-to-message / search hit. */
  highlightKey?: number;
  searchTerm?: string;
  translation?: TranslationState;
  /** Comma-joined ids of participants whose "read up to here" head sits under this message. */
  readerIds?: string;
  pinned?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Small leaf pieces

function ReadTicks({ status }: { status: TickStatus }) {
  if (status === 'sent') return <Check className="h-3.5 w-3.5 opacity-80" aria-label="أُرسلت" />;
  return (
    <CheckCheck
      className={cn('h-3.5 w-3.5 transition-colors duration-500', status === 'read' ? 'text-sky-300' : 'opacity-80')}
      aria-label={status === 'read' ? 'قُرئت' : 'وصلت'}
    />
  );
}

function Meta({
  message,
  isOwn,
  status,
  pinned,
  starred,
  onMedia = false,
  muted = false,
}: {
  message: Message;
  isOwn: boolean;
  status: TickStatus;
  pinned?: boolean;
  starred?: boolean;
  /** Overlaid on a photo: white text on a dark pill. */
  onMedia?: boolean;
  /** Outside any bubble (big emoji): neutral colours. */
  muted?: boolean;
}) {
  const actions = useChatActions();
  return (
    <span
      className={cn(
        'inline-flex select-none items-center gap-1 whitespace-nowrap text-[11px] leading-none',
        onMedia
          ? 'rounded-full bg-black/50 px-1.5 py-[3px] text-white backdrop-blur-sm'
          : muted
            ? 'text-muted-foreground'
            : isOwn
              ? 'text-white/75'
              : 'text-muted-foreground',
      )}
    >
      {message.edited && <span>مُعدَّلة</span>}
      {pinned && <Pin className="h-3 w-3" aria-label="مثبّتة" />}
      {starred && <Star className="h-3 w-3 fill-current" aria-label="مميّزة بنجمة" />}
      {message.effect &&
        (onMedia ? (
          <Sparkles className="h-3 w-3" />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              actions.replayEffect(message);
            }}
            title={`إعادة تأثير «${EFFECT_META[message.effect].label}»`}
            aria-label="إعادة تشغيل التأثير"
            className="rounded transition-transform hover:scale-125"
          >
            <Sparkles className="h-3 w-3" />
          </button>
        ))}
      <time dateTime={message.createdAt} title={formatFullDate(message.createdAt)}>
        {formatClock(message.createdAt)}
      </time>
      {isOwn && !message.failed && (message.pending ? <Clock className="h-3 w-3" aria-label="جارٍ الإرسال" /> : <ReadTicks status={status} />)}
    </span>
  );
}

function SenderAvatar({ sender }: { sender: Message['sender'] }) {
  const { participantsById } = useChatInfo();
  // Prefer the live participant record (fresh photo) over the snapshot populated on the message.
  const live = sender ? participantsById.get(sender._id) ?? sender : null;
  return <Avatar src={assetUrl(live?.photoUrl)} name={live?.name ?? 'مستخدم محذوف'} size="sm" viewable />;
}

function SelectCircle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute start-1 top-1/2 z-[1] flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center rounded-full border-2 transition-all duration-150',
        checked ? 'scale-100 border-accent bg-accent text-white shadow-elev-1' : 'scale-95 border-muted-foreground/45 bg-surface/80',
      )}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}

function ReplyQuote({ reply, isOwn, onJump }: { reply: ReplyPreview; isOwn: boolean; onJump: () => void }) {
  const preview = reply.deletedForEveryone
    ? 'تم حذف هذه الرسالة'
    : messagePreview({ text: reply.text, attachments: reply.attachments, poll: reply.poll }) || 'مرفق';
  const image = !reply.deletedForEveryone ? reply.attachments?.find((a) => a.type === 'image') : undefined;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onJump();
      }}
      className={cn(
        'mx-1 mt-1 flex min-w-[11rem] max-w-full items-stretch overflow-hidden rounded-xl text-start text-xs transition-colors',
        isOwn ? 'bg-black/15 hover:bg-black/25' : 'bg-accent/[0.07] hover:bg-accent/[0.12]',
      )}
    >
      <span className={cn('w-1 shrink-0', isOwn ? 'bg-white/80' : 'bg-accent')} />
      <span className="min-w-0 flex-1 px-2.5 py-1.5">
        <span className={cn('block truncate font-semibold', isOwn ? 'text-white' : senderColor(reply.sender?._id))}>
          {reply.sender?.name ?? 'مستخدم محذوف'}
        </span>
        <span dir="auto" className={cn('block truncate', isOwn ? 'text-white/85' : 'text-foreground/70')}>
          {preview}
        </span>
      </span>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cldOptimize(assetUrl(image.url) ?? '', { width: 120 })} alt="" className="h-12 w-12 shrink-0 object-cover" />
      )}
    </button>
  );
}

function TranslationBlock({ translation, isOwn, messageId }: { translation: TranslationState; isOwn: boolean; messageId: string }) {
  const actions = useChatActions();
  return (
    <div className={cn('mx-1 mb-1 rounded-xl px-2.5 py-1.5 text-[14px]', isOwn ? 'bg-black/15' : 'bg-surface-2')}>
      <div className={cn('mb-0.5 flex items-center gap-1.5 text-[11px] font-medium', isOwn ? 'text-white/80' : 'text-accent')}>
        <Languages className="h-3 w-3" />
        {translation.status === 'loading'
          ? 'جارٍ الترجمة…'
          : translation.status === 'error'
            ? 'تعذّرت الترجمة'
            : translation.target === 'en'
              ? 'الترجمة · English'
              : 'الترجمة · العربية'}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            actions.hideTranslation(messageId);
          }}
          className="ms-auto rounded-full p-0.5 opacity-70 hover:opacity-100"
          aria-label="إخفاء الترجمة"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {translation.status === 'loading' ? (
        <div className="my-1 h-3 w-3/4 animate-pulse rounded bg-current opacity-20" />
      ) : translation.text ? (
        <p dir="auto" className="whitespace-pre-wrap break-words leading-relaxed">
          {translation.text}
        </p>
      ) : null}
    </div>
  );
}

function ReactionChips({ message, isOwn, currentUserId }: { message: Message; isOwn: boolean; currentUserId: string }) {
  const actions = useChatActions();
  const reactions = message.reactions ?? [];
  if (!reactions.length) return null;

  const groups = new Map<string, { emoji: string; names: string[]; mine: boolean }>();
  for (const r of reactions) {
    const id = typeof r.user === 'string' ? r.user : r.user._id;
    const name = typeof r.user === 'string' ? '' : r.user.name;
    const g = groups.get(r.emoji) ?? { emoji: r.emoji, names: [], mine: false };
    g.names.push(id === currentUserId ? 'أنت' : name);
    if (id === currentUserId) g.mine = true;
    groups.set(r.emoji, g);
  }

  return (
    <div
      className={cn('relative z-[2] -mt-1.5 flex flex-wrap gap-1 px-1.5', isOwn ? 'justify-end' : 'justify-start')}
      onClick={(e) => e.stopPropagation()}
    >
      <AnimatePresence initial={false}>
        {[...groups.values()].map((g) => (
          <motion.button
            key={g.emoji}
            type="button"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 26 }}
            onClick={() => {
              haptic('select');
              actions.react(message, g.emoji);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              actions.showReactions(message);
            }}
            title={g.names.filter(Boolean).join('، ')}
            className={cn(
              'flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs shadow-sm backdrop-blur transition-colors',
              g.mine ? 'border-accent/50 bg-accent/15 text-accent' : 'border-border/70 bg-surface/95 text-foreground hover:bg-surface-2',
            )}
          >
            <span className="text-[13px] leading-none">{g.emoji}</span>
            {g.names.length > 1 && <span className="font-semibold tabular-nums">{g.names.length}</span>}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

// Messenger-style "seen by" heads, aligned to the own-messages edge. When someone reads further
// down, their head pops in under the newer message. (Deliberately no shared-layout glide: the
// thread re-anchors its scroll position when history pages in, which would make projected
// layout animations fly in from the wrong place.)
function ReadHeads({ ids }: { ids: string }) {
  const { participantsById } = useChatInfo();
  const users = ids
    .split(',')
    .map((id) => participantsById.get(id))
    .filter((u): u is User => !!u);
  if (!users.length) return null;
  const shown = users.slice(0, 6);
  const extra = users.length - shown.length;
  return (
    <div className="mt-0.5 flex items-center justify-end gap-0.5 pe-1" aria-label={`قرأها ${users.map((u) => u.name).join('، ')}`}>
      {shown.map((u) => (
        <motion.span
          key={u._id}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 26 }}
          title={`قرأها ${u.name}`}
          className="inline-flex"
        >
          <Avatar src={assetUrl(u.photoUrl)} name={u.name} size="xs" className="h-4 w-4 text-[7px] ring-1 ring-surface" />
        </motion.span>
      ))}
      {extra > 0 && <span className="ms-0.5 text-[10px] font-medium text-muted-foreground">+{extra}</span>}
    </div>
  );
}

// A document too large for one Cloudinary asset was split on upload (chunkCount > 1) -- only the
// first piece lives at `url`, so fetch the backend's reassembled copy instead of opening a silently
// truncated file. Unsplit files open their URL directly (inside the tap gesture). Its own leaf
// component so only it subscribes to the toast context, not every bubble.
function DocumentRow({
  messageId,
  attachment,
  index,
  isOwn,
  swallow,
}: {
  messageId: string;
  attachment: Attachment;
  index: number;
  isOwn: boolean;
  swallow: () => boolean;
}) {
  const { showToast } = useToast();
  const [opening, setOpening] = useState(false);

  async function open() {
    if (swallow()) return;
    const url = assetUrl(attachment.url) ?? '';
    if (!attachment.chunkCount || attachment.chunkCount <= 1) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    setOpening(true);
    try {
      const blob = await fetchAttachmentBlob(`chat/messages/${messageId}/attachments/${index}/download`);
      await openBlob(blob, attachment.name || 'file');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر فتح المرفق.', 'error');
    } finally {
      setOpening(false);
    }
  }

  return <DocumentAttachment attachment={attachment} isOwn={isOwn} loading={opening} onOpen={() => void open()} />;
}

// Voice note -> text (AI, generated once server-side and cached on the attachment).
function VoiceTranscript({ message, index, isOwn }: { message: Message; index: number; isOwn: boolean }) {
  const cached = message.attachments?.[index]?.transcript ?? null;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; text?: string; error?: string }>(
    cached ? { status: 'done', text: cached } : { status: 'idle' },
  );
  if (message.pending || message._id.startsWith('tmp_')) return null;

  async function load() {
    setOpen(true);
    if (state.status === 'done' || state.status === 'loading') return;
    setState({ status: 'loading' });
    try {
      const { text } = await chatApi.ai.transcribe(message._id);
      setState({ status: 'done', text });
    } catch (err) {
      setState({ status: 'error', error: aiErrorMessage(err, 'تعذّر تحويل الرسالة إلى نص.') });
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void load();
        }}
        className={cn(
          'mx-2 mb-1 mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium transition-colors',
          isOwn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-accent/10 text-accent hover:bg-accent/15',
        )}
      >
        <Captions className="h-3.5 w-3.5" /> عرض النص
      </button>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn('mx-1 mb-1 rounded-xl px-2.5 py-1.5 text-[13.5px] leading-relaxed', isOwn ? 'bg-black/15' : 'bg-surface-2')}
    >
      <div className={cn('mb-0.5 flex items-center gap-1.5 text-[11px] font-medium', isOwn ? 'text-white/80' : 'text-accent')}>
        <Captions className="h-3 w-3" /> النص
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="إخفاء النص"
          className="ms-auto rounded-full p-0.5 opacity-70 hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {state.status === 'loading' ? (
        <div className="space-y-1.5 py-1">
          <div className="h-2.5 w-11/12 animate-pulse rounded bg-current opacity-20" />
          <div className="h-2.5 w-2/3 animate-pulse rounded bg-current opacity-20" />
        </div>
      ) : state.status === 'error' ? (
        <p className="text-xs opacity-80">{state.error}</p>
      ) : state.text ? (
        <p dir="auto" className="whitespace-pre-wrap break-words">
          {state.text}
        </p>
      ) : (
        <p className="text-xs opacity-75">لم يُتعرّف على كلام في هذه الرسالة.</p>
      )}
    </div>
  );
}

// A call record in the thread: what happened, how long, and a one-tap call back.
function CallLogCard({
  message,
  isOwn,
  status,
  pinned,
  starred,
}: {
  message: Message;
  isOwn: boolean;
  status: TickStatus;
  pinned?: boolean;
  starred?: boolean;
}) {
  const actions = useChatActions();
  const call = message.call!;
  const video = call.type === 'video';
  const completed = call.outcome === 'completed';
  const missedForMe = !isOwn && (call.outcome === 'no_answer' || call.outcome === 'canceled' || call.outcome === 'busy');
  const kind = video ? 'مكالمة فيديو' : 'مكالمة صوتية';
  const title = isOwn
    ? completed
      ? `${kind} صادرة`
      : call.outcome === 'declined'
        ? 'رُفضت المكالمة'
        : call.outcome === 'busy'
          ? 'كان في مكالمة أخرى'
          : call.outcome === 'failed'
            ? 'تعذّر الاتصال'
            : 'لم يتم الرد'
    : completed
      ? `${kind} واردة`
      : call.outcome === 'declined'
        ? 'رفضت المكالمة'
        : call.outcome === 'failed'
          ? 'مكالمة لم تكتمل'
          : `${kind} فائتة`;
  const subtitle = completed ? formatDuration(call.duration) : missedForMe ? 'اضغط لمعاودة الاتصال' : kind;
  const Icon = completed ? (isOwn ? PhoneOutgoing : PhoneIncoming) : missedForMe ? PhoneMissed : PhoneOff;

  return (
    <div
      className={cn(
        'relative w-fit min-w-[15rem] max-w-full overflow-hidden rounded-[1.15rem] shadow-sm',
        isOwn ? 'bg-gradient-accent text-white' : 'bg-surface text-foreground ring-1 ring-border/60',
      )}
    >
      <div className="flex items-center gap-3 p-2.5 pe-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            isOwn ? 'bg-white/20 text-white' : missedForMe ? 'bg-rose-500/15 text-rose-500' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
          )}
        >
          {video && completed ? <Video className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-semibold', missedForMe && 'text-rose-500')}>{title}</p>
          <p className={cn('text-xs tabular-nums', isOwn ? 'text-white/75' : 'text-muted-foreground')}>{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            actions.call(call.type);
          }}
          aria-label={video ? 'معاودة الاتصال بالفيديو' : 'معاودة الاتصال'}
          title={video ? 'معاودة الاتصال بالفيديو' : 'معاودة الاتصال'}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95',
            isOwn ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-accent/10 text-accent hover:bg-accent/15',
          )}
        >
          {video ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
        </button>
      </div>
      <div className="flex justify-end px-2.5 pb-1.5">
        <Meta message={message} isOwn={isOwn} status={status} pinned={pinned} starred={starred} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The bubble itself (shared by the live row and the long-press overlay's preview)

interface BubbleCardProps {
  message: Message;
  isOwn: boolean;
  showName: boolean;
  firstInGroup: boolean;
  lastInGroup: boolean;
  status: TickStatus;
  currentUserId: string;
  pinned?: boolean;
  searchTerm?: string;
  translation?: TranslationState;
  /** Returns true when the click that just happened was the tail of a long-press (swallow it). */
  guard?: () => boolean;
}

function BubbleCard({
  message,
  isOwn,
  showName,
  firstInGroup,
  lastInGroup,
  status,
  currentUserId,
  pinned,
  searchTerm,
  translation,
  guard,
}: BubbleCardProps) {
  const actions = useChatActions();

  const attachments = message.attachments ?? [];
  const indexed = attachments.map((a, index) => ({ a, index }));
  const images = attachments.filter((a) => a.type === 'image');
  const videos = indexed.filter(({ a }) => a.type === 'video');
  const audios = indexed.filter(({ a }) => a.type === 'voice' || a.type === 'audio');
  const docs = indexed.filter(({ a }) => a.type === 'document');
  const text = message.text ?? '';
  const hasText = !!text.trim();
  const starred = !!message.starredBy?.includes(currentUserId);
  const emojiSize = !message.replyTo && !attachments.length && !message.poll && !message.forwarded ? bigEmojiCount(text) : 0;
  const previewUrl = !attachments.length && !message.poll ? extractFirstUrl(text) : null;
  const mediaOnly =
    !hasText &&
    !message.poll &&
    !message.replyTo &&
    !message.forwarded &&
    !showName &&
    !translation &&
    images.length > 0 &&
    videos.length + audios.length + docs.length === 0;
  const metaInText = hasText && !previewUrl && !translation;
  const swallow = () => !!guard?.();

  const meta = (onMedia = false) => (
    <Meta message={message} isOwn={isOwn} status={status} pinned={pinned} starred={starred} onMedia={onMedia} />
  );

  if (message.call) {
    return <CallLogCard message={message} isOwn={isOwn} status={status} pinned={pinned} starred={starred} />;
  }

  if (emojiSize) {
    return (
      <div className={cn('flex flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
        <span
          className={cn(
            'animate-reaction-pop select-none leading-none drop-shadow-sm',
            emojiSize === 1 ? 'text-[3.4rem]' : emojiSize === 2 ? 'text-[2.7rem]' : 'text-[2.25rem]',
          )}
        >
          {text.trim()}
        </span>
        <span className="rounded-full bg-surface/85 px-2 py-1 shadow-sm backdrop-blur-sm">
          <Meta message={message} isOwn={isOwn} status={status} pinned={pinned} starred={starred} muted />
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative w-fit max-w-full overflow-hidden rounded-[1.15rem] shadow-sm',
        isOwn ? 'bg-gradient-accent text-white' : 'bg-surface text-foreground ring-1 ring-border/60',
        lastInGroup && (isOwn ? 'rounded-bl-md' : 'rounded-br-md'),
        !firstInGroup && (isOwn ? 'rounded-tl-md' : 'rounded-tr-md'),
        message.pending && 'opacity-90',
      )}
    >
      {showName && (
        <p className={cn('truncate px-2.5 pt-1.5 text-[12.5px] font-semibold', senderColor(message.sender?._id))}>
          {message.sender?.name ?? 'مستخدم محذوف'}
        </p>
      )}

      {message.forwarded && (
        <p className={cn('flex items-center gap-1 px-2.5 pt-1.5 text-[11.5px] italic', isOwn ? 'text-white/75' : 'text-muted-foreground')}>
          <Forward className="h-3 w-3" /> تمت إعادة توجيهها
        </p>
      )}

      {message.replyTo && (
        <ReplyQuote
          reply={message.replyTo}
          isOwn={isOwn}
          onJump={() => {
            if (swallow()) return;
            actions.jumpTo(message.replyTo!._id);
          }}
        />
      )}

      {images.length > 0 && (
        <div className="p-1">
          <ImageAlbum
            images={images}
            onOpen={(i) => {
              if (swallow()) return;
              actions.openImage(message, i);
            }}
            overlay={mediaOnly ? meta(true) : undefined}
          />
        </div>
      )}

      {videos.map(({ a, index }) => (
        <div key={`v-${index}`} className="p-1">
          <VideoAttachment attachment={a} />
        </div>
      ))}

      {audios.map(({ a, index }) => (
        <div key={`a-${index}`} className="px-1 pt-1" onClick={(e) => e.stopPropagation()}>
          <VoiceMessagePlayer src={assetUrl(a.url) ?? ''} isOwn={isOwn} duration={a.duration} bare />
          <VoiceTranscript message={message} index={index} isOwn={isOwn} />
        </div>
      ))}

      {docs.map(({ a, index }) => (
        <div key={`d-${index}`} className="p-1">
          <DocumentRow messageId={message._id} attachment={a} index={index} isOwn={isOwn} swallow={swallow} />
        </div>
      ))}

      {message.poll && <PollBubble message={message} isOwn={isOwn} />}

      {hasText && (
        <div
          dir="auto"
          className="relative whitespace-pre-wrap break-words px-2.5 pb-1.5 pt-1 text-[15px] leading-relaxed [overflow-wrap:anywhere]"
        >
          <FormattedText text={text} highlight={searchTerm} inverted={isOwn} />
          {metaInText && (
            <>
              {/* Invisible twin of the timestamp reserves room on the last line (WhatsApp's trick). */}
              <span aria-hidden className="invisible ms-2 inline-block align-baseline">
                {meta()}
              </span>
              <span className="absolute bottom-1.5 end-2.5">{meta()}</span>
            </>
          )}
        </div>
      )}

      {previewUrl && (
        <div className="px-1 pb-0.5" onClick={(e) => e.stopPropagation()}>
          <LinkPreviewCard url={previewUrl} isOwn={isOwn} />
        </div>
      )}

      {translation && <TranslationBlock translation={translation} isOwn={isOwn} messageId={message._id} />}

      {!metaInText && !mediaOnly && <div className="flex justify-end px-2.5 pb-1.5 pt-0.5">{meta()}</div>}
    </div>
  );
}

/** Static copy of a bubble for the long-press overlay (no gestures, nothing clickable). */
export function MessageCardPreview({
  message,
  isOwn,
  isGroup,
  status,
  currentUserId,
  pinned,
}: {
  message: Message;
  isOwn: boolean;
  isGroup: boolean;
  status: TickStatus;
  currentUserId: string;
  pinned?: boolean;
}) {
  return (
    <div className="pointer-events-none">
      <BubbleCard
        message={message}
        isOwn={isOwn}
        showName={isGroup && !isOwn}
        firstInGroup
        lastInGroup
        status={status}
        currentUserId={currentUserId}
        pinned={pinned}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The row: avatar, gestures (long-press, swipe-to-reply, double-tap ❤️), desktop hover toolbar,
// reactions, selection, read heads.

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/95 text-muted-foreground shadow-elev-1 ring-1 ring-border/60 backdrop-blur transition-colors hover:text-accent"
    >
      {children}
    </button>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  isGroup,
  showAvatar,
  showName,
  firstInGroup,
  lastInGroup,
  deletedCount = 1,
  status,
  currentUserId,
  selectionMode,
  selected,
  highlightKey,
  searchTerm,
  translation,
  readerIds,
  pinned,
}: MessageBubbleProps) {
  const actions = useChatActions();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [fullPickerOpen, setFullPickerOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const pointerType = useRef('mouse');
  const isPlaceholder = message._id.startsWith('tmp_');

  const swipeEnabled = !selectionMode && !message.pending && !message.failed && !message.deletedForEveryone;
  const { dx, swipeHandlers, progress } = useSwipeToReply(() => actions.reply(message), swipeEnabled);
  const { handlers: pressHandlers, consumeLongPress } = useLongPress<HTMLDivElement>(
    () => {
      if (selectionMode) actions.toggleSelect(message);
      else if (bubbleRef.current) actions.openActions(message, bubbleRef.current);
    },
    { disabled: isPlaceholder && !message.failed },
  );

  useEffect(
    () => () => {
      if (burstTimer.current) clearTimeout(burstTimer.current);
    },
    [],
  );

  const myReaction = (message.reactions ?? []).find(
    (r) => (typeof r.user === 'string' ? r.user : r.user._id) === currentUserId,
  )?.emoji;

  // A tap does nothing on its own (actions live on long-press / hover / right-click); a quick
  // second tap on touch drops a ❤️ with a burst -- it only ever adds, never toggles it off.
  function handleClick(e: React.MouseEvent) {
    if (consumeLongPress()) return;
    if (selectionMode) {
      e.stopPropagation();
      actions.toggleSelect(message);
      return;
    }
    if (pointerType.current !== 'touch' || isPlaceholder) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      haptic('tap');
      setBurst(now);
      if (burstTimer.current) clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(() => setBurst(0), 700);
      if (myReaction !== '❤️') actions.react(message, '❤️');
    } else {
      lastTap.current = now;
    }
  }

  const rowSelectable = selectionMode
    ? {
        onClick: () => actions.toggleSelect(message),
        role: 'checkbox' as const,
        'aria-checked': selected,
      }
    : {};

  const highlightFlash = highlightKey ? (
    <motion.span
      key={highlightKey}
      aria-hidden
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 1.8, ease: 'easeOut' }}
      className="pointer-events-none absolute -inset-x-2 -inset-y-1 rounded-xl bg-accent/20"
    />
  ) : null;

  if (message.deletedForEveryone) {
    return (
      <div
        {...rowSelectable}
        className={cn(
          'relative flex items-end gap-1.5',
          isOwn && 'flex-row-reverse',
          selectionMode && 'cursor-pointer ps-9',
          selected && 'before:absolute before:-inset-x-2 before:-inset-y-0.5 before:rounded-xl before:bg-accent/10',
        )}
      >
        {highlightFlash}
        {selectionMode && <SelectCircle checked={selected} />}
        {!isOwn && <div className="w-8 shrink-0">{showAvatar && <SenderAvatar sender={message.sender} />}</div>}
        <div className="relative flex items-center gap-2 rounded-2xl border border-dashed border-border bg-surface/75 px-3.5 py-2 text-[13.5px] italic text-muted-foreground backdrop-blur-sm">
          <Ban className="h-3.5 w-3.5 shrink-0" />
          {deletedCount > 1
            ? isOwn
              ? deletedCount === 2
                ? 'قمت بحذف رسالتين'
                : `قمت بحذف ${deletedCount} رسائل`
              : deletedCount === 2
                ? 'تم حذف رسالتين'
                : `تم حذف ${deletedCount} رسائل`
            : isOwn
              ? 'قمت بحذف هذه الرسالة'
              : 'تم حذف هذه الرسالة'}
          <span className="text-[11px] not-italic opacity-80">{formatClock(message.createdAt)}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        {...rowSelectable}
        className={cn(
          'group/msg relative flex items-end gap-1.5',
          isOwn ? 'flex-row-reverse' : 'flex-row',
          selectionMode && 'cursor-pointer ps-9',
          selected && 'before:absolute before:-inset-x-2 before:-inset-y-0.5 before:rounded-xl before:bg-accent/10',
        )}
      >
        {highlightFlash}
        {selectionMode && <SelectCircle checked={selected} />}

        {!isOwn && <div className="w-8 shrink-0">{showAvatar && <SenderAvatar sender={message.sender} />}</div>}

        <div className={cn('relative flex min-w-0 max-w-[84%] flex-col sm:max-w-[72%]', isOwn ? 'items-end' : 'items-start')}>
          {/* Desktop hover toolbar */}
          {!selectionMode && !isPlaceholder && (
            <div
              className={cn(
                'pointer-events-none absolute top-1/2 z-20 hidden -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity duration-150 md:flex',
                'group-hover/msg:pointer-events-auto group-hover/msg:opacity-100',
                (reactionBarOpen || fullPickerOpen) && 'pointer-events-auto opacity-100',
                isOwn ? 'end-full me-1.5' : 'start-full ms-1.5',
              )}
            >
              <ToolbarButton label="تفاعل" onClick={() => setReactionBarOpen((v) => !v)}>
                <SmilePlus className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton label="رد" onClick={() => actions.reply(message)}>
                <Reply className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton
                label="المزيد"
                onClick={() => {
                  if (bubbleRef.current) actions.openActions(message, bubbleRef.current);
                }}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </ToolbarButton>
            </div>
          )}

          {/* Desktop quick reactions / full picker, anchored above the bubble */}
          <div className="relative w-full" onClick={(e) => e.stopPropagation()}>
            <QuickReactionBar
              open={reactionBarOpen}
              onClose={() => setReactionBarOpen(false)}
              onSelect={(emoji) => {
                actions.react(message, emoji);
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
                actions.react(message, emoji);
                setFullPickerOpen(false);
              }}
              anchorClassName={cn(
                'absolute bottom-full z-30 mb-2 w-[19rem] rounded-2xl border border-border bg-surface p-2.5 shadow-elev-3 animate-scale-in',
                isOwn ? 'end-0' : 'start-0',
              )}
            />
          </div>

          {/* Swipe-to-reply cue -- fades/scales in as the bubble is dragged */}
          {dx !== 0 && (
            <div
              className="pointer-events-none absolute top-1/2 z-0 flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent"
              style={{
                ...(isOwn ? { insetInlineEnd: -38 } : { insetInlineStart: -38 }),
                opacity: progress,
                transform: `translateY(-50%) scale(${0.55 + progress * 0.45})`,
              }}
            >
              <Reply className="h-4 w-4" />
            </div>
          )}

          <div
            ref={bubbleRef}
            {...swipeHandlers}
            {...pressHandlers}
            onPointerDownCapture={(e) => {
              pointerType.current = e.pointerType;
            }}
            onClick={handleClick}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && bubbleRef.current) {
                e.preventDefault();
                actions.openActions(message, bubbleRef.current);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="رسالة — اضغط مطولًا لعرض الإجراءات"
            className="relative max-w-full rounded-[1.15rem] outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-accent/50 [@media(pointer:coarse)]:select-none"
            style={{
              transform: dx ? `translateX(${dx}px)` : undefined,
              transition: dx ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)',
            }}
          >
            {selectionMode && (
              <button
                type="button"
                aria-label={selected ? 'إلغاء تحديد الرسالة' : 'تحديد الرسالة'}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.toggleSelect(message);
                }}
                className="absolute inset-0 z-20 cursor-pointer rounded-[1.15rem]"
              />
            )}
            <BubbleCard
              message={message}
              isOwn={isOwn}
              showName={showName && isGroup}
              firstInGroup={firstInGroup}
              lastInGroup={lastInGroup}
              status={status}
              currentUserId={currentUserId}
              pinned={pinned}
              searchTerm={searchTerm}
              translation={translation}
              guard={consumeLongPress}
            />
            <AnimatePresence>
              {burst > 0 && (
                <motion.span
                  key={burst}
                  aria-hidden
                  initial={{ scale: 0.2, opacity: 0 }}
                  animate={{ scale: [0.2, 1.4, 1], opacity: 1 }}
                  exit={{ scale: 1.7, opacity: 0 }}
                  transition={{ duration: 0.42, ease: 'easeOut' }}
                  className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-5xl drop-shadow-lg"
                >
                  ❤️
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <ReactionChips message={message} isOwn={isOwn} currentUserId={currentUserId} />

          {isOwn && message.failed && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                actions.retry(message);
              }}
              className="mt-1 flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/15"
            >
              <RotateCw className="h-3 w-3" /> لم تُرسل — إعادة المحاولة
            </button>
          )}
        </div>
      </div>
      {readerIds && <ReadHeads ids={readerIds} />}
    </>
  );
});
