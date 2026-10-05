import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

// PATCH /users/me/chat-prefs -- the chat's personal switches (profile > الدردشة).
export class UpdateChatPrefsDto {
  // Show 🔥 chat streaks (opt-in).
  @IsOptional()
  @IsBoolean()
  chatStreaksEnabled?: boolean;

  // The evening "what you missed in your groups" push (on by default).
  @IsOptional()
  @IsBoolean()
  eveningDigest?: boolean;
}

// POST/DELETE /users/me/stickers -- one sticker image by URL.
export class StickerDto {
  @IsString()
  @MaxLength(600)
  url: string;
}
