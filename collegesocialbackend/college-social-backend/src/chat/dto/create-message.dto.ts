import {
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
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

  // End-to-end encrypted message (see docs/e2ee-design.md). When `encrypted` is true, `payload`
  // is the opaque WireEnvelope JSON and `text`/`attachments` are ignored -- the server stores and
  // relays `payload` verbatim without parsing it.
  @IsOptional()
  @IsBoolean()
  encrypted?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  payload?: string;

  // Encrypted control message (reaction/edit/delete). Only meaningful with `encrypted` + `payload`.
  // The server stores and relays it but skips preview/notification/unread side effects.
  @IsOptional()
  @IsBoolean()
  control?: boolean;
}
