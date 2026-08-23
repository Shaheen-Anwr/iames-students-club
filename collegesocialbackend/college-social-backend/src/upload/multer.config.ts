import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

export type UploadCategory = 'photos' | 'cover-photos' | 'post-images' | 'lectures' | 'files' | 'videos' | 'audio' | 'chat-backgrounds';

const ALLOWED_MIME_BY_CATEGORY: Record<UploadCategory, RegExp> = {
  photos: /^image\/(jpe?g|png|webp|gif)$/,
  'cover-photos': /^image\/(jpe?g|png|webp|gif)$/,
  'post-images': /^image\/(jpe?g|png|webp|gif)$/,
  'chat-backgrounds': /^image\/(jpe?g|png|webp|gif)$/,
  lectures: /^(application\/pdf|application\/vnd\.(openxmlformats|ms-powerpoint|ms-excel).*|application\/msword|text\/plain)$/,
  files: /.*/, // any file type is allowed for the generic "files" category
  videos: /^video\/(mp4|quicktime|x-matroska|webm)$/,
  // Covers both regular audio files and recorded voice notes (MediaRecorder typically emits webm/ogg).
  audio: /^audio\/(mpeg|mp4|wav|webm|ogg|x-m4a)$/,
};

// NOTE: Nest evaluates @UseInterceptors(FileInterceptor(...)) decorator arguments at module-load
// time, before dependency injection runs, so we can't pull these values from ConfigService here.
// We read them straight from process.env (same source ConfigService uses) with sane defaults.
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB ?? '200', 10);

// Builds a Multer options object that buffers the file in memory (rather than writing to local
// disk) so the controller can hand the buffer to S3Service after DI has resolved -- see
// upload.controller.ts and s3.service.ts.
export function buildMulterOptions(category: UploadCategory, maxFileSizeMb = MAX_FILE_SIZE_MB) {
  return {
    storage: memoryStorage(),
    limits: {
      fileSize: maxFileSizeMb * 1024 * 1024,
    },
    fileFilter: (_req: any, file: any, callback: any) => {
      const pattern = ALLOWED_MIME_BY_CATEGORY[category];
      if (!pattern.test(file.mimetype)) {
        return callback(new BadRequestException(`نوع الملف غير مدعوم لهذا القسم (${file.mimetype})`), false);
      }
      callback(null, true);
    },
  };
}
