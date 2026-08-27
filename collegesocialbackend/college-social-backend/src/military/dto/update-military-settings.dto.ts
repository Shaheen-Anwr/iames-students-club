import { IsOptional, Matches, ValidateIf } from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateMilitarySettingsDto {
  // Accepts "HH:mm" or an explicit empty string / null to clear the value.
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(HHMM, { message: 'وقت البداية غير صالح' })
  dailyStartTime?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(HHMM, { message: 'وقت النهاية غير صالح' })
  dailyEndTime?: string | null;
}
