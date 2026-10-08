import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

// The quick reactions offered on a story (the viewer's emoji row).
export const STATUS_REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥'] as const;

export class StatusReplyDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text: string;
}

export class StatusReactDto {
  @IsIn(STATUS_REACTIONS)
  emoji: (typeof STATUS_REACTIONS)[number];
}
