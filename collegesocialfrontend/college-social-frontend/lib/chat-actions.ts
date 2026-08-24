import { api } from './api';
import type { Conversation } from './types';

// Find-or-create a 1:1 conversation with `userId` and return it -- same call
// app/(app)/profile/[id]/page.tsx's handleMessage() makes. No ChatProvider needed here: it's only
// mounted inside /chat's own layout (and locally in /feed for its AI/chat cards), and the chat
// page loads whatever conversation you land on itself, so callers outside those trees (the
// friends page, a profile tab) can just navigate to `/chat/${conversation._id}` afterwards.
export async function startConversationWith(userId: string): Promise<Conversation> {
  return api.post<Conversation>('/chat/conversations', { participantIds: [userId] });
}
