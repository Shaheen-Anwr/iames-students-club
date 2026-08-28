import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// Body of POST /api/upload/video/confirm -- the ordered Cloudinary public_ids the browser uploaded
// directly (one for a normal video, several when the client split an oversized one into segments),
// plus a few original-file hints echoed straight back in the response so call sites keep the same
// shape they got from the multipart route.
export class ConfirmDirectUploadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  publicIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;

  @IsOptional()
  @IsString()
  @MaxLength(127)
  mimeType?: string;
}
