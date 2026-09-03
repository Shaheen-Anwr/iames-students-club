'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, NotebookPen } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// Private per-student note on a lecture. Collapsed by default; expands to a textarea that
// autosaves 800ms after typing stops. An empty note is deleted server-side.
export function LectureNote({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState('');
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    api
      .get<{ body: string }>(`/lecture-notes/${postId}`)
      .then((r) => setBody(r.body))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [open, loaded, postId]);

  function onChange(v: string) {
    setBody(v);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api
        .put(`/lecture-notes/${postId}`, { body: v })
        .then(() => setSaved(true))
        .catch(() => undefined);
    }, 800);
  }

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const hasNote = loaded && body.trim().length > 0;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors',
          open || hasNote ? 'text-accent' : 'text-muted-foreground hover:bg-surface-2',
        )}
      >
        <NotebookPen className="h-3.5 w-3.5" />
        {hasNote && !open ? 'ملاحظتي محفوظة' : 'ملاحظاتي'}
        {saved && open && <Check className="h-3 w-3 text-success" />}
      </button>

      {open && (
        <textarea
          value={body}
          onChange={(e) => onChange(e.target.value)}
          placeholder={loaded ? 'اكتب ملاحظاتك على هذه المحاضرة… (تُحفظ تلقائيًا، ولا يراها أحد غيرك)' : 'جارٍ التحميل…'}
          disabled={!loaded}
          rows={4}
          className="mt-1.5 w-full resize-y rounded-xl bg-surface-2/60 px-3 py-2 text-sm text-foreground outline-none ring-1 ring-inset ring-transparent placeholder:text-muted-foreground focus:bg-surface focus:ring-accent/30 disabled:opacity-60"
        />
      )}
    </div>
  );
}
