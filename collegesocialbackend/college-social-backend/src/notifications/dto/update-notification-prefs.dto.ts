import { IsArray, IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { NOTIFICATION_TYPES, NotificationType } from '../schemas/notification.schema';

// All fields optional -- PATCH semantics. A `null` for an hour clears it; omitting a field leaves
// it unchanged. Unknown mutedTypes are dropped server-side (see NotificationsService.setPreferences).
export class UpdateNotificationPrefsDto {
  @IsOptional()
  @IsArray()
  @IsIn(NOTIFICATION_TYPES, { each: true })
  mutedTypes?: NotificationType[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(23)
  quietStart?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(23)
  quietEnd?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(23)
  digestHour?: number | null;
}
