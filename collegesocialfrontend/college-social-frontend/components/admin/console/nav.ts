import {
  Award,
  BarChart3,
  Bell,
  Bot,
  CalendarClock,
  CalendarDays,
  HelpCircle,
  LayoutDashboard,
  type LucideIcon,
  MessageCircle,
  Megaphone,
  MessageSquareText,
  Users,
  Users2,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Section is only mounted / linked for super admins (backend SuperAdminGuard also enforces). */
  superAdmin?: boolean;
  /** Key into the shared-stats "needs attention" counts for a live sidebar badge. */
  badgeKey?: 'pendingVerifications';
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const ADMIN_NAV: NavSection[] = [
  {
    label: '',
    items: [{ href: '/admin', label: 'نظرة عامة', icon: LayoutDashboard }],
  },
  {
    label: 'الأشخاص',
    items: [
      { href: '/admin/users', label: 'المستخدمون', icon: Users, superAdmin: true, badgeKey: 'pendingVerifications' },
      { href: '/admin/users/stats', label: 'إحصائيات المستخدمين', icon: BarChart3 },
    ],
  },
  {
    label: 'المحتوى',
    items: [
      { href: '/admin/content/posts', label: 'المنشورات', icon: MessageSquareText },
      { href: '/admin/content/groups', label: 'المجموعات', icon: Users2 },
      { href: '/admin/content/qa', label: 'الأسئلة والأجوبة', icon: HelpCircle },
      { href: '/admin/content/announcements', label: 'الإعلانات', icon: Megaphone },
    ],
  },
  {
    label: 'التعلّم',
    items: [
      { href: '/admin/learning/quizzes', label: 'الاختبارات', icon: HelpCircle },
      { href: '/admin/learning/assignments', label: 'الواجبات', icon: CalendarDays },
      { href: '/admin/learning/ai', label: 'رافد (المساعد الذكي)', icon: Bot },
      { href: '/admin/learning/schedule', label: 'الجدول والمخطط', icon: CalendarClock },
    ],
  },
  {
    label: 'المجتمع',
    items: [
      { href: '/admin/community/chat', label: 'المحادثات', icon: MessageCircle },
      { href: '/admin/community/gamification', label: 'النقاط والشارات', icon: Award },
      { href: '/admin/community/notifications', label: 'الإشعارات', icon: Bell },
    ],
  },
];

export function flatNav(): NavItem[] {
  return ADMIN_NAV.flatMap((s) => s.items);
}

/** The nav item whose href best matches `pathname` (longest prefix wins so nested routes resolve). */
export function activeNavItem(pathname: string): NavItem | undefined {
  return flatNav()
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumb trail: "لوحة الإدارة" → section → page. */
export function crumbsFor(pathname: string): Crumb[] {
  const trail: Crumb[] = [{ label: 'لوحة الإدارة', href: '/admin' }];
  if (pathname === '/admin') return trail;

  const section = ADMIN_NAV.find((s) => s.items.some((i) => pathname.startsWith(i.href)) && s.label);
  if (section?.label) trail.push({ label: section.label });

  const item = activeNavItem(pathname);
  if (item && item.href !== '/admin') trail.push({ label: item.label, href: item.href });
  return trail;
}
