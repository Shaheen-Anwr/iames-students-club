import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePushPreferencesDto {
  // false -> opt out of the once-a-day morning digest push (see DigestService).
  // Stored inverted on the user as `dailyDigestOptOut`.
  @IsOptional()
  @IsBoolean()
  dailyDigest?: boolean;

  // false -> opt out of the "lecture in 15 min" push (see ScheduleReminderService).
  // Stored inverted as `classRemindersOptOut`.
  @IsOptional()
  @IsBoolean()
  classReminders?: boolean;
}
