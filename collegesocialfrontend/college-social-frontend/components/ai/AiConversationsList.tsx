'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { isToday, isYesterday } from 'date-fns';
import { Bot, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { api, ApiError } from '@/lib/api';
import { useAi } from '@/lib/ai-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { cn, timeAgo } from '@/lib/utils';
import type { AiConversation } from '@/lib/types';
import { AiAuroraBackground } from './AiAuroraBackground';
import { AiUsageMeter } from './AiUsageMeter';
import { AiPersonalizeCard, assistantDisplayName } from './AiPersonalizeCard';

const GROUP_LABELS = { today: 'اليوم', yesterday: 'أمس', earlier: 'أقدم' } as const;
type GroupKey = keyof typeof GROUP_LABELS;

function groupConversations(conversations: AiConversation[]): [GroupKey, AiConversation[]][] {
  const groups: Record<GroupKey, AiConversation[]> = { today: [], yesterday: [], earlier: [] };
  for (const conversation of conversations) {
    const date = new Date(conversation.updatedAt ?? conversation.createdAt);
    const key: GroupKey = isToday(date) ? 'today' : isYesterday(date) ? 'yesterday' : 'earlier';
    groups[key].push(conversation);
  }
  return (Object.keys(GROUP_LABELS) as GroupKey[])
    .map((key) => [key, groups[key]] as [GroupKey, AiConversation[]])
    .filter(([, items]) => items.length > 0);
}

export function AiConversationsList() {
  const { conversations, loading, removeConversation, usage } = useAi();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [personalizeOpen, setPersonalizeOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.title || 'محادثة جديدة').toLowerCase().includes(q));
  }, [conversations, query]);

  const grouped = useMemo(() => groupConversations(filtered), [filtered]);

  async function handleDelete(e: React.MouseEvent, conversation: AiConversation) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('هل تريد حذف هذه المحادثة؟')) return;
    setDeletingId(conversation._id);
    try {
      await api.delete(`/ai/conversations/${conversation._id}`);
      removeConversation(conversation._id);
      if (pathname === `/ai/${conversation._id}`) router.push('/ai');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف المحادثة', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <AiAuroraBackground />
      <div className="h-[2px] w-full shrink-0 bg-gradient-accent" />
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-lg font-semibold text-foreground">{assistantDisplayName(user)}</h1>
          {usage && <AiUsageMeter used={usage.used} limit={usage.limit} showLabel />}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setPersonalizeOpen(true)}
            title="تخصيص المساعد"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <Link
            href="/ai"
            title="محادثة جديدة"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-accent text-white shadow-soft transition-transform hover:scale-110 active:scale-95"
          >
            <Plus className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {conversations.length > 0 && (
        <div className="border-b border-border px-3 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث في المحادثات..."
              className="w-full rounded-lg border border-transparent bg-surface-2/70 py-1.5 ps-8 pe-7 text-sm transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-5 w-5" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Bot className="h-6 w-6" />
            </div>
            <p className="text-sm">لا توجد محادثات بعد. ابدأ بسؤال المساعد الذكي.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-muted-foreground">
            <Search className="h-6 w-6" />
            <p className="text-sm">لا توجد نتائج مطابقة</p>
          </div>
        ) : (
          <div className="space-y-3 p-2">
            {grouped.map(([key, items]) => (
              <div key={key}>
                <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {GROUP_LABELS[key]}
                </p>
                <div className="space-y-1">
                  {items.map((conversation) => {
                    const href = `/ai/${conversation._id}`;
                    const active = pathname === href;
                    return (
                      <Link
                        key={conversation._id}
                        href={href}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 transition-all hover:bg-surface-2',
                          active && 'border-accent/20 bg-accent/10 backdrop-blur-sm hover:bg-accent/10',
                        )}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{conversation.title || 'محادثة جديدة'}</p>
                          <p className="text-xs text-muted-foreground">{timeAgo(conversation.updatedAt ?? conversation.createdAt)}</p>
                        </div>
                        <button
                          onClick={(e) => handleDelete(e, conversation)}
                          disabled={deletingId === conversation._id}
                          className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-transform hover:scale-110 hover:bg-danger/10 hover:text-danger active:scale-95 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={personalizeOpen} onClose={() => setPersonalizeOpen(false)} title="تخصيص المساعد" className="max-w-sm">
        <AiPersonalizeCard bare onDone={() => setPersonalizeOpen(false)} />
      </Modal>
    </div>
  );
}
