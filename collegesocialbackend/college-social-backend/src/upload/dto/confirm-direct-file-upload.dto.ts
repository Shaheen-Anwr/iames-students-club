import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

// Body of POST /api/upload/file/confirm -- unlike video's confirm (which echoes back every
// public_id, since Cloudinary auto-assigned them), a raw file's parts are all named
// "<groupId>-part-<i>" by the signed ticket itself, so the server can re-derive and verify every
// part's public_id from just `groupId` + `partCount`. See StorageService.confirmDirectFileUpload.
export class ConfirmDirectFileUploadDto {
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-f0-9-]+$/i)
  groupId!: string;

  @IsInt()
  @Min(1)
  @Max(24)
  partCount!: number;

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
