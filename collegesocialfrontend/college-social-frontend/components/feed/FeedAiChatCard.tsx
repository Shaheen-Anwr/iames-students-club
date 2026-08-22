'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Maximize2, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useAi } from '@/lib/ai-context';
import { AiChatPanel } from '@/components/ai/AiChatPanel';
import { AiAvatar } from '@/components/ai/AiAvatar';

// Left rail: the AI assistant embedded as a full chat box next to the create-post box,
// shown only at `lg:` and up (AiFab covers the assistant on smaller screens instead).
export function FeedAiChatCard() {
  const { conversations } = useAi();
  const [activeId, setActiveId] = useState<string | null>(null);
  const conversationId = activeId ?? conversations[0]?._id ?? null;

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
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveId(null)}
            title="محادثة جديدة"
            className="rounded-full p-1.5 text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-foreground active:scale-95"
          >
            <Plus className="h-4 w-4" />
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
        <AiChatPanel conversationId={conversationId} onConversationCreated={(c) => setActiveId(c._id)} />
      </div>
    </Card>
  );
}
