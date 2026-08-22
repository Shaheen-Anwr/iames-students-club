import { IsString, MaxLength } from 'class-validator';

// Caption-only edit -- attachments/scope/course are immutable after creation, matching the "edit"
// scope Facebook itself offers on a post with a file/photo attached. Empty string is valid (e.g.
// clearing the caption off an image-only post).
export class UpdatePostDto {
  @IsString()
  @MaxLength(5000, { message: 'النص طويل جدًا' })
  caption: string;
}
