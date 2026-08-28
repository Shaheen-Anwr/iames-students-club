import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

// Body of POST /api/broadcast/release. `body` is the notification text (usually the
// `Notify-Users:` line from a commit message); the rest are optional overrides.
export class ReleaseBroadcastDto {
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  body!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  // Where the notification click lands. Defaults to the app's feed.
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  url?: string;
}
