'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getToken } from './api';
import { useAuth } from './auth-context';
import { useToast } from './toast-context';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      setSocket(null);
      setConnected(false);
      return;
    }

    const token = getToken();
    if (!token) return;

    const instance = io(`${SOCKET_URL}/chat`, {
      auth: { token },
      // Go straight to WebSocket -- skip the long-polling handshake + upgrade round-trips.
      // Socket.IO still falls back to polling on its own if the WS upgrade fails.
      transports: ['websocket', 'polling'],
      // Reconnect fast but back off so a server blip doesn't turn into a stampede.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 10000,
    });

    instance.on('connect', () => setConnected(true));
    instance.on('disconnect', () => setConnected(false));
    // NestJS's default WS exception filter emits this when a gateway handler throws (e.g.
    // sendMessage rejected because the recipient blocked you) -- without this, such errors just
    // vanish client-side since emit() is fire-and-forget.
    instance.on('exception', (err: { message?: string | string[] }) => {
      const message = Array.isArray(err?.message) ? err.message[0] : err?.message;
      showToast(message || 'حدث خطأ غير متوقع.', 'error');
    });

    setSocket(instance);

    return () => {
      instance.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
