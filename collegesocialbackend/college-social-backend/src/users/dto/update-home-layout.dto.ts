import { IsArray, IsIn, IsOptional } from 'class-validator';

// Every widget the /home page's registry can render (see the frontend's lib/home-widgets.tsx --
// keep this list in sync with that file's WidgetId union). `sinceLastSeen`/`firstWeekChecklist`
// are deliberately NOT here -- they're transient onboarding/re-engagement strips that self-hide on
// their own, not something a user permanently reorders or hides. Anything outside this list sent
// by a stale/forged client is dropped server-side (see UsersService.setHomeLayout), never trusted.
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
export type HomeWidgetId = (typeof HOME_WIDGET_IDS)[number];

// All fields optional -- PATCH semantics, omitting a field leaves it unchanged. Same belt-and-
// suspenders as UpdateNotificationPrefsDto: rejected here via @IsIn, then de-duped again in
// UsersService.setHomeLayout before the $set (defense in depth, not redundant -- this DTO can't see
// duplicates within a valid array, only the service's Set dedup catches those).
export class UpdateHomeLayoutDto {
  @IsOptional()
  @IsArray()
  @IsIn(HOME_WIDGET_IDS, { each: true })
  order?: HomeWidgetId[];

  @IsOptional()
  @IsArray()
  @IsIn(HOME_WIDGET_IDS, { each: true })
  hidden?: HomeWidgetId[];
}
