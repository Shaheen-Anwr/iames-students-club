import { Home, MessageCircle, User, ShieldCheck, GraduationCap, Users, UsersRound, ListChecks, FileText, Video, Newspaper, Clapperboard, FileCog, MessagesSquare, CalendarHeart, Store, SquarePen, Timer } from 'lucide-react';
import type { Role } from '@/lib/types';

export const NAV_ITEMS = [
  { href: '/home', label: 'الرئيسية', icon: Home },
  { href: '/feed', label: 'المنشورات', icon: Newspaper },
  { href: '/wall', label: 'الجدار', icon: MessagesSquare },
  { href: '/events', label: 'الفعاليات', icon: CalendarHeart },
  { href: '/marketplace', label: 'السوق', icon: Store },
  { href: '/rooms', label: 'غرف المذاكرة', icon: Timer },
  { href: '/reels', label: 'اكاديميا', icon: Clapperboard },
  { href: '/study', label: 'الدراسة', icon: GraduationCap },
  { href: '/quizzes', label: 'الاختبارات', icon: ListChecks },
  { href: '/lectures/pdf', label: 'محاضرات PDF', icon: FileText },
  { href: '/lectures/video', label: 'محاضرات فيديو', icon: Video },
  { href: '/convert', label: 'محوّل الملفات', icon: FileCog },
  { href: '/chat', label: 'الدردشة', icon: MessageCircle },
  { href: '/groups', label: 'المجموعات', icon: Users },
  { href: '/friends', label: 'الأصدقاء', icon: UsersRound },
  { href: '/profile', label: 'الملف الشخصي', icon: User },
];

const ADMIN_NAV_ITEM = { href: '/admin', label: 'الإدارة', icon: ShieldCheck };
// Professors (and admins) get a teaching hub -- publish announcements/assignments/quizzes and
// track submissions in one place.
const TEACH_NAV_ITEM = { href: '/teach', label: 'التدريس', icon: SquarePen };

export function getNavItems(role?: Role) {
  if (role === 'admin') return [...NAV_ITEMS, TEACH_NAV_ITEM, ADMIN_NAV_ITEM];
  if (role === 'professor') return [...NAV_ITEMS, TEACH_NAV_ITEM];
  return NAV_ITEMS;
}
