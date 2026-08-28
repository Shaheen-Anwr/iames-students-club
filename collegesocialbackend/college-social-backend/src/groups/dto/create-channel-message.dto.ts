import { IsArray, IsMongoId, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AttachmentDto } from '../../chat/dto/create-message.dto';

export class CreateChannelMessageDto {
  @IsMongoId()
  channelId: string;

  @IsOptional()
  @IsString()
  text?: string;

  // Legacy single-attachment field, still accepted for older clients.
  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  @IsOptional()
  @IsMongoId()
  replyTo?: string;
}
