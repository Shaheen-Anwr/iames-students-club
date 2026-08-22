'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';
import { assetUrl, cn } from '@/lib/utils';
import type { User } from '@/lib/types';

// Same base look as components/ui/Textarea.tsx -- kept here too (rather than reusing that
// component directly) since callers need to merge in their own layout classes the same way, and
// this needs a plain <textarea> element to attach the mention logic to.
const BASE_TEXTAREA_CLASS =
  'w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-base text-foreground placeholder:text-muted-foreground md:text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

// Drop-in replacement for a plain <textarea> that adds an "@"-triggered mention picker. Selecting
// a suggestion inserts `@[Name](userId)` into the text -- the token the backend parses back out
// (see tag-parser.util.ts) and TaggedText renders as a clean "@Name" chip. There's no live
// highlighting while typing (would need a caret-position mirror or contentEditable rewrite); the
// raw token is visible in the textarea until the text is posted and re-rendered via TaggedText.
export function MentionTextarea({
  value,
  onChange,
  onKeyDown,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [triggerStart, setTriggerStart] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pendingCaret, setPendingCaret] = useState<number | null>(null);

  const text = typeof value === 'string' ? value : '';

  useLayoutEffect(() => {
    if (pendingCaret === null) return;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(pendingCaret, pendingCaret);
    }
    setPendingCaret(null);
  }, [pendingCaret, value]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      api
        .get<User[]>(`/users/search?q=${encodeURIComponent(query)}`)
        .then((users) => {
          setSuggestions(users);
          setActiveIndex(0);
        })
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [open, query]);

  function detectTrigger(el: HTMLTextAreaElement) {
    const cursor = el.selectionStart ?? el.value.length;
    const beforeCursor = el.value.slice(0, cursor);
    const match = /(?:^|\s)@(\w*)$/.exec(beforeCursor);
    if (match) {
      setTriggerStart(cursor - match[1].length - 1);
      setQuery(match[1]);
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  function selectSuggestion(user: User) {
    const el = textareaRef.current;
    if (!el || triggerStart === null) return;
    const cursor = el.selectionStart ?? text.length;
    const token = `@[${user.name}](${user._id}) `;
    const nextValue = text.slice(0, triggerStart) + token + text.slice(cursor);

    onChange?.({ target: { value: nextValue } } as unknown as React.ChangeEvent<HTMLTextAreaElement>);
    setOpen(false);
    setPendingCaret(triggerStart + token.length);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        {...rest}
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          detectTrigger(e.target);
        }}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          // Let a suggestion click register before the blur closes the dropdown.
          setTimeout(() => setOpen(false), 100);
          rest.onBlur?.(e);
        }}
        className={cn(BASE_TEXTAREA_CLASS, className)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute start-0 top-full z-30 mt-1 max-h-56 w-64 overflow-y-auto rounded-xl2 border border-border bg-surface py-1 shadow-card scrollbar-thin">
          {suggestions.map((user, i) => (
            <button
              key={user._id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(user)}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-start transition-colors',
                i === activeIndex ? 'bg-surface-2' : 'hover:bg-surface-2',
              )}
            >
              <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.collegeId}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
