import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Body of POST /api/reels. Two upload paths land here:
//  - the normal one sends `publicIds` (the Cloudinary asset id(s) the browser pushed directly),
//    and the server confirms + derives the canonical URL and true duration itself;
//  - the fallback (direct upload unavailable) sends a pre-confirmed `videoUrl` from the multipart
//    /upload/video route, plus the client-measured `durationSec`.
export class CreateReelDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  publicIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  videoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caption?: string;

  // Client-measured seconds -- authoritative only on the fallback path; on the publicIds path the
  // server overrides it with Cloudinary's own value. Capped at 61 to allow rounding slack.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(61)
  durationSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  chunkCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;

  @IsOptional()
  @IsString()
  @MaxLength(127)
  mimeType?: string;
}
