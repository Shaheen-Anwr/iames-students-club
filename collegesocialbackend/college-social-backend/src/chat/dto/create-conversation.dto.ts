import { ArrayMinSize, IsBoolean, IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
  // May be empty for a public group (created with no members pre-added). The service still
  // requires at least one other participant for a 1-to-1 / private conversation.
  @IsMongoId({ each: true })
  @ArrayMinSize(0)
  participantIds: string[];

  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;

  @IsOptional()
  @IsString()
  name?: string;

  // 'public' forces isGroup = true and makes the group visible to every user.
  @IsOptional()
  @IsIn(['private', 'public'])
  visibility?: 'private' | 'public';
}
