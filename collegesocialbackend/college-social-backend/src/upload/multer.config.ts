import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { v4 as uuid } from 'uuid';

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

// The actual per-asset ceiling the connected Cloudinary account's plan enforces on its own servers
// -- confirmed via `cloudinary.api.usage()`: media_limits = { image: 10MB, raw: 10MB, video: 100MB }
// (raw covers 'lectures'/'files'). This is the size of each individual piece when StorageService
// splits an oversized 'lectures'/'files'/'videos' upload (see its chunked upload path); for the
// categories that are never chunked (images, audio) it's also the hard overall ceiling below.
// Upgrading to a paid Cloudinary plan raises/removes these -- bump the numbers here to match.
export const CLOUDINARY_ASSET_CAP_MB: Record<UploadCategory, number> = {
  photos: 10,
  'cover-photos': 10,
  'post-images': 10,
  'chat-backgrounds': 10,
  lectures: 10,
  files: 10,
  videos: 100,
  audio: 100,
};

// Categories StorageService knows how to transparently split into multiple sub-cap Cloudinary
// assets and reconstruct on read -- see storage.service.ts. Images aren't included: splitting a
// photo into byte pieces makes no sense for direct display, so they stay hard-capped at the
// Cloudinary ceiling above. Audio isn't included either (out of scope -- 100MB is already generous
// for voice notes/lecture audio).
const CHUNKABLE_CATEGORIES: ReadonlySet<UploadCategory> = new Set(['lectures', 'files', 'videos']);

// Overall ceiling Multer accepts before StorageService even runs, each independently overridable
// via its own env var. For a chunkable category this is deliberately much higher than its Cloudinary
// asset cap above -- e.g. a 300MB scanned textbook gets split into ~30 sub-10MB PDF pieces and
// reassembled on read; a 1GB lecture recording gets split into ~10 sub-100MB video segments and
// delivered as one continuous video via a Cloudinary splice/concatenation URL. Non-chunkable
// categories keep their ceiling equal to the Cloudinary cap itself -- raising it there would just
// mean the upload transfers successfully and then Cloudinary rejects it anyway.
const SIZE_LIMIT_MB_BY_CATEGORY: Record<UploadCategory, { envKey: string; defaultMb: number }> = {
  photos: { envKey: 'MAX_PHOTO_SIZE_MB', defaultMb: CLOUDINARY_ASSET_CAP_MB.photos },
  'cover-photos': { envKey: 'MAX_COVER_PHOTO_SIZE_MB', defaultMb: CLOUDINARY_ASSET_CAP_MB['cover-photos'] },
  'post-images': { envKey: 'MAX_POST_IMAGE_SIZE_MB', defaultMb: CLOUDINARY_ASSET_CAP_MB['post-images'] },
  'chat-backgrounds': { envKey: 'MAX_CHAT_BACKGROUND_SIZE_MB', defaultMb: CLOUDINARY_ASSET_CAP_MB['chat-backgrounds'] },
  lectures: { envKey: 'MAX_LECTURE_SIZE_MB', defaultMb: 300 }, // PDF/PPT/DOC notes and scanned books -- chunked
  files: { envKey: 'MAX_GENERIC_FILE_SIZE_MB', defaultMb: 200 }, // chunked
  videos: { envKey: 'MAX_VIDEO_SIZE_MB', defaultMb: 1024 }, // lecture recordings -- chunked
  audio: { envKey: 'MAX_AUDIO_SIZE_MB', defaultMb: CLOUDINARY_ASSET_CAP_MB.audio },
};

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function maxUploadSizeMb(category: UploadCategory): number {
  const { envKey, defaultMb } = SIZE_LIMIT_MB_BY_CATEGORY[category];
  return parsePositiveInt(process.env[envKey]) ?? defaultMb;
}

export function isChunkable(category: UploadCategory): boolean {
  return CHUNKABLE_CATEGORIES.has(category);
}

// Uploads are streamed straight to a temp file on disk (StorageService.upload() then hands that
// path to Cloudinary's chunked upload_large, or moves it into local storage) instead of being
// buffered whole in process memory. A single multi-hundred-MB lecture video buffered in RAM per
// concurrent request was the real ceiling on "large file" support -- disk streaming removes it.
// Deliberately NOT os.tmpdir(): on Linux that's commonly /tmp mounted as tmpfs (RAM-backed), which
// would silently reintroduce the exact RAM-pressure problem this is meant to avoid. A directory
// under the app's own working directory sits on real disk on every platform this runs on (local,
// Render).
export const TEMP_UPLOAD_DIR = join(process.cwd(), '.tmp-uploads');
mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });

// Builds a Multer options object that streams the file to a temp file on disk (rather than
// buffering it in memory) so the controller can hand the path to StorageService after DI has
// resolved -- see upload.controller.ts and storage.service.ts. `maxFileSizeMb` defaults to this
// category's own ceiling (see SIZE_LIMIT_MB_BY_CATEGORY above); pass it explicitly only to override
// that for a specific call site.
export function buildMulterOptions(category: UploadCategory, maxFileSizeMb = maxUploadSizeMb(category)) {
  return {
    storage: diskStorage({
      destination: TEMP_UPLOAD_DIR,
      filename: (_req: any, file: any, callback: any) => {
        callback(null, `${uuid()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
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
