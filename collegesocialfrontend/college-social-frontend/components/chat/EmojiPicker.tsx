'use client';

import { useEffect, useRef } from 'react';

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'وجوه',
    emojis: ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😜', '🤔', '😎', '🥳', '😢', '😭', '😡', '😱', '🤗', '🙄', '😴', '🤒', '😇'],
  },
  {
    label: 'إيماءات وقلوب',
    emojis: ['👍', '👎', '👏', '🙏', '💪', '🤝', '✌️', '🤞', '👌', '🔥', '💯', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '✨'],
  },
  {
    label: 'أشياء',
    emojis: ['🎉', '🎂', '📚', '📝', '💻', '📷', '🎵', '⏰', '☕', '🍕', '⚽', '🏆', '✅', '❌', '⭐', '💡', '📌', '📎', '🔔', '🚀'],
  },
];

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface EmojiPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  anchorClassName?: string;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function EmojiPicker({ open, onClose, onSelect, anchorClassName, triggerRef }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || triggerRef?.current?.contains(target)) {
        return;
      }
      onClose();
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={anchorClassName ?? 'absolute bottom-full end-0 z-30 mb-2 w-72 rounded-2xl border border-border bg-surface p-3 shadow-card animate-slide-up'}
    >
      <div className="max-h-64 space-y-3 overflow-y-auto scrollbar-thin">
        {EMOJI_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
            <div className="grid grid-cols-8 gap-1">
              {group.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onSelect(emoji)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-transform hover:scale-125 hover:bg-surface-2"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface QuickReactionBarProps {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  onOpenFullPicker: () => void;
  align?: 'start' | 'end';
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function QuickReactionBar({ open, onClose, onSelect, onOpenFullPicker, align = 'end', triggerRef }: QuickReactionBarProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || triggerRef?.current?.contains(target)) {
        return;
      }
      onClose();
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={`absolute bottom-full z-30 mb-2 flex items-center gap-0.5 rounded-full border border-border bg-surface px-1.5 py-1 shadow-card animate-slide-up ${align === 'end' ? 'end-0' : 'start-0'}`}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 hover:bg-surface-2"
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        onClick={onOpenFullPicker}
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2"
      >
        +
      </button>
    </div>
  );
}