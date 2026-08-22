import { IsIn } from 'class-validator';
import { BADGES, BadgeId } from '../../gamification/badges';

const BADGE_IDS = Object.keys(BADGES) as BadgeId[];

export class AdminGrantBadgeDto {
  @IsIn(BADGE_IDS, { message: 'شارة غير معروفة' })
  badgeId: BadgeId;
}
