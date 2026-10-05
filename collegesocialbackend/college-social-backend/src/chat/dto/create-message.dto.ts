import {
  ArrayMaxSize,
  ArrayMinSize,
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
import { MESSAGE_EFFECTS, POLL_LIMITS, type MessageEffect } from '../chat.constants';

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

// A poll as composed by the sender. ChatService re-normalizes it (trim, dedupe, clip) via
// normalizePollInput, so these decorators are the coarse outer guard, not the only one.
export class PollDto {
  @IsString()
  @MaxLength(POLL_LIMITS.questionMax)
  question: string;

  @IsArray()
  @ArrayMinSize(POLL_LIMITS.minOptions)
  @ArrayMaxSize(POLL_LIMITS.maxOptions)
  @IsString({ each: true })
  @MaxLength(POLL_LIMITS.optionMax, { each: true })
  options: string[];

  @IsOptional()
  @IsBoolean()
  multiple?: boolean;
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

  @IsOptional()
  @ValidateNested()
  @Type(() => PollDto)
  poll?: PollDto;

  // "Send with effect" -- the recipients' clients play this celebration when it lands.
  @IsOptional()
  @IsIn(MESSAGE_EFFECTS)
  effect?: MessageEffect;

  // "Send without sound" -- the message is delivered as usual but nobody gets a notification.
  @IsOptional()
  @IsBoolean()
  silent?: boolean;
}
