import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateChatStatusDto {
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(600)
  text?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string;

  // A video story names its upload, never a URL: the Cloudinary direct-upload public id(s) or the
  // Cloudflare Stream uid. The server checks it is this user's own story upload before using it
  // (and deleting it once the story is gone).
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  publicIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  streamUid?: string;
}
