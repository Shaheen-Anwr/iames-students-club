import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  name?: string;

  // Lets a group admin flip an existing group between invite-only and public.
  @IsOptional()
  @IsIn(['private', 'public'])
  visibility?: 'private' | 'public';

  @IsOptional()
  @IsString()
  groupDescription?: string;

  @IsOptional()
  @IsString()
  groupIcon?: string;

  // Seconds; 0 disables disappearing messages.
  @IsOptional()
  @IsInt()
  @Min(0)
  disappearingSeconds?: number;
}
