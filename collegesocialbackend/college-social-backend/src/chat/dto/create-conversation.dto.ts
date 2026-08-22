import { ArrayMinSize, IsBoolean, IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
  @IsMongoId({ each: true })
  @ArrayMinSize(1)
  participantIds: string[];

  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;

  @IsOptional()
  @IsString()
  name?: string;
}
