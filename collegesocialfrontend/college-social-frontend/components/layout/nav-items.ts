import { Home, MessageCircle, User, ShieldCheck, GraduationCap, Users, ListChecks, FileText, Video, Newspaper } from 'lucide-react';
import type { Role } from '@/lib/types';

export const NAV_ITEMS = [
  { href: '/home', label: 'الرئيسية', icon: Home },
  { href: '/feed', label: 'المنشورات', icon: Newspaper },
  { href: '/study', label: 'الدراسة', icon: GraduationCap },
  { href: '/quizzes', label: 'الاختبارات', icon: ListChecks },
  { href: '/lectures/pdf', label: 'محاضرات PDF', icon: FileText },
  { href: '/lectures/video', label: 'محاضرات فيديو', icon: Video },
  { href: '/chat', label: 'الدردشة', icon: MessageCircle },
  { href: '/groups', label: 'المجموعات', icon: Users },
  { href: '/profile', label: 'الملف الشخصي', icon: User },
];

const ADMIN_NAV_ITEM = { href: '/admin', label: 'الإدارة', icon: ShieldCheck };

export function getNavItems(role?: Role) {
  return role === 'admin' ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;
}
