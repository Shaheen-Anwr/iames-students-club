import {
  Home,
  MessageCircle,
  User,
  ShieldCheck,
  GraduationCap,
  Users,
  UsersRound,
  ListChecks,
  FileText,
  Video,
  Newspaper,
  Clapperboard,
  FileCog,
  MessagesSquare,
  CalendarHeart,
  Store,
  SquarePen,
  Timer,
  Bookmark,
} from 'lucide-react';
import type { Role } from '@/lib/types';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
}

// Every destination, flat -- consumed by the ⌘K command palette. Order here is the palette order.
export const NAV_ITEMS: NavItem[] = [
  { href: '/home', label: 'الرئيسية', icon: Home },
  { href: '/feed', label: 'المجتمع', icon: Newspaper },
  { href: '/reels', label: 'اكاديميا', icon: Clapperboard },
  { href: '/wall', label: 'الجدار', icon: MessagesSquare },
  { href: '/events', label: 'الفعاليات', icon: CalendarHeart },
  { href: '/marketplace', label: 'السوق', icon: Store },
  { href: '/study', label: 'الدراسة', icon: GraduationCap },
  { href: '/quizzes', label: 'الاختبارات', icon: ListChecks },
  { href: '/lectures/pdf', label: 'محاضرات PDF', icon: FileText },
  { href: '/lectures/video', label: 'محاضرات فيديو', icon: Video },
  { href: '/rooms', label: 'غرف المذاكرة', icon: Timer },
  { href: '/chat', label: 'المحادثات', icon: MessageCircle },
  { href: '/groups', label: 'المجموعات', icon: Users },
  { href: '/friends', label: 'صحابي', icon: UsersRound },
  { href: '/profile', label: 'حسابي', icon: User },
  { href: '/study/saved', label: 'المحفوظات', icon: Bookmark },
  { href: '/convert', label: 'محوّل الملفات', icon: FileCog },
];

const ADMIN_NAV_ITEM: NavItem = { href: '/admin', label: 'الإدارة', icon: ShieldCheck };
// Professors (and admins) get a teaching hub -- publish announcements/assignments/quizzes and
// track submissions in one place.
const TEACH_NAV_ITEM: NavItem = { href: '/teach', label: 'التدريس', icon: SquarePen };

export function getNavItems(role?: Role): NavItem[] {
  if (role === 'admin') return [...NAV_ITEMS, TEACH_NAV_ITEM, ADMIN_NAV_ITEM];
  if (role === 'professor') return [...NAV_ITEMS, TEACH_NAV_ITEM];
  return NAV_ITEMS;
}

// --- The 5-hub information architecture --------------------------------------------------------
// Bottom bar (mobile) + icon row (desktop) = these 5, in order. Every other destination lives
// under the hub it belongs to, surfaced in the grouped "الكل" sheet (getNavGroups) and the ⌘K
// palette. Kept at 5 so the mobile bar -- 5 items + an "الكل" button -- stays icon-legible at
// 320px.
export const PRIMARY_HREFS = ['/home', '/feed', '/study', '/chat', '/profile'] as const;

export function getPrimaryNavItems(role?: Role): NavItem[] {
  const all = getNavItems(role);
  return PRIMARY_HREFS.map((href) => all.find((i) => i.href === href)).filter((i): i is NavItem => Boolean(i));
}

export function getSecondaryNavItems(role?: Role): NavItem[] {
  return getNavItems(role).filter((i) => !(PRIMARY_HREFS as readonly string[]).includes(i.href));
}

// The "الكل" sheet, grouped so the long tail reads as one organised menu under the same hub
// names, not a flat dump. A group's own hub route is intentionally NOT repeated inside it.
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export function getNavGroups(role?: Role): NavGroup[] {
  const all = getNavItems(role);
  const pick = (hrefs: string[]) => hrefs.map((h) => all.find((i) => i.href === h)).filter((i): i is NavItem => Boolean(i));

  const groups: NavGroup[] = [
    { title: 'المجتمع', items: pick(['/reels', '/wall', '/events', '/marketplace']) },
    { title: 'الدراسة', items: pick(['/quizzes', '/lectures/pdf', '/lectures/video', '/rooms', '/study/saved']) },
    { title: 'المحادثات', items: pick(['/groups', '/friends']) },
    { title: 'أدوات', items: pick(['/convert']) },
  ];

  const staffItems = all.filter((i) => i.href === '/teach' || i.href === '/admin');
  if (staffItems.length) groups.push({ title: 'الطاقم', items: staffItems });

  return groups.filter((g) => g.items.length > 0);
}
