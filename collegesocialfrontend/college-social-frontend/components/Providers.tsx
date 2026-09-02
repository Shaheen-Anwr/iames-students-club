'use client';

import { useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { DirectionProvider } from '@radix-ui/react-direction';
import {
  PersistQueryClientProvider,
  removeOldestQuery,
} from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { makeQueryClient } from '@/lib/query';
import { AuthProvider } from '@/lib/auth-context';
import { SocketProvider } from '@/lib/socket-context';
import { ToastProvider } from '@/lib/toast-context';
import { ThemeProvider } from '@/lib/theme-context';
import { NotificationsProvider } from '@/lib/notifications-context';
import { ChatUnreadProvider } from '@/lib/chat-unread-context';
import { AiProvider } from '@/lib/ai-context';
import { CallProvider } from '@/components/chat/CallProvider';
import { PwaRegistrar } from '@/components/PwaRegistrar';
import { Observability } from '@/components/Observability';

export function Providers({ children }: { children: React.ReactNode }) {
  // One client for the life of the tab -- useState(factory) so it isn't recreated on re-render.
  const [queryClient] = useState(makeQueryClient);

  // Persist the query cache to localStorage so the app opens on last-known data (feed, dashboard,
  // course hubs...) instead of a wall of skeletons, and reads survive an offline launch. On the
  // server `storage` is undefined -> createSyncStoragePersister returns a no-op, so this is
  // client-only in practice. `removeOldestQuery` sheds the oldest entry on a quota error rather
  // than dropping the whole cache; `buster` invalidates every persisted cache at once when bumped.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      key: 'iaems:query-cache',
      throttleTime: 1500,
      retry: removeOldestQuery,
    }),
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24, buster: 'iaems-q-v1' }}
    >
    <ThemeProvider>
      {/* App is RTL app-wide (<html dir="rtl">). Radix reads direction from context, not the
          DOM, so set it once here -- otherwise every menu/tooltip aligns for LTR. */}
      <DirectionProvider dir="rtl">
        {/* reducedMotion="user" -- framer-motion drops transform/opacity animation app-wide
            when the OS "reduce motion" setting is on; pairs with the @media block in globals.css. */}
        <MotionConfig reducedMotion="user">
          <PwaRegistrar />
          <ToastProvider>
            <AuthProvider>
              <Observability />
              <SocketProvider>
                <NotificationsProvider>
                  {/* App-wide unread-chats count for the nav badge + installed-app icon badge. */}
                  <ChatUnreadProvider>
                    {/* Mounted app-wide (not just inside /chat) so an incoming call rings no
                        matter which page the user is on, same as WhatsApp/Messenger. */}
                    <CallProvider>
                      <AiProvider>{children}</AiProvider>
                    </CallProvider>
                  </ChatUnreadProvider>
                </NotificationsProvider>
              </SocketProvider>
            </AuthProvider>
          </ToastProvider>
        </MotionConfig>
      </DirectionProvider>
    </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
