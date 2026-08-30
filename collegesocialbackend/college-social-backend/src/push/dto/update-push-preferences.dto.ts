import { IsBoolean } from 'class-validator';

export class UpdatePushPreferencesDto {
  // false -> the student opts out of the once-a-day morning digest push (see DigestService).
  // Stored inverted on the user as `dailyDigestOptOut`.
  @IsBoolean()
  dailyDigest: boolean;
}
