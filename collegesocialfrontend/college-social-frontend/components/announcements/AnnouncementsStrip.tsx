'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Megaphone, Pin, Plus } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { useApiQuery } from '@/lib/query';
import { useAuth } from '@/lib/auth-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { Announcement } from '@/lib/types';
import { CreateAnnouncementModal } from './CreateAnnouncementModal';

const STRIP_PATH = '/announcements?limit=3';

export function AnnouncementsStrip() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const searchParams = useSearchParams();

  const { data: announcements = [], isPending: loading } = useApiQuery<'/announcements', Announcement[]>(STRIP_PATH);

  const canPost = user?.role === 'professor' || user?.role === 'admin';
  const [expanded, setExpanded] = useState(false);
  // Opens automatically when the home page's "نشر إعلان" quick action links here with
  // ?announce=1, same pattern as AssignmentsBoard's ?new=1.
  const [modalOpen, setModalOpen] = useState(() => canPost && searchParams.get('announce') === '1');

  function handleCreated(announcement: Announcement) {
    qc.setQueryData<Announcement[]>([STRIP_PATH], (prev) => [announcement, ...(prev ?? [])].slice(0, 3));
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
        <>
          {!expanded && (
            <button
              type="button"
              aria-expanded={false}
              onClick={() => setExpanded(true)}
              className="flex w-full items-center gap-2 rounded-xl bg-accent/5 p-2.5 text-start transition-colors hover:bg-accent/10"
            >
              {announcements[0].pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-accent" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{announcements[0].title}</span>
                <span className="block truncate text-xs text-muted-foreground">{announcements[0].body}</span>
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{announcements.length} إعلانات</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          )}
          {expanded && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button type="button" aria-expanded={true} onClick={() => setExpanded(false)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-surface-2">
                  إخفاء الإعلانات <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                </button>
              </div>
              {announcements.map((a) => (
                <div key={a._id} className={cn('flex items-start gap-2 rounded-xl p-2', a.pinned && 'bg-accent/5')}>
                  {a.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{a.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Avatar src={assetUrl(a.author?.photoUrl)} name={a.author?.name ?? '؟'} size="xs" />
                      <p className="text-[11px] text-muted-foreground">
                        {a.author?.name ?? 'مستخدم محذوف'} · {timeAgo(a.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <CreateAnnouncementModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
    </Card>
  );
}
