'use client';

import { AuthProvider } from '@/lib/auth-context';
import { SocketProvider } from '@/lib/socket-context';
import { ToastProvider } from '@/lib/toast-context';
import { ThemeProvider } from '@/lib/theme-context';
import { NotificationsProvider } from '@/lib/notifications-context';
import { AiProvider } from '@/lib/ai-context';
import { CallProvider } from '@/components/chat/CallProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <NotificationsProvider>
              {/* Mounted app-wide (not just inside /chat) so an incoming call rings no matter
                  which page the user is currently on, same as WhatsApp/Messenger. */}
              <CallProvider>
                <AiProvider>{children}</AiProvider>
              </CallProvider>
            </NotificationsProvider>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
