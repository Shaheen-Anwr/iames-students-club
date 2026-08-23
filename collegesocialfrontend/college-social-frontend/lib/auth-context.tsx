'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearToken, setToken } from './api';
import { useToast } from './toast-context';
import { BADGE_META, type BadgeId, type Role, type User } from './types';
import type { Department } from './departments';

// Client-side-only badge-unlock detection: the backend just does a silent $addToSet with no
// event of its own, so this compares against the last-seen set (per user, in localStorage) each
// time /users/me refreshes. Detects unlocks "as of the next profile refresh", not instantly.
function notifyNewBadges(user: User, showToast: (message: string, variant?: 'success' | 'error' | 'info') => void) {
  if (typeof window === 'undefined') return;
  const key = `seen-badges:${user._id}`;
  const seen = window.localStorage.getItem(key);
  const badges = user.badges ?? [];

  if (seen === null) {
    window.localStorage.setItem(key, JSON.stringify(badges));
    return;
  }

  const previous: string[] = JSON.parse(seen);
  const newBadges = badges.filter((id) => !previous.includes(id));
  window.localStorage.setItem(key, JSON.stringify(badges));

  for (const id of newBadges) {
    const meta = BADGE_META[id as BadgeId];
    if (meta) showToast(`${meta.icon} وسام جديد: ${meta.label}!`);
  }
}

interface RegisterInput {
  collegeId: string;
  password: string;
  name: string;
  collegeEmail: string;
  role: Role;
  department?: Department;
  photo?: File | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (collegeId: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateLocalUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    // Always attempt this, even with no readable access-token cookie: the httpOnly refresh
    // cookie may still be valid, in which case api.ts's silent-refresh transparently
    // re-establishes a session from it.
    try {
      const me = await api.get<User>('/users/me');
      setUser(me);
      notifyNewBadges(me, showToast);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (collegeId: string, password: string) => {
      const res = await api.post<{ accessToken: string }>('/auth/login', { collegeId, password });
      setToken(res.accessToken);
      const me = await api.get<User>('/users/me');
      setUser(me);
      if ((me.streakCount ?? 0) >= 2) {
        showToast(`🔥 استمر! يومك رقم ${me.streakCount} على التوالي`);
      }
      notifyNewBadges(me, showToast);
      return me;
    },
    [showToast],
  );

  const register = useCallback(async (input: RegisterInput) => {
    const { photo, ...dto } = input;
    const res = await api.post<{ accessToken: string }>('/auth/register', dto);
    setToken(res.accessToken);

    if (photo) {
      // Best-effort: the account already exists at this point, so a dropped connection (common
      // on mobile) uploading the photo shouldn't fail the whole registration and strand the user
      // mid-flow with a session but no way to retry (a second submit would now hit "already
      // registered"). They can always add a photo later from their profile.
      try {
        await api.upload('/upload/photo', photo);
      } catch {
        showToast('تم إنشاء الحساب، لكن تعذّر رفع الصورة الشخصية. يمكنك إضافتها لاحقًا من ملفك الشخصي.');
      }
    }

    const me = await api.get<User>('/users/me');
    setUser(me);
    return me;
  }, [showToast]);

  const logout = useCallback(async () => {
    try {
      // Revokes the session server-side and clears the httpOnly refresh cookie.
      await api.post('/auth/logout');
    } catch {
      // Best-effort -- still clear local state below even if the network call fails.
    }
    clearToken();
    setUser(null);
  }, []);

  const updateLocalUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, updateLocalUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
