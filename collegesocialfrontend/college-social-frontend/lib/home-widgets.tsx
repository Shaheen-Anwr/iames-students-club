import type { ComponentType } from 'react';
import {
  Award,
  Bell,
  Calendar,
  Clock,
  ListTodo,
  Megaphone,
  Sparkles,
  Store,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { QuickActions } from '@/components/home/QuickActions';
import { NextClassCard } from '@/components/home/NextClassCard';
import { TodayGlance } from '@/components/home/TodayGlance';
import { OnlineNow } from '@/components/home/OnlineNow';
import { FriendActivity } from '@/components/home/FriendActivity';
import { TodayWidget } from '@/components/home/TodayWidget';
import { CompactLeaderboard } from '@/components/home/CompactLeaderboard';
import { MyAssignmentsCard } from '@/components/home/MyAssignmentsCard';
import { NotificationsPreview } from '@/components/home/NotificationsPreview';
import { WeeklyRecapCard } from '@/components/home/WeeklyRecapCard';
import { ReferralCard } from '@/components/home/ReferralCard';
import { BadgesCard } from '@/components/home/BadgesCard';
import { AnnouncementsStrip } from '@/components/announcements/AnnouncementsStrip';
import { EventsPreviewCard } from '@/components/home/EventsPreviewCard';
import { MarketplacePreviewCard } from '@/components/home/MarketplacePreviewCard';
import { AiUsageCard } from '@/components/home/AiUsageCard';
import { QuickStatsCard } from '@/components/home/QuickStatsCard';
import type { Nudge } from './today';
import type { DashboardResponse, User } from './types';

// Every widget /home's registry can render, besides `greeting` (always pinned first, never
// reorderable/hideable -- it's the page's identity header, not a "widget") and the transient
// onboarding/re-engagement strips `sinceLastSeen`/`firstWeekChecklist` (self-hiding, not something
// a user permanently rearranges). MUST stay in sync with the backend's HOME_WIDGET_IDS
// (src/users/dto/update-home-layout.dto.ts) -- an id here with no backend counterpart just never
// round-trips through the layout-preference save; an id there with no frontend counterpart is
// silently unrenderable (filtered out by getEffectiveOrder below).
export const HOME_WIDGET_IDS = [
  'weeklyRecap',
  'nextClass',
  'todayGlance',
  'onlineNow',
  'friendActivity',
  'quickActions',
  'todayWidget',
  'leaderboard',
  'myAssignments',
  'announcements',
  'notifications',
  'referral',
  'badges',
  'eventsPreview',
  'marketplacePreview',
  'aiUsage',
  'quickStats',
] as const;
export type WidgetId = (typeof HOME_WIDGET_IDS)[number];

export interface HomeLayoutPrefs {
  order: WidgetId[];
  hidden: WidgetId[];
}

export interface WidgetContext {
  user: User;
  data: DashboardResponse;
  nudge: Nudge | null;
  unreadCount: number;
  now: Date;
}

export interface WidgetDef {
  id: WidgetId;
  label: string; // Arabic label, shown in the "customize home" settings list
  icon: ComponentType<{ className?: string }>;
  component: ComponentType<any>;
  span: 'full' | 'half'; // CSS grid sizing -- see page.tsx's grid-cols-1 lg:grid-cols-2 + col-span-2
  restrictedTo?: 'student' | 'professor'; // hard role gate, applied before user prefs
  propsSelector?: (ctx: WidgetContext) => Record<string, unknown>;
  baseWeight: number; // smart-default ordering (higher = earlier)
  situational?: (ctx: WidgetContext) => number; // additive bonus for smart ordering
}

const inClassHours = (now: Date) => now.getHours() >= 8 && now.getHours() < 18;
const isWeekend = (now: Date) => now.getDay() === 5 || now.getDay() === 6; // الجمعة/السبت

export const HOME_WIDGETS: WidgetDef[] = [
  {
    id: 'weeklyRecap',
    label: 'ملخص الأسبوع',
    icon: Sparkles,
    component: WeeklyRecapCard,
    span: 'full',
    restrictedTo: 'student',
    baseWeight: 70,
    situational: (ctx) => (isWeekend(ctx.now) ? 50 : -100), // renders nothing on weekdays anyway
  },
  {
    id: 'nextClass',
    label: 'حصتك القادمة',
    icon: Clock,
    component: NextClassCard,
    span: 'full',
    propsSelector: (ctx) => ({ schedule: ctx.data.todaySchedule }),
    baseWeight: 95,
  },
  {
    id: 'todayGlance',
    label: 'نظرة على يومك',
    icon: ListTodo,
    component: TodayGlance,
    span: 'full',
    propsSelector: (ctx) => ({ schedule: ctx.data.todaySchedule, dueToday: ctx.data.dueToday, streak: ctx.user.streakCount ?? 0 }),
    baseWeight: 90,
  },
  {
    id: 'onlineNow',
    label: 'متصل الآن',
    icon: Users,
    component: OnlineNow,
    span: 'full',
    restrictedTo: 'student',
    baseWeight: 55,
    situational: (ctx) => (inClassHours(ctx.now) ? 10 : 0),
  },
  {
    id: 'friendActivity',
    label: 'نشاط الأصدقاء',
    icon: UserPlus,
    component: FriendActivity,
    span: 'full',
    restrictedTo: 'student',
    baseWeight: 50,
    situational: (ctx) => (inClassHours(ctx.now) ? 10 : 0),
  },
  {
    id: 'quickActions',
    label: 'إجراءات سريعة',
    icon: Sparkles,
    component: QuickActions,
    span: 'full',
    baseWeight: 80,
  },
  {
    id: 'todayWidget',
    label: 'مهام اليوم',
    icon: ListTodo,
    component: TodayWidget,
    span: 'half',
    propsSelector: (ctx) => ({ schedule: ctx.data.todaySchedule, dueToday: ctx.data.dueToday }),
    baseWeight: 85,
  },
  {
    id: 'leaderboard',
    label: 'المتصدرون',
    icon: Trophy,
    component: CompactLeaderboard,
    span: 'half',
    restrictedTo: 'student',
    propsSelector: (ctx) => ({ entries: ctx.data.leaderboard }),
    baseWeight: 75,
  },
  {
    id: 'myAssignments',
    label: 'واجباتي المنشورة',
    icon: ListTodo,
    component: MyAssignmentsCard,
    span: 'half',
    restrictedTo: 'professor',
    baseWeight: 75,
  },
  {
    id: 'announcements',
    label: 'الإعلانات',
    icon: Megaphone,
    component: AnnouncementsStrip,
    span: 'half',
    baseWeight: 65,
    situational: (ctx) => (ctx.data.announcements.length ? 10 : 0),
  },
  {
    id: 'notifications',
    label: 'الإشعارات',
    icon: Bell,
    component: NotificationsPreview,
    span: 'half',
    baseWeight: 65,
    situational: (ctx) => (ctx.unreadCount > 0 ? 10 : 0),
  },
  {
    id: 'eventsPreview',
    label: 'فعاليات الحرم الجامعي',
    icon: Calendar,
    component: EventsPreviewCard,
    span: 'half',
    baseWeight: 45,
  },
  {
    id: 'marketplacePreview',
    label: 'أحدث إعلانات السوق',
    icon: Store,
    component: MarketplacePreviewCard,
    span: 'half',
    baseWeight: 40,
  },
  {
    id: 'aiUsage',
    label: 'المساعد الذكي',
    icon: Sparkles,
    component: AiUsageCard,
    span: 'half',
    baseWeight: 40,
  },
  {
    id: 'quickStats',
    label: 'إحصائياتي',
    icon: TrendingUp,
    component: QuickStatsCard,
    span: 'full',
    baseWeight: 60,
  },
  {
    id: 'referral',
    label: 'دعوة الأصدقاء',
    icon: UserPlus,
    component: ReferralCard,
    span: 'half',
    restrictedTo: 'student',
    baseWeight: 20,
  },
  {
    id: 'badges',
    label: 'أوسمتك',
    icon: Award,
    component: BadgesCard,
    span: 'half',
    restrictedTo: 'student',
    propsSelector: (ctx) => ({ badges: ctx.user.badges ?? [] }),
    baseWeight: 20,
  },
];

function eligibleFor(ctx: WidgetContext): WidgetDef[] {
  const role = ctx.user.role === 'professor' ? 'professor' : 'student';
  return HOME_WIDGETS.filter((w) => !w.restrictedTo || w.restrictedTo === role);
}

export function computeSmartOrder(eligible: WidgetDef[], ctx: WidgetContext): WidgetDef[] {
  return [...eligible].sort((a, b) => {
    const scoreA = a.baseWeight + (a.situational?.(ctx) ?? 0);
    const scoreB = b.baseWeight + (b.situational?.(ctx) ?? 0);
    return scoreB - scoreA;
  });
}

// Resolves the final, ordered, role-and-preference-filtered widget list for this render. `prefs`
// is `null` while still loading (falls back to smart order, same as "never customized").
export function getEffectiveOrder(prefs: HomeLayoutPrefs | null, ctx: WidgetContext): WidgetDef[] {
  const eligible = eligibleFor(ctx);
  const eligibleIds = new Set(eligible.map((w) => w.id));
  const byId = new Map(eligible.map((w) => [w.id, w]));

  let ordered: WidgetDef[];
  if (prefs?.order.length) {
    const seen = new Set<WidgetId>();
    ordered = [];
    for (const id of prefs.order) {
      const w = byId.get(id);
      if (w && !seen.has(id)) {
        ordered.push(w);
        seen.add(id);
      }
    }
    // Widgets the user never saw when they last customized (newly added, or ineligible for their
    // role at the time) -- append in smart order rather than dropping them silently.
    const missing = eligible.filter((w) => !seen.has(w.id));
    ordered.push(...computeSmartOrder(missing, ctx));
  } else {
    ordered = computeSmartOrder(eligible, ctx);
  }

  const hidden = new Set(prefs?.hidden ?? []);
  return ordered.filter((w) => eligibleIds.has(w.id) && !hidden.has(w.id));
}
