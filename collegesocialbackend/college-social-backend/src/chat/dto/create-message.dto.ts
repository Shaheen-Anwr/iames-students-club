import { IsArray, IsIn, IsMongoId, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AttachmentDto {
  @IsString()
  url: string;

  @IsIn(['image', 'video', 'audio', 'voice', 'document'])
  type: 'image' | 'video' | 'audio' | 'voice' | 'document';

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  size?: number;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsNumber()
  duration?: number;
}

export class CreateMessageDto {
  @IsMongoId()
  conversationId: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  @IsOptional()
  @IsMongoId()
  replyTo?: string;
}
