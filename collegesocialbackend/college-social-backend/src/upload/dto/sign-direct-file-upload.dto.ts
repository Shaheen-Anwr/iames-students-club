import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Body of POST /api/upload/file/sign -- the client already knows the file's size and name locally
// (no upload has happened yet), so it sends them here and gets back one signed ticket per part it
// will need to split the file into (see StorageService.createDirectFileUploadTicket).
export class SignDirectFileUploadDto {
  @IsInt()
  @Min(1)
  @Max(1024 * 1024 * 1024) // 1GB -- generous upper bound, StorageService enforces the real ceiling
  fileSize!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalName?: string;
}
