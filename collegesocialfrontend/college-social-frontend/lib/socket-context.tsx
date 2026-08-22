'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getToken } from './api';
import { useAuth } from './auth-context';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
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
      transports: ['websocket', 'polling'],
    });

    instance.on('connect', () => setConnected(true));
    instance.on('disconnect', () => setConnected(false));

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
