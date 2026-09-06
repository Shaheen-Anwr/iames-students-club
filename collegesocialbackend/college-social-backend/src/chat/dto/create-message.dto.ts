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

  // From the upload response's `chunkCount` field -- >1 when the file was too large for a single
  // Cloudinary asset and got split (see StorageService.upload()'s chunked path).
  @IsOptional()
  @IsNumber()
  chunkCount?: number;
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
