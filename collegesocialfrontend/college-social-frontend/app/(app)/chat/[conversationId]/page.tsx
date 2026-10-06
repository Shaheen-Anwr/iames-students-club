// The thread itself is rendered by the chat layout (app/(app)/chat/layout.tsx) from the URL, so
// opening a chat never waits on this route. The page only has to exist for /chat/<id> to resolve.
export default function ChatConversationPage() {
  return null;
}
