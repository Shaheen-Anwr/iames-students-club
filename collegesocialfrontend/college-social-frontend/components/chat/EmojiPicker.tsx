'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const EMOJI_GROUPS: { key: string; label: string; icon: string; emojis: string[] }[] = [
  {
    key: 'smileys',
    label: 'الوجوه والمشاعر',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥲', '🥹', '☺️', '😊', '😇', '🙂', '🙃', '😉',
      '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎',
      '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺',
      '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
      '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴',
      '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👻',
      '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
    ],
  },
  {
    key: 'gestures',
    label: 'الإيماءات والأشخاص',
    icon: '👍',
    emojis: [
      '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️',
      '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '👏', '🙌', '🫶', '👐', '🤲', '🙏', '✍️', '💅', '🤳', '💪',
      '🦾', '🦿', '🦵', '🦶', '👂', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '🫦',
      '👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '🧔', '👱', '👴', '👵', '🙍', '🙎', '🙅', '🙆', '💁',
      '🙋', '🧏', '🙇', '🤦', '🤷', '🧑‍🎓', '🧑‍🏫', '🧑‍💻', '🧑‍🚀', '🕺', '💃', '👯', '🧗', '🏃', '🚶', '🧘',
    ],
  },
  {
    key: 'hearts',
    label: 'القلوب والرموز',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
      '💘', '💝', '💟', '♥️', '💌', '💋', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💬', '💭', '🗯️',
      '✨', '🌟', '⭐', '🌠', '⚡', '🔥', '🌈', '☀️', '⛅', '☁️', '❄️', '☃️', '💧', '🌊', '✅', '❌',
      '⭕', '❗', '❓', '‼️', '⁉️', '💤', '♻️', '🔱', '⚜️', '🔰', '✔️', '☑️', '➕', '➖', '➗', '✖️',
    ],
  },
  {
    key: 'animals',
    label: 'الحيوانات والطبيعة',
    icon: '🐶',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈',
      '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛',
      '🦋', '🐌', '🐞', '🐜', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🐙', '🦑', '🦐', '🦀', '🐡',
      '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪',
      '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🐐', '🦌', '🐕', '🐩', '🐈', '🐓',
      '🦃', '🕊️', '🐇', '🐁', '🐀', '🐿️', '🦔', '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀',
      '🍁', '🍂', '🍃', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌚', '🌙', '🌛', '🌜',
    ],
  },
  {
    key: 'food',
    label: 'الطعام والشراب',
    icon: '🍕',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥',
      '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠',
      '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭',
      '🍔', '🍟', '🍕', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🍝', '🍜', '🍲', '🍛',
      '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧',
      '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '☕',
      '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊',
    ],
  },
  {
    key: 'activities',
    label: 'الأنشطة والرياضة',
    icon: '⚽',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍',
      '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌',
      '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤺', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣',
      '🧗', '🚴', '🚵', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️', '🎪', '🤹', '🎭',
      '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳',
      '🎮', '🎰', '🧩', '🎉', '🎊', '🎈', '🎁', '🎀', '🎇', '🎆', '🧨', '✨',
    ],
  },
  {
    key: 'objects',
    label: 'الدراسة والأشياء',
    icon: '📚',
    emojis: [
      '📚', '📖', '📕', '📗', '📘', '📙', '📔', '📒', '📓', '📝', '✏️', '🖊️', '🖋️', '🖌️', '🖍️', '📏',
      '📐', '📌', '📍', '📎', '🖇️', '✂️', '🗂️', '📁', '📂', '🗃️', '🗄️', '📅', '📆', '🗓️', '📇', '📋',
      '📊', '📈', '📉', '🧮', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '💾', '💿', '📀', '📱', '📲', '☎️', '📞',
      '📟', '📠', '🔋', '🔌', '💡', '🔦', '🕯️', '🧯', '🔍', '🔎', '🔬', '🔭', '📡', '⏰', '⏱️', '⏲️',
      '🕰️', '⌛', '⏳', '🔔', '🔕', '📢', '📣', '📯', '💰', '💵', '💳', '💎', '⚖️', '🧰', '🔧', '🔨',
      '⚙️', '🧲', '🔗', '⛓️', '🗝️', '🔑', '🔒', '🔓', '🚀', '✈️', '🛸', '🛰️', '🌍', '🗺️', '🧭', '⛺',
    ],
  },
  {
    key: 'symbols',
    label: 'رموز',
    icon: '🔣',
    emojis: [
      '💗', '💘', '💝', '🆒', '🆕', '🆗', '🆙', '🆓', '🔝', '🔜', '✅', '❎', '✳️', '❇️', '⚠️', '🚸',
      '🔰', '♻️', '✴️', '🈳', '🈵', '💠', '🔘', '🔷', '🔶', '🔵', '🟢', '🟡', '🟠', '🔴', '🟣', '⚫',
      '⚪', '🟤', '🔺', '🔻', '⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️', '↕️', '↔️', '🔄', '🔃',
      '🎵', '🎶', '➰', '➿', '〽️', '™️', '©️', '®️', '💲', '💱', '❓', '❔', '❕', '❗', '‼️', '⁉️',
      '🔅', '🔆', '〰️', '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️', '⏩', '⏪', '🔀', '🔁', '🔂',
    ],
  },
];

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];

interface EmojiPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  anchorClassName?: string;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function EmojiPicker({ open, onClose, onSelect, anchorClassName, triggerRef }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [query, setQuery] = useState('');

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

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    // Emoji carry no searchable text; treat the query as a filter over category names so a user can
    // jump to "food" / "قلوب" etc., and also match a literal emoji if they paste one in.
    const lower = q.toLowerCase();
    const matchingGroups = EMOJI_GROUPS.filter(
      (g) => g.label.includes(q) || g.key.includes(lower),
    );
    const literal = EMOJI_GROUPS.flatMap((g) => g.emojis).filter((e) => e === q);
    const fromGroups = matchingGroups.flatMap((g) => g.emojis);
    return Array.from(new Set([...literal, ...fromGroups]));
  }, [query]);

  if (!open) return null;

  function scrollToSection(key: string) {
    const el = sectionRefs.current[key];
    const container = scrollRef.current;
    if (el && container) {
      container.scrollTo({ top: el.offsetTop - container.offsetTop - 4, behavior: 'smooth' });
    }
  }

  return (
    <div
      ref={ref}
      className={
        anchorClassName ??
        'absolute bottom-full end-0 z-30 mb-2 w-[19rem] rounded-2xl border border-border bg-surface p-2.5 shadow-card animate-slide-up'
      }
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث عن فئة تفاعلات…"
        className="mb-2 w-full rounded-lg border border-border bg-surface-2/60 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
      />

      {!filtered && (
        <div className="mb-2 flex items-center justify-between gap-0.5 border-b border-border pb-2">
          {EMOJI_GROUPS.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => scrollToSection(group.key)}
              title={group.label}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-base transition-transform hover:scale-110 hover:bg-surface-2"
            >
              {group.icon}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="max-h-64 space-y-3 overflow-y-auto scrollbar-thin">
        {filtered ? (
          filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">لا توجد نتائج</p>
          ) : (
            <div className="grid grid-cols-8 gap-1">
              {filtered.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  type="button"
                  onClick={() => onSelect(emoji)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-transform hover:scale-125 hover:bg-surface-2"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )
        ) : (
          EMOJI_GROUPS.map((group) => (
            <div
              key={group.key}
              ref={(el) => {
                sectionRefs.current[group.key] = el;
              }}
            >
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
              <div className="grid grid-cols-8 gap-1">
                {group.emojis.map((emoji, i) => (
                  <button
                    key={`${emoji}-${i}`}
                    type="button"
                    onClick={() => onSelect(emoji)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-transform hover:scale-125 hover:bg-surface-2"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
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
        aria-label="المزيد من التفاعلات"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-sm text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-accent"
      >
        +
      </button>
    </div>
  );
}
