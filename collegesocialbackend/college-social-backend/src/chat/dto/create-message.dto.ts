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

// Item kinds a client may share as a card (the 'status' card is only ever built server-side, by a
// status reply).
export const SHAREABLE_CARD_KINDS = ['post', 'assignment', 'event', 'listing'] as const;

export class AttachmentDto {
  @IsString()
  url: string;

  @IsIn(['image', 'video', 'audio', 'voice', 'document', 'sticker'])
  type: 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker';

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

// A platform item to share as a card. Only the reference travels; ChatCardsService builds the
// card's title/subtitle/link from the real document (and checks the sender may see it).
export class CardRefDto {
  @IsIn(SHAREABLE_CARD_KINDS)
  kind: (typeof SHAREABLE_CARD_KINDS)[number];

  @IsMongoId()
  refId: string;
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

  @IsOptional()
  @ValidateNested()
  @Type(() => CardRefDto)
  card?: CardRefDto;

  // Post this message as a reply inside that message's thread (group chats).
  @IsOptional()
  @IsMongoId()
  threadRoot?: string;
}
