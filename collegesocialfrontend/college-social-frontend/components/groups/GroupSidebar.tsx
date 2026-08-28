'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, Copy, Globe, Hash, LogOut, PanelRightClose, Plus, Check, Settings } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ShareButton } from '@/components/shared/ShareButton';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useGroups } from '@/lib/groups-context';
import { useGroupUi } from '@/lib/group-ui-context';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { Channel } from '@/lib/types';
import { GroupSettingsModal } from './GroupSettingsModal';

export function GroupSidebar({ groupId, isChannelSelected }: { groupId: string; isChannelSelected: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { findGroup, refresh } = useGroups();
  const { collapsed, toggleCollapsed, drawerOpen, closeDrawer } = useGroupUi();
  const { showToast } = useToast();
  const group = findGroup(groupId);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<Channel[]>(`/groups/${groupId}/channels`).then((data) => {
      if (cancelled) return;
      setChannels(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  // Collapse the mobile drawer whenever the route changes (a channel was picked).
  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  // Close the mobile drawer on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDrawer();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, closeDrawer]);

  const isOwner = !!user && !!group && group.owner === user._id;

  function copyInviteCode() {
    if (!group?.inviteCode) return;
    navigator.clipboard.writeText(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    const name = newChannelName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    try {
      const channel = await api.post<Channel>(`/groups/${groupId}/channels`, { name });
      setChannels((prev) => [...prev, channel]);
      setNewChannelName('');
      setCreating(false);
      router.push(`/groups/${groupId}/${channel._id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إنشاء القناة', 'error');
    }
  }

  async function handleLeave() {
    if (!confirm('هل تريد مغادرة هذه المجموعة؟')) return;
    setLeaving(true);
    try {
      await api.post(`/groups/${groupId}/leave`);
      await refresh();
      router.push('/groups');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر مغادرة المجموعة', 'error');
      setLeaving(false);
    }
  }

  const body = !group ? (
    <div className="flex h-full items-center justify-center">
      <Spinner className="h-5 w-5" />
    </div>
  ) : (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3.5 py-3.5">
        <div className="flex items-start gap-2.5">
          {group.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-2xl object-cover" />
          ) : (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-accent text-base font-bold text-white">
              {group.name.trim().slice(0, 1) || '؟'}
            </div>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-sm font-semibold text-foreground">{group.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              {group.visibility === 'private' ? (
                <>
                  <Copy className="h-3 w-3" /> خاصة
                </>
              ) : (
                <>
                  <Globe className="h-3 w-3" /> عامة
                </>
              )}
            </p>
          </div>
          <div className="-me-1 flex shrink-0 items-center">
            {isOwner && (
              <button
                onClick={() => setSettingsOpen(true)}
                title="إعدادات المجموعة"
                aria-label="إعدادات المجموعة"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}
            <ShareButton
              className="h-8 w-8"
              heading="مشاركة المجموعة"
              title={`انضم إلى مجموعة "${group.name}" على اكاديميا`}
              text={group.description ?? undefined}
              url={
                group.visibility === 'private' && group.inviteCode
                  ? `/groups/join?code=${encodeURIComponent(group.inviteCode)}`
                  : `/groups/${groupId}`
              }
            />
            <button
              onClick={toggleCollapsed}
              title="طيّ الشريط الجانبي"
              aria-label="طيّ الشريط الجانبي"
              className="hidden h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground md:flex"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        {group.description && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{group.description}</p>
        )}

        {group.visibility === 'private' && group.inviteCode && (
          <button
            onClick={copyInviteCode}
            title="نسخ رمز الدعوة"
            className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-xl2 border border-border/70 bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-surface-2 hover:text-foreground"
          >
            <span className="font-mono tracking-[0.2em]" dir="ltr">
              {group.inviteCode}
            </span>
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}

        <Link
          href={`/groups/${groupId}/study`}
          className={cn(
            'relative mt-2.5 flex items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground',
            pathname.startsWith(`/groups/${groupId}/study`) &&
              'bg-accent/10 font-medium text-accent hover:bg-accent/10 hover:text-accent before:absolute before:inset-y-1.5 before:start-0 before:w-1 before:rounded-full before:bg-accent',
          )}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          مساحة الدراسة
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 scrollbar-thin">
        <div className="mb-1.5 flex items-center justify-between px-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">القنوات</span>
          {isOwner && !creating && (
            <button
              onClick={() => setCreating(true)}
              title="قناة جديدة"
              aria-label="قناة جديدة"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner className="h-5 w-5" />
          </div>
        ) : (
          <div className="space-y-0.5">
            {channels.map((channel) => {
              const href = `/groups/${groupId}/${channel._id}`;
              const active = pathname === href;
              return (
                <Link
                  key={channel._id}
                  href={href}
                  className={cn(
                    'relative flex items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground',
                    active &&
                      'bg-accent/10 font-medium text-accent hover:bg-accent/10 hover:text-accent before:absolute before:inset-y-1.5 before:start-0 before:w-1 before:rounded-full before:bg-accent',
                  )}
                >
                  <Hash className={cn('h-4 w-4 shrink-0', active ? 'text-accent' : 'text-muted-foreground/70')} />
                  <span className="truncate">{channel.name}</span>
                </Link>
              );
            })}

            {isOwner && creating && (
              <form onSubmit={handleCreateChannel} className="px-1 pt-1">
                <Input
                  autoFocus
                  placeholder="اسم القناة…"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  onBlur={() => {
                    if (!newChannelName.trim()) setCreating(false);
                  }}
                  className="h-8 text-xs"
                />
              </form>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLeave}
          loading={leaving}
          className="w-full justify-start text-danger hover:bg-danger/10"
        >
          <LogOut className="h-4 w-4" />
          مغادرة المجموعة
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile drawer scrim */}
      <div
        aria-hidden
        onClick={closeDrawer}
        className={cn(
          'absolute inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ease-out md:hidden',
          drawerOpen && isChannelSelected ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        className={cn(
          'flex shrink-0 flex-col bg-surface',
          // ---------- mobile ----------
          isChannelSelected
            ? // slide-in drawer, docked on the inline-end (right in RTL)
              cn(
                'absolute inset-y-0 right-0 z-50 w-72 max-w-[82vw] border-s border-border shadow-elev-3',
                'transition-transform duration-300 ease-out will-change-transform',
                drawerOpen ? 'translate-x-0' : 'translate-x-full',
              )
            : // full-width channel list (no channel picked yet)
              'w-full border-e border-border',
          // ---------- desktop ----------
          'md:static md:z-auto md:w-64 md:translate-x-0 md:border-e md:border-s-0 md:shadow-none',
          'md:overflow-hidden md:transition-[width,opacity] md:duration-300 md:ease-out',
          collapsed && 'md:pointer-events-none md:w-0 md:border-e-0 md:opacity-0',
        )}
      >
        {/* Fixed-width inner shell so text doesn't reflow while the rail animates */}
        <div className="flex h-full w-72 flex-col md:w-64">{body}</div>
      </aside>

      {group && isOwner && (
        <GroupSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} group={group} />
      )}
    </>
  );
}
