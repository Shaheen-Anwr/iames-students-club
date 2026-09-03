'use client';

import Link from 'next/link';
import { ClipboardCheck, FileText, ListChecks, Users2, Video } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useAuth } from '@/lib/auth-context';
import { useFriendActivity, type ActivityReason, type FriendActivityItem } from '@/lib/gamification';
import { assetUrl, timeAgo } from '@/lib/utils';

const VERB: Record<ActivityReason, string> = {
  post_created: 'شارك منشورًا',
  reel_created: 'نشر ريلًا',
  quiz_attempted: 'حلّ اختبارًا',
  assignment_completed: 'أكمل واجبًا',
};

const ICON: Record<ActivityReason, typeof FileText> = {
  post_created: FileText,
  reel_created: Video,
  quiz_attempted: ListChecks,
  assignment_completed: ClipboardCheck,
};

function hrefFor(item: FriendActivityItem): string {
  const m = item.meta ?? {};
  if (item.reason === 'post_created' && m.postId) return `/posts/${m.postId}`;
  if (item.reason === 'quiz_attempted' && m.quizId) return `/quizzes/${m.quizId}`;
  if (item.reason === 'reel_created' && m.reelId) return `/reels/${m.reelId}`;
  return `/profile/${item.actor._id}`;
}

// Home card: what the student's friends have been doing this week, course-tagged where known.
// Renders nothing when the student has no friends or no recent friend activity.
export function FriendActivity() {
  const { user } = useAuth();
  const { data = [] } = useFriendActivity(!!user);
  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/70 bg-surface p-4 shadow-elev-1">
      <SectionHeader icon={Users2} title="نشاط الأصدقاء" tone="accent" />
      <ul className="space-y-1">
        {data.slice(0, 6).map((item, i) => {
          const Icon = ICON[item.reason];
          const course = item.meta?.courseCode;
          return (
            <li key={`${item.actor._id}-${item.createdAt}-${i}`}>
              <Link
                href={hrefFor(item)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-2"
              >
                <Avatar src={assetUrl(item.actor.photoUrl)} name={item.actor.name} size="xs" />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  <b className="font-medium">{item.actor.name}</b>{' '}
                  <span className="text-muted-foreground">
                    {VERB[item.reason]}
                    {course ? ` · ${course}` : ''}
                  </span>
                </span>
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
