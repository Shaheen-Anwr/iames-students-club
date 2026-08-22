'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { FileText, HelpCircle, Search, Users, User as UserIcon } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { assetUrl, cn } from '@/lib/utils';
import type { SearchResults } from '@/lib/types';
import { getNavItems } from './nav-items';

const EMPTY_RESULTS: SearchResults = { posts: [], questions: [], groups: [], users: [] };

type Row =
  | { kind: 'nav'; key: string; label: string; href: string; icon: React.ComponentType<{ className?: string }> }
  | { kind: 'user'; key: string; label: string; sublabel: string; href: string; photoUrl?: string | null }
  | { kind: 'post'; key: string; label: string; href: string }
  | { kind: 'question'; key: string; label: string; href: string }
  | { kind: 'group'; key: string; label: string; href: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(EMPTY_RESULTS);
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(EMPTY_RESULTS);
      return;
    }
    const handle = setTimeout(() => {
      api.get<SearchResults>(`/search?q=${encodeURIComponent(query.trim())}`).then(setResults);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const navRows: Row[] = getNavItems(user?.role)
      .filter((item) => !q || item.label.toLowerCase().includes(q))
      .map((item) => ({ kind: 'nav', key: `nav-${item.href}`, label: item.label, href: item.href, icon: item.icon }));

    if (!q) return navRows;

    const userRows: Row[] = results.users.map((u) => ({
      kind: 'user',
      key: `user-${u._id}`,
      label: u.name,
      sublabel: u.collegeId,
      href: `/profile/${u._id}`,
      photoUrl: u.photoUrl,
    }));
    const postRows: Row[] = results.posts.map((p) => ({ kind: 'post', key: `post-${p._id}`, label: p.caption || 'منشور', href: '/feed' }));
    const questionRows: Row[] = results.questions.map((qs) => ({
      kind: 'question',
      key: `q-${qs._id}`,
      label: qs.title,
      href: `/study/qa/${qs._id}`,
    }));
    const groupRows: Row[] = results.groups.map((g) => ({ kind: 'group', key: `group-${g._id}`, label: g.name, href: `/groups/${g._id}` }));

    return [...navRows, ...userRows, ...postRows, ...questionRows, ...groupRows];
  }, [query, results, user?.role]);

  useEffect(() => {
    setActiveIndex(0);
  }, [rows.length]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[activeIndex];
      if (row) go(row.href);
    }
  }

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="glass relative z-10 w-full max-w-lg overflow-hidden rounded-2xl shadow-card animate-slide-up">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ابحث أو انتقل إلى أي مكان..."
            className="h-6 w-full min-w-0 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none md:text-sm"
          />
          <kbd className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin p-1.5">
          {rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">لا توجد نتائج</p>
          ) : (
            rows.map((row, i) => (
              <button
                key={row.key}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => go(row.href)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors',
                  i === activeIndex ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-surface-2',
                )}
              >
                {row.kind === 'nav' && <row.icon className="h-4.5 w-4.5 shrink-0" />}
                {row.kind === 'user' && <Avatar src={assetUrl(row.photoUrl)} name={row.label} size="sm" />}
                {row.kind === 'post' && <FileText className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />}
                {row.kind === 'question' && <HelpCircle className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />}
                {row.kind === 'group' && <Users className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.label}</p>
                  {row.kind === 'user' && <p className="truncate text-xs text-muted-foreground">{row.sublabel}</p>}
                </div>
              </button>
            ))
          )}
          {!query.trim() && (
            <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] text-muted-foreground">
              <UserIcon className="h-3 w-3" />
              اكتب للبحث عن أشخاص، منشورات، أسئلة، أو مجموعات
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
