import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SharePostDto {
  // Optional commentary the sharer adds above the embedded original post.
  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'النص طويل جدًا' })
  caption?: string;
}
