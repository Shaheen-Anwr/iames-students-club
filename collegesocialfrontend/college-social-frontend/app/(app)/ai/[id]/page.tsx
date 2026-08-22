'use client';

import { AiChatPanel } from '@/components/ai/AiChatPanel';

export default function AiConversationPage({ params }: { params: { id: string } }) {
  return <AiChatPanel conversationId={params.id} onConversationCreated={() => {}} />;
}
