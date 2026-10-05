import { Suspense } from 'react';
import { ChatWindow } from '@/components/chat/ChatWindow';

export default function ChatConversationPage({ params }: { params: { conversationId: string } }) {
  // Keyed by conversation: switching chats mounts a fresh window, so no thread state (selection,
  // drafts, overlays, scroll anchors, timers) can leak from one conversation into the next.
  // Suspense: ChatWindow reads deep-link params (?m=<messageId>) via useSearchParams.
  return (
    <Suspense fallback={null}>
      <ChatWindow key={params.conversationId} conversationId={params.conversationId} />
    </Suspense>
  );
}
