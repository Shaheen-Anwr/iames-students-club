'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';
import { assetUrl, cn } from '@/lib/utils';
import type { User } from '@/lib/types';

// Same base look as components/ui/Textarea.tsx -- kept here too (rather than reusing that
// component directly) since callers need to merge in their own layout classes the same way, and
// this needs a plain <textarea> element to attach the mention logic to.
const BASE_TEXTAREA_CLASS =
  'w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-base text-foreground placeholder:text-muted-foreground md:text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

// The inline token the backend parses back out (see tag-parser.util.ts) and TaggedText renders as
// a clean "@Name" chip: `@[Display Name](24-hex-user-id)`.
const TOKEN_RE = /@\[([^\]]+)\]\(([0-9a-fA-F]{24})\)/g;

// A resolved mention as it sits in the *visible* text: the substring [start, end) reads "@<name>".
type Mention = { id: string; name: string; start: number; end: number };

// Stored markup ("hi @[Jane Doe](<id>)") -> what the user should actually see while typing
// ("hi @Jane Doe"), plus where each mention lands inside that visible text. The raw user id is
// never shown in the input.
function fromMarkup(markup: string): { display: string; mentions: Mention[] } {
  const mentions: Mention[] = [];
  let display = '';
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  for (const m of markup.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    display += markup.slice(last, at);
    const label = `@${m[1]}`;
    mentions.push({ id: m[2], name: m[1], start: display.length, end: display.length + label.length });
    display += label;
    last = at + m[0].length;
  }
  display += markup.slice(last);
  return { display, mentions };
}

// Inverse of fromMarkup: splice the "@[name](id)" tokens back around the plain text so the value
// handed to the caller (and posted to the backend) stays in the format it expects.
function toMarkup(display: string, mentions: Mention[]): string {
  if (mentions.length === 0) return display;
  const ordered = [...mentions].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const mn of ordered) {
    if (mn.start < cursor) continue; // defensive: skip overlapping ranges
    out += display.slice(cursor, mn.start) + `@[${mn.name}](${mn.id})`;
    cursor = mn.end;
  }
  return out + display.slice(cursor);
}

// After the visible text changes, move each still-valid mention to its new offset. A mention whose
// own "@name" text was edited into is dropped -- it degrades to plain text rather than a token
// pointing at the wrong (or a truncated) id.
function remapMentions(before: string, after: string, mentions: Mention[]): Mention[] {
  if (before === after || mentions.length === 0) return mentions;

  let prefix = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefix < maxPrefix && before[prefix] === after[prefix]) prefix++;

  let suffix = 0;
  const maxSuffix = Math.min(before.length - prefix, after.length - prefix);
  while (suffix < maxSuffix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;

  const changeStart = prefix;
  const changeEnd = before.length - suffix; // exclusive, measured in `before`
  const delta = after.length - before.length;

  const next: Mention[] = [];
  for (const mn of mentions) {
    if (mn.end <= changeStart) next.push(mn);
    else if (mn.start >= changeEnd) next.push({ ...mn, start: mn.start + delta, end: mn.end + delta });
    // otherwise the edit landed inside the mention itself -> drop it
  }
  return next;
}

// Drop-in replacement for a plain <textarea> that adds an "@"-triggered mention picker. The
// textarea shows a friendly "@Name" while composing; the value bubbled to `onChange` is the
// `@[Name](userId)` markup the backend parses (see tag-parser.util.ts) and TaggedText renders as a
// chip. Editing into a mention's own text quietly turns it back into plain text.
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

  const markup = typeof value === 'string' ? value : '';
  const { display, mentions } = useMemo(() => fromMarkup(markup), [markup]);

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

  // Re-assemble the markup and bubble it as a synthetic change, so callers keep receiving the
  // `@[name](id)` format no matter what the textarea currently shows. With no mentions this is
  // just the plain text, byte-for-byte what a native change event would carry.
  function emitMarkup(nextDisplay: string, nextMentions: Mention[]) {
    onChange?.({
      target: { value: toMarkup(nextDisplay, nextMentions) },
    } as unknown as React.ChangeEvent<HTMLTextAreaElement>);
  }

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

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextDisplay = e.target.value;
    emitMarkup(nextDisplay, remapMentions(display, nextDisplay, mentions));
    detectTrigger(e.target);
  }

  function selectSuggestion(user: User) {
    const el = textareaRef.current;
    if (!el || triggerStart === null) return;
    const cursor = el.selectionStart ?? display.length;
    const label = `@${user.name}`;
    const insert = `${label} `;
    const nextDisplay = display.slice(0, triggerStart) + insert + display.slice(cursor);
    const shift = insert.length - (cursor - triggerStart);

    const nextMentions: Mention[] = [];
    for (const mn of mentions) {
      if (mn.end <= triggerStart) nextMentions.push(mn);
      else if (mn.start >= cursor) nextMentions.push({ ...mn, start: mn.start + shift, end: mn.end + shift });
      // a mention overlapping the "@query" being replaced is dropped (shouldn't happen)
    }
    nextMentions.push({ id: user._id, name: user.name, start: triggerStart, end: triggerStart + label.length });

    emitMarkup(nextDisplay, nextMentions);
    setOpen(false);
    setPendingCaret(triggerStart + insert.length);
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
        value={display}
        onChange={handleTextareaChange}
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
