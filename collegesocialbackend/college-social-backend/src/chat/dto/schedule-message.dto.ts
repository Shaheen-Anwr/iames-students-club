import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MESSAGE_EFFECTS, type MessageEffect } from '../chat.constants';
import { AttachmentDto, PollDto } from './create-message.dto';

// POST /chat/conversations/:id/scheduled -- everything a live send accepts, plus when to send it.
export class ScheduleMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
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

  @IsOptional()
  @IsIn(MESSAGE_EFFECTS)
  effect?: MessageEffect;

  @IsOptional()
  @IsBoolean()
  silent?: boolean;

  @IsISO8601()
  sendAt: string;
}
