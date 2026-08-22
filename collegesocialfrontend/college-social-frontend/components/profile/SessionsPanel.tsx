'use client';

import { useEffect, useState } from 'react';
import { LogOut, Monitor, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { timeAgo } from '@/lib/utils';
import type { Session } from '@/lib/types';

export function SessionsPanel() {
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  function loadSessions() {
    setLoading(true);
    api
      .get<Session[]>('/auth/sessions')
      .then(setSessions)
      .finally(() => setLoading(false));
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      await api.delete(`/auth/sessions/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      showToast('تم تسجيل الخروج من هذا الجهاز.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تسجيل الخروج من هذا الجهاز.', 'error');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleLogoutAll() {
    if (!confirm('سيتم تسجيل الخروج من جميع الأجهزة الأخرى. هل تريد المتابعة؟')) return;
    setLoggingOutAll(true);
    try {
      await api.post('/auth/logout-all');
      setSessions((prev) => prev.filter((s) => s.current));
      showToast('تم تسجيل الخروج من جميع الأجهزة الأخرى.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تنفيذ العملية.', 'error');
    } finally {
      setLoggingOutAll(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const otherSessions = sessions.filter((s) => !s.current);

  return (
    <div className="space-y-4">
      {otherSessions.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" loading={loggingOutAll} onClick={handleLogoutAll}>
            <LogOut className="h-3.5 w-3.5" />
            تسجيل الخروج من كل الأجهزة الأخرى
          </Button>
        </div>
      )}

      {sessions.map((session) => (
        <Card key={session.id} className="flex items-center gap-3.5 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Monitor className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{session.userAgent ?? 'جهاز غير معروف'}</p>
              {session.current && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                  <ShieldCheck className="h-3 w-3" />
                  هذا الجهاز
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {session.ip && <span>{session.ip} · </span>}
              آخر نشاط {timeAgo(session.lastUsedAt)}
            </p>
          </div>
          {!session.current && (
            <Button
              variant="ghost"
              size="sm"
              loading={revokingId === session.id}
              onClick={() => handleRevoke(session.id)}
              className="text-danger hover:bg-danger/10"
            >
              إنهاء الجلسة
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}
