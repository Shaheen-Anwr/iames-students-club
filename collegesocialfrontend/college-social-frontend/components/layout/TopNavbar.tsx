'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionLink';
import { FileText, HelpCircle, LayoutGrid, LogOut, Search, User as UserIcon, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useChatUnread } from '@/lib/chat-unread-context';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge } from '@/components/ui/Badge';
import { LogoMark } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { StreakPointsPill } from '@/components/gamification/StreakPointsPill';
import { NotificationBell } from './NotificationBell';
import { CommandPalette } from './CommandPalette';
import { api } from '@/lib/api';
import { assetUrl, cn } from '@/lib/utils';
import type { SearchResults } from '@/lib/types';
import { getPrimaryNavItems } from './nav-items';

const EMPTY_RESULTS: SearchResults = { posts: [], questions: [], groups: [], users: [] };

export function TopNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const chatUnread = useChatUnread();

  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults(EMPTY_RESULTS);
      return;
    }
    const handle = setTimeout(() => {
      api.get<SearchResults>(`/search?q=${encodeURIComponent(query.trim())}`).then((data) => {
        setResults(data);
        setOpen(true);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const hasResults = results.users.length || results.posts.length || results.questions.length || results.groups.length;

  function goToFullResults() {
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  if (!user) return null;

  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-3 sm:px-4">
      <Link href="/home" className="flex shrink-0 items-center gap-2">
        <LogoMark size="sm" />
        <span className="hidden text-base font-extrabold tracking-tight text-foreground sm:inline">IEAMS Students Club</span>
      </Link>

      {/* Inline search is desktop/tablet only -- on phones it would crowd the bar at ~320-360px,
          so it collapses to the icon button in the right-hand cluster (opens the command palette). */}
      <div className="relative hidden w-full max-w-[220px] sm:block md:max-w-xs" ref={searchRef}>
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={(e) => e.key === 'Enter' && goToFullResults()}
          placeholder="ابحث..."
          className="h-9 w-full rounded-full border border-transparent bg-surface-2 ps-9 pe-3 text-base text-foreground placeholder:text-muted-foreground transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 md:text-sm"
        />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          title="فتح لوحة الأوامر (⌘K)"
          className="absolute end-1.5 top-1/2 hidden h-6 -translate-y-1/2 items-center rounded-md border border-border px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent sm:flex"
        >
          ⌘K
        </button>
        {open && query.trim() && (
          <div className="glass absolute top-11 w-80 max-w-[85vw] rounded-xl p-1.5 shadow-card animate-bubble-in">
            {!hasResults ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">لا توجد نتائج</p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto scrollbar-thin">
                {results.users.length > 0 && (
                  <div>
                    <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">أشخاص</p>
                    {results.users.map((u) => (
                      <Link
                        key={u._id}
                        href={`/profile/${u._id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-lg p-2 text-start hover:bg-surface-2"
                      >
                        <Avatar src={assetUrl(u.photoUrl)} name={u.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{u.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.collegeId}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                {results.posts.length > 0 && (
                  <div>
                    <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">منشورات</p>
                    {results.posts.map((p) => (
                      <Link
                        key={p._id}
                        href="/feed"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 rounded-lg p-2 text-start hover:bg-surface-2"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="truncate text-sm text-foreground">{p.caption}</p>
                      </Link>
                    ))}
                  </div>
                )}
                {results.questions.length > 0 && (
                  <div>
                    <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">أسئلة</p>
                    {results.questions.map((q) => (
                      <Link
                        key={q._id}
                        href={`/study/qa/${q._id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 rounded-lg p-2 text-start hover:bg-surface-2"
                      >
                        <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="truncate text-sm text-foreground">{q.title}</p>
                      </Link>
                    ))}
                  </div>
                )}
                {results.groups.length > 0 && (
                  <div>
                    <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">مجموعات</p>
                    {results.groups.map((g) => (
                      <Link
                        key={g._id}
                        href={`/groups/${g._id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 rounded-lg p-2 text-start hover:bg-surface-2"
                      >
                        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="truncate text-sm text-foreground">{g.name}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={goToFullResults}
              className="mt-1 block w-full rounded-lg px-2 py-2 text-center text-sm font-medium text-accent hover:bg-surface-2"
            >
              شاهد كل النتائج
            </button>
          </div>
        )}
      </div>

      <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
        {getPrimaryNavItems(user.role).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const badge = href === '/chat' ? chatUnread : 0;
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                'group relative flex h-10 w-20 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground',
                active && 'text-accent',
              )}
            >
              {active && (
                <span className="absolute inset-0 rounded-xl bg-accent/10 shadow-[0_0_0_1px_rgb(var(--accent)/0.15)]" />
              )}
              <Icon className={cn('relative h-5.5 w-5.5 transition-transform group-hover:scale-110', active && 'drop-shadow-[0_0_6px_rgb(var(--accent)/0.5)]')} />
              {badge > 0 && (
                <span className="absolute end-4 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
              {active && <span className="absolute inset-x-5 bottom-1 h-0.5 rounded-full bg-gradient-accent" />}
            </Link>
          );
        })}
        {/* Everything outside the primary 4 lives in the ⌘K palette -- it already lists every
            nav destination and is searchable, so "More" just opens it. */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          title="المزيد (⌘K)"
          className="group relative flex h-10 w-20 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <LayoutGrid className="relative h-5.5 w-5.5 transition-transform group-hover:scale-110" />
        </button>
      </nav>

      <div className="ms-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="بحث"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground sm:hidden"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
        <StreakPointsPill className="hidden sm:flex" />
        <ThemeToggle />
        <NotificationBell />
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full p-0.5 pe-2 hover:bg-surface-2"
          >
            <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="sm" />
            <span className="hidden max-w-[8rem] truncate text-sm font-medium text-foreground sm:block">
              {user.name}
            </span>
          </button>
          {menuOpen && (
            <div className="glass absolute top-12 end-0 w-60 rounded-xl p-2 shadow-card animate-bubble-in">
              <div className="flex items-center gap-2 border-b border-border p-2 pb-3">
                <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                  <RoleBadge role={user.role} />
                </div>
              </div>
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-surface-2"
              >
                <UserIcon className="h-4 w-4" />
                الملف الشخصي
              </Link>
              <button
                onClick={() => {
                  logout();
                  router.push('/login');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm text-danger hover:bg-danger/10"
              >
                <LogOut className="h-4 w-4" />
                تسجيل الخروج
              </button>
            </div>
          )}
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
