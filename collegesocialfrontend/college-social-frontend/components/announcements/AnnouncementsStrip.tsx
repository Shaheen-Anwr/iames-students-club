'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Pin, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn, timeAgo } from '@/lib/utils';
import type { Announcement } from '@/lib/types';
import { CreateAnnouncementModal } from './CreateAnnouncementModal';

export function AnnouncementsStrip() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const canPost = user?.role === 'professor' || user?.role === 'admin';

  useEffect(() => {
    api
      .get<Announcement[]>('/announcements?limit=3')
      .then(setAnnouncements)
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(announcement: Announcement) {
    setAnnouncements((prev) => [announcement, ...prev].slice(0, 3));
  }

  if (loading || (announcements.length === 0 && !canPost)) return null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-accent" />
          <h2 className="bg-gradient-accent bg-clip-text text-sm font-semibold text-transparent">الإعلانات</h2>
        </div>
        <div className="flex items-center gap-2">
          {canPost && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
            >
              <Plus className="h-3.5 w-3.5" />
              نشر إعلان
            </button>
          )}
          <Link href="/announcements" className="text-xs font-medium text-muted-foreground hover:text-accent">
            عرض الكل
          </Link>
        </div>
      </div>

      {announcements.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد إعلانات بعد.</p>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a._id} className={cn('flex items-start gap-2 rounded-xl p-2', a.pinned && 'bg-accent/5')}>
              {a.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{a.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {a.author?.name ?? 'مستخدم محذوف'} · {timeAgo(a.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateAnnouncementModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
    </Card>
  );
}
