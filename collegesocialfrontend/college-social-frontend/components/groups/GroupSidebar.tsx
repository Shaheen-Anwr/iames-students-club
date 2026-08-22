'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Copy, Globe, Hash, LogOut, Plus, Check } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useGroups } from '@/lib/groups-context';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { Channel } from '@/lib/types';

export function GroupSidebar({ groupId }: { groupId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { findGroup, refresh } = useGroups();
  const { showToast } = useToast();
  const group = findGroup(groupId);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [leaving, setLeaving] = useState(false);

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

  if (!group) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4">
        <p className="truncate text-sm font-semibold text-foreground">{group.name}</p>
        {group.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{group.description}</p>}
        {group.visibility === 'private' && group.inviteCode ? (
          <button
            onClick={copyInviteCode}
            className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl2 bg-surface-2/70 px-3.5 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <span className="font-mono tracking-widest">{group.inviteCode}</span>
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <div className="mt-3 flex items-center gap-1.5 rounded-xl2 bg-surface-2/70 px-3.5 py-2.5 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5" />
            مجموعة عامة
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3.5 scrollbar-thin">
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
                    'flex items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground',
                    active && 'bg-accent/10 font-medium text-accent hover:bg-accent/10 hover:text-accent',
                  )}
                >
                  <Hash className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{channel.name}</span>
                </Link>
              );
            })}
          </div>
        )}

        {isOwner &&
          (creating ? (
            <form onSubmit={handleCreateChannel} className="mt-2 px-1">
              <Input
                autoFocus
                placeholder="اسم القناة"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                onBlur={() => {
                  if (!newChannelName.trim()) setCreating(false);
                }}
                className="h-8 text-xs"
              />
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              قناة جديدة
            </button>
          ))}
      </div>

      <div className="border-t border-border p-3.5">
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
}
