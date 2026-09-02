'use client';

import { useState } from 'react';
import Link from 'next/link';
import { History, Maximize2, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { useAi } from '@/lib/ai-context';
import { AiChatPanel } from '@/components/ai/AiChatPanel';
import { AiConversationSwitcher } from '@/components/ai/AiConversationSwitcher';
import { AiUsageMeter } from '@/components/ai/AiUsageMeter';
import { AiAvatar } from '@/components/ai/AiAvatar';

// Left rail: the AI assistant embedded as a full chat box next to the create-post box,
// shown only at `lg:` and up (AiFab covers the assistant on smaller screens instead).
export function FeedAiChatCard() {
  const { conversations, usage } = useAi();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Explicit "start fresh" state (the + button) -- overrides the resume-most-recent fallback
  // below until a message is actually sent.
  const [newChat, setNewChat] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const conversationId = newChat ? null : (activeId ?? conversations[0]?._id ?? null);

  return (
    <Card className="flex h-[560px] flex-col overflow-hidden">
      <div className="h-[2px] w-full shrink-0 bg-gradient-accent" />
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-accent text-white">
            <AiAvatar size={22} />
            <span className="absolute -end-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface" />
          </div>
          <p className="text-sm font-semibold text-foreground">المساعد الذكي</p>
          {usage && <AiUsageMeter used={usage.used} limit={usage.limit} size={18} />}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setActiveId(null);
              setNewChat(true);
              setView('chat');
            }}
            title="محادثة جديدة"
            className="rounded-full p-1.5 text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-foreground active:scale-95"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView((v) => (v === 'history' ? 'chat' : 'history'))}
            title={view === 'history' ? 'العودة إلى المحادثة' : 'سجل المحادثات'}
            aria-pressed={view === 'history'}
            className={cn(
              'rounded-full p-1.5 transition-transform hover:scale-110 hover:bg-surface-2 active:scale-95',
              view === 'history' ? 'bg-surface-2 text-accent' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <History className="h-4 w-4" />
          </button>
          <Link
            href="/ai"
            title="عرض كل المحادثات"
            className="rounded-full p-1.5 text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-foreground active:scale-95"
          >
            <Maximize2 className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {view === 'history' ? (
          <AiConversationSwitcher
            activeId={conversationId}
            onSelect={(id) => {
              setActiveId(id);
              setNewChat(false);
              setView('chat');
            }}
            onNew={() => {
              setActiveId(null);
              setNewChat(true);
              setView('chat');
            }}
            onDeleteActive={() => setActiveId(null)}
          />
        ) : (
          <AiChatPanel
            conversationId={conversationId}
            onConversationCreated={(c) => {
              setActiveId(c._id);
              setNewChat(false);
            }}
          />
        )}
      </div>
    </Card>
  );
}
