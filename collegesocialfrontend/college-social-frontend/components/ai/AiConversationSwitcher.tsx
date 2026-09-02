'use client';

import { useEffect, useState } from 'react';
import { Bot, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useAi } from '@/lib/ai-context';
import { useToast } from '@/lib/toast-context';
import { cn, timeAgo } from '@/lib/utils';

/**
 * Compact conversation history for the floating AI bubble: pick a past chat to resume, start a
 * fresh one, or delete any of them. The full-page equivalent is AiConversationsList (route /ai);
 * this trims it to what fits the 22rem popover. Both hit the same context + DELETE endpoint.
 */
export function AiConversationSwitcher({
  activeId,
  onSelect,
  onNew,
  onDeleteActive,
}: {
  /** The conversation currently loaded in the chat view -- highlighted here. */
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** Fired when the row that was active gets deleted, so the bubble can drop back to a fresh chat. */
  onDeleteActive: () => void;
}) {
  const { conversations, loading, refresh, removeConversation } = useAi();
  const { showToast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Re-pull on open so titles / ordering reflect messages sent since the list was last loaded.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('هل تريد حذف هذه المحادثة نهائيًا؟')) return;
    setDeletingId(id);
    try {
      await api.delete(`/ai/conversations/${id}`);
      removeConversation(id);
      if (id === activeId) onDeleteActive();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف المحادثة', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <button
        onClick={onNew}
        className="mx-3 mt-3 flex shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:bg-surface-2 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        محادثة جديدة
      </button>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2 pb-2">
        {loading && conversations.length === 0 ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-5 w-5" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">لا توجد محادثات محفوظة بعد.</p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => {
              const active = c._id === activeId;
              return (
                <li key={c._id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(c._id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(c._id);
                      }
                    }}
                    className={cn(
                      'group flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
                      active && 'border-accent/20 bg-accent/10 hover:bg-accent/10',
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white">
                      {active ? <Check className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {c.title || 'محادثة جديدة'}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {timeAgo(c.updatedAt ?? c.createdAt)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, c._id)}
                      disabled={deletingId === c._id}
                      title="حذف المحادثة"
                      className="shrink-0 rounded-full p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40 max-sm:opacity-100"
                    >
                      {deletingId === c._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
