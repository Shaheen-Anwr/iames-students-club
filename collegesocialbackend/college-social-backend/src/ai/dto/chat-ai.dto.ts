import { IsIn, IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export const CHAT_REWRITE_MODES = ['improve', 'formal', 'friendly', 'shorter', 'fix', 'en', 'ar'] as const;
export type ChatRewriteMode = (typeof CHAT_REWRITE_MODES)[number];

export const CHAT_TRANSLATE_TARGETS = ['ar', 'en'] as const;
export type ChatTranslateTarget = (typeof CHAT_TRANSLATE_TARGETS)[number];

// POST /ai/chat/conversations/:id/summary -- `sinceMessageId` limits the catch-up to the unread
// tail (from that message on); omitted = the recent history.
export class ChatSummaryDto {
  @IsOptional()
  @IsMongoId()
  sinceMessageId?: string;
}

export class ChatRewriteDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'اكتب نصًّا أولًا' })
  @MaxLength(2000)
  text: string;

  @IsIn(CHAT_REWRITE_MODES)
  mode: ChatRewriteMode;
}

export class ChatTranslateDto {
  @IsIn(CHAT_TRANSLATE_TARGETS)
  target: ChatTranslateTarget;
}
