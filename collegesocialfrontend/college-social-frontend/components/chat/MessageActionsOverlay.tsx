'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  CheckSquare,
  Copy,
  Forward,
  Info,
  Languages,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Reply,
  SmilePlus,
  Star,
  StarOff,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import type { TickStatus } from '@/lib/chat-helpers';
import type { Message } from '@/lib/types';
import { EmojiPicker, QUICK_REACTIONS } from './EmojiPicker';
import { MessageCardPreview } from './MessageBubble';

export type MessageActionKey =
  | 'reply'
  | 'copy'
  | 'forward'
  | 'pin'
  | 'unpin'
  | 'star'
  | 'translate'
  | 'info'
  | 'reactions'
  | 'select'
  | 'edit'
  | 'closePoll'
  | 'deleteForMe'
  | 'deleteForEveryone';

export interface OverlayTarget {
  message: Message;
  rect: DOMRect;
  isOwn: boolean;
}

interface MessageActionsOverlayProps {
  target: OverlayTarget | null;
  onClose: () => void;
  onAction: (key: MessageActionKey, message: Message) => void;
  onReact: (message: Message, emoji: string) => void;
  currentUserId: string;
  isGroup: boolean;
  canPin: boolean;
  pinned: boolean;
  status: TickStatus;
  /** The chat's per-conversation accent vars -- the overlay is portaled outside the chat root. */
  accentStyle?: React.CSSProperties;
}

interface ActionItem {
  key: MessageActionKey | 'delete';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
}

const MARGIN = 12;
const BAR_H = 52;
const GAP = 10;
const MENU_W = 236;
const ROW_H = 44;

function buildItems(message: Message, isOwn: boolean, currentUserId: string, canPin: boolean, pinned: boolean): ActionItem[] {
  const placeholder = message._id.startsWith('tmp_');
  if (placeholder) return [{ key: 'deleteForMe', label: message.failed ? 'حذف الرسالة' : 'إلغاء الإرسال', icon: Trash2, danger: true }];

  const hasText = !!message.text?.trim() || !!message.poll;
  const starred = !!message.starredBy?.includes(currentUserId);
  const items: ActionItem[] = [{ key: 'reply', label: 'رد', icon: Reply }];
  if (hasText) items.push({ key: 'copy', label: 'نسخ', icon: Copy });
  items.push({ key: 'forward', label: 'إعادة توجيه', icon: Forward });
  if (canPin) items.push(pinned ? { key: 'unpin', label: 'إلغاء التثبيت', icon: PinOff } : { key: 'pin', label: 'تثبيت', icon: Pin });
  items.push(starred ? { key: 'star', label: 'إلغاء التمييز', icon: StarOff } : { key: 'star', label: 'تمييز بنجمة', icon: Star });
  if (message.text?.trim()) items.push({ key: 'translate', label: 'ترجمة', icon: Languages });
  if (message.reactions?.length) items.push({ key: 'reactions', label: 'التفاعلات', icon: SmilePlus });
  if (isOwn) items.push({ key: 'info', label: 'معلومات القراءة', icon: Info });
  items.push({ key: 'select', label: 'تحديد', icon: CheckSquare });
  if (isOwn && message.text?.trim() && !message.poll) items.push({ key: 'edit', label: 'تعديل', icon: Pencil });
  if (isOwn && message.poll && !message.poll.closed) items.push({ key: 'closePoll', label: 'إنهاء الاستطلاع', icon: BarChart3 });
  items.push({ key: 'delete', label: 'حذف', icon: Trash2, danger: true });
  return items;
}

// The long-press / right-click "focus" view (iMessage / WhatsApp style): the thread blurs, the
// pressed bubble lifts out at its exact position, a reaction strip floats above it and the action
// menu below -- everything clamped to the viewport. One overlay for touch and desktop alike.
export function MessageActionsOverlay({
  target,
  onClose,
  onAction,
  onReact,
  currentUserId,
  isGroup,
  canPin,
  pinned,
  status,
  accentStyle,
}: MessageActionsOverlayProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {target && (
        <OverlayBody
          key={target.message._id}
          target={target}
          onClose={onClose}
          onAction={onAction}
          onReact={onReact}
          currentUserId={currentUserId}
          isGroup={isGroup}
          canPin={canPin}
          pinned={pinned}
          status={status}
          accentStyle={accentStyle}
        />
      )}
    </AnimatePresence>,
    document.body,
  );
}

function OverlayBody({
  target,
  onClose,
  onAction,
  onReact,
  currentUserId,
  isGroup,
  canPin,
  pinned,
  status,
  accentStyle,
}: Omit<MessageActionsOverlayProps, 'target'> & { target: OverlayTarget }) {
  const { message, rect, isOwn } = target;
  const [view, setView] = useState<'menu' | 'emoji' | 'delete'>('menu');
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const menuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const items = buildItems(message, isOwn, currentUserId, canPin, pinned);
  const placeholder = message._id.startsWith('tmp_');
  const myReaction = (message.reactions ?? []).find(
    (r) => (typeof r.user === 'string' ? r.user : r.user._id) === currentUserId,
  )?.emoji;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (view !== 'menu') setView('menu');
        else onClose();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[data-item]') ?? []);
        if (!buttons.length) return;
        e.preventDefault();
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [onClose, view]);

  useLayoutEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button[data-item]')?.focus({ preventScroll: true });
  }, [view]);

  // --- geometry: keep bar + bubble + menu on screen, preferring the bubble's own position ---
  const vw = viewport.w;
  const vh = viewport.h;
  const rows = view === 'delete' ? (isOwn ? 3 : 2) : view === 'emoji' ? 0 : items.length;
  const showBar = !placeholder;
  const barSpace = showBar ? BAR_H + GAP : 0;
  // The menu gets whatever height is left once the strip and a slice of the bubble are placed --
  // the whole list when it fits, a scrollable one on short screens.
  const naturalMenuH = view === 'emoji' ? 360 : rows * ROW_H + 12;
  const roomForMenu = vh - MARGIN * 2 - barSpace - GAP - Math.min(rect.height, 96);
  const menuH = Math.max(150, Math.min(naturalMenuH, roomForMenu));
  const maxPreviewH = Math.max(72, vh - MARGIN * 2 - barSpace - menuH - GAP);
  const previewH = Math.min(rect.height, maxPreviewH);
  const minTop = MARGIN + barSpace;
  const maxTop = vh - MARGIN - menuH - GAP - previewH;
  const top = Math.max(minTop, Math.min(rect.top, maxTop));
  const previewW = Math.min(rect.width, vw - MARGIN * 2);
  const previewLeft = Math.max(MARGIN, Math.min(rect.left, vw - MARGIN - previewW));
  const alignLeft = (width: number) =>
    isOwn
      ? Math.max(MARGIN, Math.min(previewLeft, vw - MARGIN - width))
      : Math.max(MARGIN, Math.min(previewLeft + previewW - width, vw - MARGIN - width));
  const menuW = view === 'emoji' ? Math.min(320, vw - MARGIN * 2) : Math.min(MENU_W, vw - MARGIN * 2);
  const barW = Math.min(QUICK_REACTIONS.length * 40 + 52, vw - MARGIN * 2);

  function run(key: MessageActionKey) {
    haptic('select');
    onClose();
    onAction(key, message);
  }

  function react(emoji: string) {
    haptic('tap');
    onClose();
    onReact(message, emoji);
  }

  return (
    <div className="fixed inset-0 z-[9998]" style={accentStyle} role="dialog" aria-modal="true" aria-label="إجراءات الرسالة">
      <motion.button
        type="button"
        aria-label="إغلاق"
        className="absolute inset-0 h-full w-full cursor-default bg-overlay/35 backdrop-blur-[10px] dark:bg-black/55"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />

      {/* Reaction strip */}
      {showBar && (
        <motion.div
          className="absolute flex items-center gap-0.5 rounded-full border border-border/70 bg-surface/95 p-1.5 shadow-elev-4 backdrop-blur-xl"
          style={{ top: top - BAR_H - GAP, left: alignLeft(barW), width: barW, height: BAR_H }}
          initial={{ opacity: 0, scale: 0.7, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 8 }}
          transition={{ type: 'spring', stiffness: 520, damping: 32 }}
        >
          {QUICK_REACTIONS.map((emoji, i) => (
            <motion.button
              key={emoji}
              type="button"
              onClick={() => react(emoji)}
              aria-label={`تفاعل ${emoji}`}
              initial={{ opacity: 0, y: 10, scale: 0.5 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.03 * i, type: 'spring', stiffness: 600, damping: 24 }}
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[22px] transition-transform hover:scale-125 active:scale-95',
                myReaction === emoji && 'bg-accent/15 ring-2 ring-accent/40',
              )}
            >
              {emoji}
            </motion.button>
          ))}
          <button
            ref={moreButtonRef}
            type="button"
            onClick={() => setView((v) => (v === 'emoji' ? 'menu' : 'emoji'))}
            aria-label="المزيد من التفاعلات"
            className={cn(
              'ms-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground transition-colors hover:text-accent',
              view === 'emoji' && 'bg-accent text-white hover:text-white',
            )}
          >
            {view === 'emoji' ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
        </motion.div>
      )}

      {/* The lifted bubble */}
      <motion.div
        className="absolute overflow-hidden"
        style={{ top, left: previewLeft, width: previewW, maxHeight: previewH }}
        initial={{ y: rect.top - top, scale: 1 }}
        animate={{ y: 0, scale: 1.02 }}
        exit={{ y: rect.top - top, scale: 1, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      >
        <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
          <div className="drop-shadow-2xl">
            <MessageCardPreview
              message={message}
              isOwn={isOwn}
              isGroup={isGroup}
              status={status}
              currentUserId={currentUserId}
              pinned={pinned}
            />
          </div>
        </div>
        {rect.height > previewH && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/25 to-transparent" />
        )}
      </motion.div>

      {/* Menu / full emoji picker / delete confirmation */}
      <motion.div
        ref={menuRef}
        className="absolute overflow-hidden rounded-2xl border border-border/70 bg-surface/95 shadow-elev-4 backdrop-blur-xl"
        style={{ top: top + previewH + GAP, left: alignLeft(menuW), width: menuW, maxHeight: menuH }}
        initial={{ opacity: 0, scale: 0.9, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -6 }}
        transition={{ type: 'spring', stiffness: 480, damping: 34 }}
      >
        {view === 'emoji' ? (
          <EmojiPicker
            open
            onClose={() => setView('menu')}
            onSelect={react}
            triggerRef={moreButtonRef}
            anchorClassName="w-full p-2.5"
          />
        ) : view === 'delete' ? (
          <div className="py-1.5">
            <p className="px-3.5 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">حذف الرسالة؟</p>
            {isOwn && (
              <button
                type="button"
                data-item
                onClick={() => run('deleteForEveryone')}
                className="flex h-11 w-full items-center gap-3 px-3.5 text-start text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus:bg-danger/10 focus:outline-none"
              >
                <Trash2 className="h-4 w-4" /> حذف لدى الجميع
              </button>
            )}
            <button
              type="button"
              data-item
              onClick={() => run('deleteForMe')}
              className="flex h-11 w-full items-center gap-3 px-3.5 text-start text-sm text-danger transition-colors hover:bg-danger/10 focus:bg-danger/10 focus:outline-none"
            >
              <Trash2 className="h-4 w-4" /> حذف لديّ فقط
            </button>
          </div>
        ) : (
          <div className="max-h-full overflow-y-auto py-1.5 scrollbar-thin" style={{ maxHeight: menuH }}>
            {items.map((item, i) => (
              <motion.button
                key={`${item.key}-${i}`}
                type="button"
                data-item
                initial={{ opacity: 0, x: isOwn ? -6 : 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.015 * i }}
                onClick={() => (item.key === 'delete' ? setView('delete') : run(item.key))}
                className={cn(
                  'flex h-11 w-full items-center gap-3 px-3.5 text-start text-sm transition-colors focus:outline-none',
                  item.danger
                    ? 'text-danger hover:bg-danger/10 focus:bg-danger/10'
                    : 'text-foreground hover:bg-surface-2 focus:bg-surface-2',
                  i > 0 && item.danger && 'border-t border-border/60',
                )}
              >
                <item.icon className={cn('h-[18px] w-[18px] shrink-0', !item.danger && 'text-muted-foreground')} />
                <span className="truncate">{item.label}</span>
              </motion.button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
