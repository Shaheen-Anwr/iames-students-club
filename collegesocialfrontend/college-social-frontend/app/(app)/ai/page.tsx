'use client';

import { useRouter } from 'next/navigation';
import { AiChatPanel } from '@/components/ai/AiChatPanel';

export default function AiIndexPage() {
  const router = useRouter();

  return <AiChatPanel conversationId={null} onConversationCreated={(c) => router.push(`/ai/${c._id}`)} />;
}
