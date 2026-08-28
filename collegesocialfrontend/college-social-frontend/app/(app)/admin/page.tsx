'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Award,
  Bell,
  Bot,
  Calendar,
  HelpCircle,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  ShieldCheck,
  Users,
  Users2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { AdminOverview } from '@/components/admin/AdminOverview';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { AdminStats } from '@/components/admin/AdminStats';
import { AdminPostsPanel } from '@/components/admin/AdminPostsPanel';
import { AdminGroupsPanel } from '@/components/admin/AdminGroupsPanel';
import { AdminQaPanel } from '@/components/admin/AdminQaPanel';
import { AdminAnnouncementsPanel } from '@/components/admin/AdminAnnouncementsPanel';
import { AdminQuizzesPanel } from '@/components/admin/AdminQuizzesPanel';
import { AdminAssignmentsPanel } from '@/components/admin/AdminAssignmentsPanel';
import { AdminMiscStats } from '@/components/admin/AdminMiscStats';
import { AdminChatPanel } from '@/components/admin/AdminChatPanel';
import { AdminGamificationPanel } from '@/components/admin/AdminGamificationPanel';

type ItemId =
  | 'overview'
  | 'users'
  | 'user-stats'
  | 'posts'
  | 'groups'
  | 'qa'
  | 'announcements'
  | 'quizzes'
  | 'assignments'
  | 'ai'
  | 'study'
  | 'chat'
  | 'gamification'
  | 'notifications';

interface NavItem {
  id: ItemId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  { label: '', items: [{ id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard }] },
  {
    label: 'الأشخاص',
    items: [
      { id: 'users', label: 'المستخدمون', icon: Users },
      { id: 'user-stats', label: 'إحصائيات المستخدمين', icon: Users2 },
    ],
  },
  {
    label: 'المحتوى',
    items: [
      { id: 'posts', label: 'المنشورات', icon: MessageSquareText },
      { id: 'groups', label: 'المجموعات', icon: Users2 },
      { id: 'qa', label: 'الأسئلة والأجوبة', icon: HelpCircle },
      { id: 'announcements', label: 'الإعلانات', icon: Megaphone },
    ],
  },
  {
    label: 'التعلّم',
    items: [
      { id: 'quizzes', label: 'الاختبارات', icon: HelpCircle },
      { id: 'assignments', label: 'الواجبات', icon: Calendar },
      { id: 'ai', label: 'المساعد الذكي', icon: Bot },
      { id: 'study', label: 'الجدول والمخطط', icon: Calendar },
    ],
  },
  {
    label: 'المجتمع',
    items: [
      { id: 'chat', label: 'المحادثات', icon: MessageCircle },
      { id: 'gamification', label: 'النقاط والشارات', icon: Award },
      { id: 'notifications', label: 'الإشعارات', icon: Bell },
    ],
  },
];

const TITLES: Record<ItemId, string> = {
  overview: 'نظرة عامة',
  users: 'المستخدمون',
  'user-stats': 'إحصائيات المستخدمين',
  posts: 'المنشورات',
  groups: 'المجموعات',
  qa: 'الأسئلة والأجوبة',
  announcements: 'الإعلانات',
  quizzes: 'الاختبارات',
  assignments: 'الواجبات',
  ai: 'المساعد الذكي',
  study: 'الجدول والمخطط',
  chat: 'المحادثات',
  gamification: 'النقاط والشارات',
  notifications: 'الإشعارات',
};

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [active, setActive] = useState<ItemId>('overview');
  const [usersUnverifiedOnly, setUsersUnverifiedOnly] = useState(false);

  // The "Users" panel manages accounts and is super-admin-only -- keep it out of the nav and out of
  // reach for a regular admin (the backend enforces this too, via SuperAdminGuard).
  const isSuperAdmin = !!user?.isSuperAdmin;
  const nav = isSuperAdmin
    ? NAV
    : NAV.map((section) => ({ ...section, items: section.items.filter((item) => item.id !== 'users') })).filter(
        (section) => section.items.length > 0,
      );

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/feed');
  }, [user, router]);

  useEffect(() => {
    if (active === 'users' && !isSuperAdmin) setActive('overview');
  }, [active, isSuperAdmin]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto flex w-full max-w-6xl gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-6 space-y-5">
            <div className="flex items-center gap-2 px-1">
              <ShieldCheck className="h-5 w-5 text-accent" />
              <h1 className="text-lg font-semibold text-foreground">لوحة الإدارة</h1>
            </div>
            {nav.map((section, i) => (
              <div key={i} className="space-y-1">
                {section.label && (
                  <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.label}
                  </p>
                )}
                {section.items.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActive(id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                      active === id
                        ? 'bg-accent/10 text-accent'
                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center gap-2 md:hidden">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <h1 className="text-xl font-semibold text-foreground">لوحة الإدارة</h1>
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin md:hidden">
            {nav.flatMap((s) => s.items).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActive(id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  active === id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <h2 className="hidden text-lg font-semibold text-foreground md:block">{TITLES[active]}</h2>

          {active === 'overview' && (
            <AdminOverview
              onViewPendingVerifications={
                isSuperAdmin
                  ? () => {
                      setUsersUnverifiedOnly(true);
                      setActive('users');
                    }
                  : undefined
              }
            />
          )}
          {active === 'users' && isSuperAdmin && (
            <AdminPanel unverifiedOnly={usersUnverifiedOnly} onUnverifiedOnlyChange={setUsersUnverifiedOnly} />
          )}
          {active === 'user-stats' && <AdminStats />}
          {active === 'posts' && <AdminPostsPanel />}
          {active === 'groups' && <AdminGroupsPanel />}
          {active === 'qa' && <AdminQaPanel />}
          {active === 'announcements' && <AdminAnnouncementsPanel />}
          {active === 'quizzes' && <AdminQuizzesPanel />}
          {active === 'assignments' && <AdminAssignmentsPanel />}
          {active === 'ai' && <AdminMiscStats section="ai" />}
          {active === 'study' && <AdminMiscStats section="study" />}
          {active === 'chat' && <AdminChatPanel />}
          {active === 'gamification' && <AdminGamificationPanel />}
          {active === 'notifications' && <AdminMiscStats section="notifications" />}
        </div>
      </div>
    </div>
  );
}
