'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  AtSign,
  ChevronDown,
  ChevronUp,
  Copy,
  Forward,
  List,
  MoreVertical,
  Phone,
  PinOff,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown, type DropdownItem } from '@/components/ui/Dropdown';
import { Spinner } from '@/components/ui/Spinner';
import { cldOptimize } from '@/lib/images';
import { formatFullDate, formatListTime, messagePreview, stripMentionTokens } from '@/lib/chat-helpers';
import { assetUrl, cn } from '@/lib/utils';
import type { Message, PinnedMessage, User } from '@/lib/types';

export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-[3px]', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-current" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  );
}

function IconAction({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent active:scale-95',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// Header

export function ChatHeader({
  title,
  avatarSrc,
  online,
  subtitle,
  canCall,
  onOpenInfo,
  onCall,
  onSearch,
  onSummary,
  menuItems,
}: {
  title: string;
  avatarSrc?: string;
  online: boolean;
  subtitle: React.ReactNode;
  canCall: boolean;
  onOpenInfo: () => void;
  onCall: (type: 'audio' | 'video') => void;
  onSearch: () => void;
  onSummary: () => void;
  menuItems: DropdownItem[];
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-1 px-1.5 py-1.5 sm:gap-1.5 sm:px-3 sm:py-2">
      <Link
        href="/chat"
        aria-label="رجوع إلى المحادثات"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground lg:hidden"
      >
        <ArrowRight className="h-5 w-5" />
      </Link>
      <button
        type="button"
        onClick={onOpenInfo}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-1.5 py-1 text-start transition-colors hover:bg-surface-2/70"
      >
        <Avatar src={avatarSrc} name={title} size="md" online={online} />
        <div className="min-w-0 flex-1">
          <p dir="auto" className="truncate text-[15px] font-semibold leading-tight text-foreground">
            {title}
          </p>
          <div className="mt-0.5 h-4 overflow-hidden text-xs leading-4 text-muted-foreground">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={typeof subtitle === 'string' ? subtitle : 'node'}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                className="truncate"
              >
                {subtitle}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </button>

      <div className="hidden shrink-0 items-center sm:flex">
        {canCall && (
          <>
            <IconAction label="مكالمة صوتية" onClick={() => onCall('audio')}>
              <Phone className="h-[18px] w-[18px]" />
            </IconAction>
            <IconAction label="مكالمة فيديو" onClick={() => onCall('video')}>
              <Video className="h-[19px] w-[19px]" />
            </IconAction>
          </>
        )}
        <IconAction label="ملخص ذكي" onClick={onSummary} className="text-accent">
          <Sparkles className="h-[18px] w-[18px]" />
        </IconAction>
        <IconAction label="بحث في المحادثة (Ctrl+F)" onClick={onSearch}>
          <Search className="h-[18px] w-[18px]" />
        </IconAction>
      </div>
      <Dropdown
        menuLabel="خيارات المحادثة"
        trigger={
          <span className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent">
            <MoreVertical className="h-[18px] w-[18px]" />
          </span>
        }
        items={menuItems}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Selection bar (replaces the header while messages are selected)

export function SelectionBar({
  count,
  canCopy,
  canForward,
  allStarred,
  onCopy,
  onStar,
  onForward,
  onDelete,
  onClose,
}: {
  count: number;
  canCopy: boolean;
  canForward: boolean;
  allStarred: boolean;
  onCopy: () => void;
  onStar: () => void;
  onForward: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-3xl items-center gap-1 px-1.5 py-1.5 sm:px-3 sm:py-2"
    >
      <IconAction label="إلغاء التحديد" onClick={onClose}>
        <X className="h-5 w-5" />
      </IconAction>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={count}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground"
        >
          {count === 0 ? 'اختر رسائل' : count === 1 ? 'رسالة محددة' : `${count} رسائل محددة`}
        </motion.span>
      </AnimatePresence>
      <IconAction label="نسخ" onClick={onCopy} className={cn(!canCopy && 'pointer-events-none opacity-40')}>
        <Copy className="h-[18px] w-[18px]" />
      </IconAction>
      <IconAction label={allStarred ? 'إلغاء التمييز' : 'تمييز بنجمة'} onClick={onStar}>
        <Star className={cn('h-[18px] w-[18px]', allStarred && 'fill-current text-amber-500')} />
      </IconAction>
      <IconAction label="إعادة توجيه" onClick={onForward} className={cn(!canForward && 'pointer-events-none opacity-40')}>
        <Forward className="h-[18px] w-[18px]" />
      </IconAction>
      <IconAction label="حذف" onClick={onDelete} className="hover:bg-danger/10 hover:text-danger">
        <Trash2 className="h-[18px] w-[18px]" />
      </IconAction>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------
// Pinned messages banner (Telegram-style: tap to jump, cycles through older pins)

export function PinnedBanner({
  pins,
  index,
  onJump,
  onUnpin,
}: {
  pins: PinnedMessage[];
  index: number;
  onJump: (pin: PinnedMessage) => void;
  onUnpin?: (pin: PinnedMessage) => void;
}) {
  const pin = pins[Math.min(index, pins.length - 1)];
  if (!pin) return null;
  const image = pin.message.attachments?.find((a) => a.type === 'image');
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden border-b border-border/60 bg-surface/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-3 py-1.5 sm:px-4">
        <div className="flex h-9 w-[3px] shrink-0 flex-col gap-[2px]" aria-hidden>
          {pins.map((p, i) => (
            <span key={p.message._id} className={cn('flex-1 rounded-full transition-colors', i === index ? 'bg-accent' : 'bg-accent/25')} />
          ))}
        </div>
        <button type="button" onClick={() => onJump(pin)} className="min-w-0 flex-1 text-start">
          <p className="text-[11px] font-semibold text-accent">
            رسالة مثبّتة{pins.length > 1 ? ` · ${index + 1} من ${pins.length}` : ''}
          </p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={pin.message._id}
              dir="auto"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16 }}
              className="truncate text-sm text-foreground"
            >
              {messagePreview(pin.message) || 'مرفق'}
            </motion.p>
          </AnimatePresence>
        </button>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cldOptimize(assetUrl(image.url) ?? '', { width: 96 })} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
        )}
        {onUnpin && (
          <button
            type="button"
            onClick={() => onUnpin(pin)}
            aria-label="إلغاء التثبيت"
            title="إلغاء التثبيت"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-danger"
          >
            <PinOff className="h-4 w-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------
// In-conversation search: ↑ older / ↓ newer through the hits, optional result list

export function ChatSearchBar({
  query,
  onQueryChange,
  results,
  index,
  loading,
  onStep,
  onPick,
  onClose,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: Message[];
  index: number;
  loading: boolean;
  /** +1 = older, -1 = newer (results are newest-first). */
  onStep: (delta: 1 | -1) => void;
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const [listOpen, setListOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden border-b border-border/60 bg-surface/90 backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-1 px-2 py-1.5 sm:px-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onStep(e.shiftKey ? -1 : 1);
              }
              if (e.key === 'Escape') onClose();
            }}
            placeholder="ابحث في هذه المحادثة"
            className="h-10 w-full rounded-full bg-surface-2/80 pe-3 ps-9 text-sm text-foreground ring-1 ring-border/60 placeholder:text-muted-foreground focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-muted-foreground">
          {loading ? <Spinner className="mx-auto h-3.5 w-3.5" /> : query.trim() ? (results.length ? `${index + 1}/${results.length}` : 'لا نتائج') : ''}
        </span>
        <IconAction label="الأقدم" onClick={() => onStep(1)} className={cn(index >= results.length - 1 && 'pointer-events-none opacity-40')}>
          <ChevronUp className="h-[18px] w-[18px]" />
        </IconAction>
        <IconAction label="الأحدث" onClick={() => onStep(-1)} className={cn(index <= 0 && 'pointer-events-none opacity-40')}>
          <ChevronDown className="h-[18px] w-[18px]" />
        </IconAction>
        <IconAction
          label="قائمة النتائج"
          onClick={() => setListOpen((v) => !v)}
          className={cn(listOpen && 'bg-accent/10 text-accent', !results.length && 'pointer-events-none opacity-40')}
        >
          <List className="h-[18px] w-[18px]" />
        </IconAction>
        <IconAction label="إغلاق البحث" onClick={onClose}>
          <X className="h-[18px] w-[18px]" />
        </IconAction>
      </div>
      <AnimatePresence initial={false}>
        {listOpen && results.length > 0 && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden border-t border-border/60"
          >
            <div className="mx-auto max-h-64 w-full max-w-3xl overflow-y-auto px-2 py-1 scrollbar-thin sm:px-3">
              {results.map((m, i) => (
                <button
                  key={m._id}
                  type="button"
                  onClick={() => {
                    onPick(i);
                    setListOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-surface-2',
                    i === index && 'bg-accent/10',
                  )}
                >
                  <Avatar src={assetUrl(m.sender?.photoUrl)} name={m.sender?.name ?? '؟'} size="xs" className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-foreground">{m.sender?.name ?? 'مستخدم محذوف'}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground" title={formatFullDate(m.createdAt)}>
                        {formatListTime(m.createdAt)}
                      </span>
                    </span>
                    <span dir="auto" className="line-clamp-2 text-[13px] text-muted-foreground">
                      {stripMentionTokens(m.text || m.poll?.question || '')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------
// In-thread typing bubble

export function TypingBubble({ users, label }: { users: User[]; label: string }) {
  const first = users[0];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
      className="mb-3 flex items-end gap-1.5"
      aria-live="polite"
    >
      <div className="relative w-8 shrink-0">
        {first && <Avatar src={assetUrl(first.photoUrl)} name={first.name} size="sm" />}
        {users.length > 1 && (
          <span className="absolute -bottom-1 -start-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white ring-2 ring-surface-2">
            {users.length}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 rounded-[1.15rem] rounded-br-md bg-surface px-3.5 py-2.5 text-muted-foreground shadow-sm ring-1 ring-border/60">
        <TypingDots />
        {users.length > 1 && <span className="text-[11px]">{label}</span>}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------
// Floating jump buttons: newest messages (+ unread count) and unseen @mentions

export function JumpButtons({
  showBottom,
  newCount,
  mentionCount,
  onBottom,
  onMention,
}: {
  showBottom: boolean;
  newCount: number;
  mentionCount: number;
  onBottom: () => void;
  onMention: () => void;
}) {
  const badge = (n: number) => (
    <span className="absolute -top-1.5 left-1/2 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-white shadow-elev-1">
      {n > 99 ? '99+' : n}
    </span>
  );
  return (
    <div className="pointer-events-none absolute bottom-4 end-3 z-20 flex flex-col items-center gap-2.5 sm:end-5">
      <AnimatePresence>
        {mentionCount > 0 && (
          <motion.button
            key="mention"
            type="button"
            initial={{ opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 10 }}
            onClick={onMention}
            aria-label="الانتقال إلى الإشارة"
            className="pointer-events-auto relative flex h-11 w-11 items-center justify-center rounded-full bg-surface/95 text-accent shadow-elev-3 ring-1 ring-border/70 backdrop-blur transition-transform hover:scale-105 active:scale-95"
          >
            <AtSign className="h-5 w-5" />
            {badge(mentionCount)}
          </motion.button>
        )}
        {showBottom && (
          <motion.button
            key="bottom"
            type="button"
            initial={{ opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 10 }}
            onClick={onBottom}
            aria-label={newCount > 0 ? `${newCount} رسائل جديدة` : 'الانتقال إلى الأحدث'}
            className="pointer-events-auto relative flex h-11 w-11 items-center justify-center rounded-full bg-surface/95 text-foreground shadow-elev-3 ring-1 ring-border/70 backdrop-blur transition-transform hover:scale-105 active:scale-95"
          >
            <ChevronDown className="h-5 w-5" />
            {newCount > 0 && badge(newCount)}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// "Catch me up" chip -- offered when you open a conversation with a pile of unread messages

export function CatchUpChip({ count, onSummarize, onDismiss }: { count: number; onSummarize: () => void; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-surface/90 p-1 shadow-elev-3 ring-1 ring-accent/30 backdrop-blur-xl">
        <button
          type="button"
          onClick={onSummarize}
          className="flex items-center gap-1.5 rounded-full bg-gradient-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-elev-1 transition-transform hover:scale-[1.03] active:scale-95"
        >
          <Sparkles className="h-3.5 w-3.5" /> لخّص {count} رسالة غير مقروءة
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="إخفاء"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

export function DropOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-3xl border-2 border-dashed border-accent bg-accent/10 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-2 text-accent">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-glow">
          <Upload className="h-6 w-6" />
        </span>
        <p className="text-sm font-semibold">أفلت الملفات لإرسالها</p>
      </div>
    </motion.div>
  );
}
