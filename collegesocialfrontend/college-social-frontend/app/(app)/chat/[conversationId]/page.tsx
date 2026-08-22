import { ChatWindow } from '@/components/chat/ChatWindow';

export default function ChatConversationPage({ params }: { params: { conversationId: string } }) {
  return <ChatWindow conversationId={params.conversationId} />;
}
