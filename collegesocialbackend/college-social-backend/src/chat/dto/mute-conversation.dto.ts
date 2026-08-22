import { IsInt, IsOptional, Min } from 'class-validator';

export class MuteConversationDto {
  // Minutes to mute for; omit for "mute indefinitely".
  @IsOptional()
  @IsInt()
  @Min(1)
  minutes?: number;
}
