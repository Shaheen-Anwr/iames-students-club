'use client';

import { MotionConfig } from 'framer-motion';
import { DirectionProvider } from '@radix-ui/react-direction';
import { AuthProvider } from '@/lib/auth-context';
import { SocketProvider } from '@/lib/socket-context';
import { ToastProvider } from '@/lib/toast-context';
import { ThemeProvider } from '@/lib/theme-context';
import { NotificationsProvider } from '@/lib/notifications-context';
import { AiProvider } from '@/lib/ai-context';
import { CallProvider } from '@/components/chat/CallProvider';
import { PwaRegistrar } from '@/components/PwaRegistrar';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
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
              <SocketProvider>
                <NotificationsProvider>
                  {/* Mounted app-wide (not just inside /chat) so an incoming call rings no
                      matter which page the user is on, same as WhatsApp/Messenger. */}
                  <CallProvider>
                    <AiProvider>{children}</AiProvider>
                  </CallProvider>
                </NotificationsProvider>
              </SocketProvider>
            </AuthProvider>
          </ToastProvider>
        </MotionConfig>
      </DirectionProvider>
    </ThemeProvider>
  );
}
