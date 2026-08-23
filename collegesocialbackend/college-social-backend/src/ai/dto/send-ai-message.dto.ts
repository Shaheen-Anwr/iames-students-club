import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

class AiMessageAttachmentDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsIn(['image', 'document'])
  type: 'image' | 'document';

  @IsOptional()
  @IsString()
  mimeType?: string;
}

export class SendAiMessageDto {
  // Trimmed before validation so a whitespace-only message (e.g. "   ") is caught by
  // @IsNotEmpty below instead of slipping through as a "non-empty" string and burning a real
  // AI request.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'الرسالة لا يمكن أن تكون فارغة' })
  text: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AiMessageAttachmentDto)
  attachment?: AiMessageAttachmentDto;

  // Set when the student shares an existing feed post into the chat (e.g. via a "share with AI"
  // action on a post) -- resolved server-side into full post + comment-thread context, so the
  // student never has to know or type a raw post id themselves.
  @IsOptional()
  @IsString()
  sharedPostId?: string;
}
