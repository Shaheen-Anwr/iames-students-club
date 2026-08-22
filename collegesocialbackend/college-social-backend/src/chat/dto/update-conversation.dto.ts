import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  name?: string;

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
