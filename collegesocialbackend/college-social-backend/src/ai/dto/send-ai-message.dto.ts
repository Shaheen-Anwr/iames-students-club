import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
