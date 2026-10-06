import { IsIn, IsOptional } from 'class-validator';

// Body of POST /api/upload/video/sign (and POST /api/stream/direct-upload). Empty for reels / feed
// videos; a story asks for purpose 'status' so its upload is tagged for later cleanup.
export class SignVideoUploadDto {
  @IsOptional()
  @IsIn(['status'])
  purpose?: 'status';
}
