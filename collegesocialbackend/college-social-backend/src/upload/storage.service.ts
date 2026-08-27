import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { copyFile, mkdir, readFile, rm, stat, unlink } from 'fs/promises';
import { extname, join } from 'path';
import { v4 as uuid } from 'uuid';
import { CLOUDINARY_ASSET_CAP_MB, isChunkable, UploadCategory } from './multer.config';
import { compressVideo, segmentVideo, splitFileIntoByteChunks } from './chunked-upload.util';

// Local uploads live under UPLOADS_DIR (default <repo>/uploads)/<category>/<file>, the same tree
// ServeStaticModule already exposes at /uploads/** (see app.module.ts) -- so a relative
// "/uploads/..." URL just works for both the frontend's assetUrl() (already handles relative
// paths) and this service's own getObject() read-back. On Render, UPLOADS_DIR points at the
// mounted persistent disk so files survive redeploys/restarts instead of living on the
// container's ephemeral local disk.
const LOCAL_URL_PREFIX = '/uploads/';

// Cloudinary resource_type controls how a file is stored/delivered: 'image' and 'video' get
// transformation/format support (and 'video' also covers audio -- Cloudinary has no separate
// audio type), 'raw' is opaque bytes for everything else (pdf/ppt/doc/zip/etc).
const RESOURCE_TYPE_BY_CATEGORY: Record<UploadCategory, 'image' | 'video' | 'raw'> = {
  photos: 'image',
  'cover-photos': 'image',
  'post-images': 'image',
  'chat-backgrounds': 'image',
  videos: 'video',
  audio: 'video',
  lectures: 'raw',
  files: 'raw',
};

// Longest-edge cap per image category, applied as an incoming (upload-time) transformation --
// this is what actually shrinks the *stored* master asset (and therefore Cloudinary storage-quota
// usage), as opposed to a delivery-time/URL transformation which only affects bytes sent to a
// particular viewer. Picked per use case: an avatar or chat wallpaper never needs to be huge, a
// cover photo or feed image can run a bit bigger.
const IMAGE_MAX_DIMENSION: Partial<Record<UploadCategory, number>> = {
  // 1024 (not 512): an avatar can now be opened full-frame in the app's photo viewer, and 512
  // looked soft on a high-DPR phone. q_auto:good keeps a 1024 JPEG around ~100-200KB, so the
  // storage cost is negligible. Also used by the legacy re-compression path (recompressStoredImage).
  photos: 1024,
  'cover-photos': 1600,
  'post-images': 1920,
  'chat-backgrounds': 1920,
};

// Longest-edge cap for actual video (not voice notes/audio, which have no picture to downscale).
const VIDEO_MAX_DIMENSION = 1280;

// Chunk size for cloudinary.uploader.upload_large -- Cloudinary's plain (non-chunked)
// single-request upload is capped at 100MB regardless of plan, well under this app's own
// per-category upload ceilings (e.g. videos default to 1024MB, see multer.config.ts), so a large
// lecture video/raw file would fail outright without chunked upload. upload_large transparently
// falls back to a single request for small files, so it's safe to use unconditionally.
const UPLOAD_CHUNK_SIZE_BYTES = 20 * 1024 * 1024;

// Generous per-request timeout for upload_large's chunk uploads -- the SDK's 60s default is fine
// for a small avatar but too tight for a multi-hundred-MB video on a slow connection.
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

// How many chunk parts to upload to Cloudinary at once when a file was split (see
// uploadPartsConcurrently below) -- overlaps per-request latency instead of paying it once per part
// in a row, without piling on so much concurrent bandwidth/connections that it becomes the new
// bottleneck (or trips Cloudinary's own rate limit) on an already-slow connection.
const CHUNK_UPLOAD_CONCURRENCY = 4;


// Margin below Cloudinary's actual per-asset cap when splitting an oversized upload into pieces --
// leaves headroom against off-by-one edge cases (raw byte-splitting is exact, but better safe) and,
// for video, against a segment landing slightly over its target due to keyframe-aligned cuts.
const CHUNK_SAFETY_FACTOR = 0.95;

// Cloudinary's per-asset media_limits are DECIMAL megabytes (its docs/usage API report e.g. video =
// 100_000_000 bytes = ~95.4 MiB), but CLOUDINARY_ASSET_CAP_MB is a plain "MB" number that the rest
// of this file multiplies by 1024*1024. Using the binary value to decide "is this too big for one
// asset?" left a dead zone (~95.4-100 MiB for video): a file in it wasn't big enough to trigger
// splitting, yet Cloudinary still rejected it as too large. Deciding against the decimal value --
// and with CHUNK_SAFETY_FACTOR headroom on top -- closes that gap. This is the single number used
// both to decide whether to split/compress AND as the per-piece target when we do.
function chunkThresholdBytes(category: UploadCategory): number {
  return Math.floor(CLOUDINARY_ASSET_CAP_MB[category] * 1_000_000 * CHUNK_SAFETY_FACTOR);
}

export interface UploadOutcome {
  url: string;
  // >1 when the file was too large for a single Cloudinary asset and got split -- see
  // PostsController's GET :id/attachment for how a chunked 'lecture'/'file' is reassembled on read.
  // Meaningless for 'video' (the returned url is already a complete Cloudinary splice/concatenation
  // URL that plays every piece as one continuous video -- no further reconstruction needed).
  chunkCount: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly configured: boolean;
  private readonly localUploadsRoot: string;

  constructor(private readonly config: ConfigService) {
    this.localUploadsRoot = this.config.get<string>('uploadsDir') ?? join(process.cwd(), 'uploads');
    const cloudName = this.config.get<string>('cloudinary.cloudName') ?? '';
    const apiKey = this.config.get<string>('cloudinary.apiKey') ?? '';
    const apiSecret = this.config.get<string>('cloudinary.apiSecret') ?? '';

    this.configured = Boolean(cloudName && apiKey && apiSecret);
    if (!this.configured) {
      this.logger.warn('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET) -- falling back to local disk storage under ./uploads.');
    } else {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    }
  }

  // `file` is a disk-backed Multer file (see multer.config.ts's diskStorage) -- its bytes were
  // already streamed to a temp file rather than buffered in memory. The temp file (and any split
  // pieces) are always removed afterward, success or failure.
  async upload(file: Express.Multer.File, category: UploadCategory): Promise<UploadOutcome> {
    const { path: tempPath, originalname: originalName, size } = file;
    const workDir = `${tempPath}-parts`;

    try {
      if (!this.configured) {
        const filename = `${uuid()}${extname(originalName).toLowerCase()}`;
        const dir = join(this.localUploadsRoot, category);
        await mkdir(dir, { recursive: true });
        await copyFile(tempPath, join(dir, filename));
        return { url: `${LOCAL_URL_PREFIX}${category}/${filename}`, chunkCount: 1 };
      }

      const resourceType = RESOURCE_TYPE_BY_CATEGORY[category];
      const threshold = chunkThresholdBytes(category);

      if (size > threshold && isChunkable(category)) {
        return resourceType === 'video'
          ? await this.uploadChunkedVideo(tempPath, workDir, category, threshold)
          : await this.uploadChunkedRaw(tempPath, workDir, category, originalName, threshold);
      }

      const result = await this.uploadSingleAsset(tempPath, category, resourceType, originalName);
      return { url: result.secure_url, chunkCount: 1 };
    } finally {
      await unlink(tempPath).catch(() => {});
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // Splits an oversized raw file (PDF/PPT/DOC/generic) into sequential byte-range pieces, each
  // under Cloudinary's raw asset cap, uploaded as separate 'raw' assets named "<group>-part-0",
  // "-part-1", etc. Concatenating them back together in order (PostsController's GET :id/attachment)
  // reproduces the original file exactly.
  private async uploadChunkedRaw(
    tempPath: string,
    workDir: string,
    category: UploadCategory,
    originalName: string,
    targetPieceBytes: number,
  ): Promise<UploadOutcome> {
    const partPaths = await splitFileIntoByteChunks(tempPath, targetPieceBytes, workDir);
    const groupId = uuid();
    const uploaded = await this.uploadPartsConcurrently(partPaths, category, 'raw', originalName, groupId);

    this.logger.log(`Split oversized "${category}" upload into ${uploaded.length} raw parts (group ${groupId}).`);
    return { url: uploaded[0].secure_url, chunkCount: uploaded.length };
  }

  // Handles a video too large for a single Cloudinary asset in up to three steps:
  //   1. Re-encode the whole file once (smaller resolution + CRF, see compressVideo). This alone
  //      usually brings a "just over the cap" phone/screen recording well under it.
  //   2. If the re-encoded result fits in one asset, upload it as a plain single asset -- its
  //      secure_url plays in any <video> tag with no splice/reconstruction.
  //   3. Only if it's STILL too big (very long or very high-motion source) fall back to segmenting
  //      the already-compressed file with ffmpeg and returning ONE synthesized delivery URL that
  //      splices every piece into a single continuous video (Cloudinary's fl_splice, verified
  //      against this account) -- again no custom multi-segment player needed on read.
  private async uploadChunkedVideo(
    tempPath: string,
    workDir: string,
    category: UploadCategory,
    targetPieceBytes: number,
  ): Promise<UploadOutcome> {
    let sourcePath = tempPath;
    let sourceSize = (await stat(tempPath)).size;

    try {
      const compressed = await compressVideo(tempPath, join(workDir, 'compressed'));
      if (compressed.sizeBytes > 0 && compressed.sizeBytes < sourceSize) {
        this.logger.log(
          `Compressed "${category}" video from ~${Math.round(sourceSize / 1_000_000)}MB to ~${Math.round(compressed.sizeBytes / 1_000_000)}MB before upload.`,
        );
        sourcePath = compressed.path;
        sourceSize = compressed.sizeBytes;
      }
    } catch (error) {
      // Compression is an optimisation, not a requirement -- a codec ffmpeg can't decode, an
      // ffmpeg crash, etc. just means we upload/segment the original bytes as before.
      this.logger.warn(`Video pre-compression failed, using the original instead: ${(error as Error)?.message ?? String(error)}`);
    }

    if (sourceSize <= targetPieceBytes) {
      const result = await this.uploadSingleAsset(sourcePath, category, 'video', 'video.mp4');
      return { url: result.secure_url, chunkCount: 1 };
    }

    const partPaths = await segmentVideo(sourcePath, targetPieceBytes, join(workDir, 'segments'));
    const groupId = uuid();
    // The name arg is a constant here (not partPaths[i]'s name) -- ffmpeg always writes segments as
    // .mp4 (see chunked-upload.util.ts), and video format is auto-detected from bytes, not forced.
    const uploaded = await this.uploadPartsConcurrently(partPaths, category, 'video', 'segment.mp4', groupId);

    const spliceUrl = cloudinary.url(uploaded[0].public_id, {
      resource_type: 'video',
      format: 'mp4',
      transformation: uploaded.slice(1).map((part) => ({ overlay: { resource_type: 'video', public_id: part.public_id }, flags: 'splice' })),
    });

    this.logger.log(`Split oversized "${category}" upload into ${uploaded.length} video segments spliced into one delivery URL (group ${groupId}).`);
    return { url: spliceUrl, chunkCount: uploaded.length };
  }

  private async cleanupPartialUpload(uploaded: UploadApiResponse[], resourceType: 'raw' | 'video'): Promise<void> {
    await Promise.all(
      uploaded.map((r) => new Promise<void>((resolve) => cloudinary.uploader.destroy(r.public_id, { resource_type: resourceType }, () => resolve()))),
    );
  }

  // Uploads every chunk part with limited concurrency instead of one at a time -- on a slow/high-
  // latency connection (confirmed directly: sequential parts pushed a modest multi-part upload well
  // past the dev proxy's patience, surfacing as a misleading "socket hang up" even though the
  // backend was still working and would have finished fine) this meaningfully cuts total wall-clock
  // time by overlapping each part's network latency instead of paying it N times in a row. Upload
  // order doesn't need to match part order for correctness -- every part's name ("<group>-part-<i>")
  // is fixed upfront, so results just need to land back in the right array slot, not complete in
  // sequence. Stops handing out new work after the first failure (in-flight requests still finish on
  // their own) and cleans up whatever did succeed before re-throwing.
  private async uploadPartsConcurrently(
    partPaths: string[],
    category: UploadCategory,
    resourceType: 'raw' | 'video',
    originalName: string,
    groupId: string,
  ): Promise<UploadApiResponse[]> {
    const uploaded: UploadApiResponse[] = new Array(partPaths.length);
    let firstError: unknown;
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < partPaths.length) {
        if (firstError) return;
        const i = nextIndex++;
        try {
          uploaded[i] = await this.uploadSingleAsset(partPaths[i], category, resourceType, originalName, `${groupId}-part-${i}`);
        } catch (error) {
          firstError ??= error;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CHUNK_UPLOAD_CONCURRENCY, partPaths.length) }, worker));

    if (firstError) {
      await this.cleanupPartialUpload(uploaded.filter(Boolean), resourceType);
      throw firstError;
    }
    return uploaded;
  }

  // Uploads one already-sized-appropriately file to Cloudinary. `publicId`, when given, names the
  // asset explicitly (used for chunk parts, so their names are predictable/derivable -- see
  // PostsController's GET :id/attachment and the splice URL built in uploadChunkedVideo above);
  // omitted for a normal single-asset upload, letting Cloudinary auto-generate one.
  private async uploadSingleAsset(
    filePath: string,
    category: UploadCategory,
    resourceType: 'image' | 'video' | 'raw',
    originalName: string,
    publicId?: string,
  ): Promise<UploadApiResponse> {
    // 'raw' uploads skip Cloudinary's content-based format detection, so the original extension
    // must be passed explicitly or the delivered file loses it (e.g. a lecture PDF served with no
    // ".pdf" in the URL). 'image'/'video' detect format from the actual bytes, so leave those alone.
    const ext = extname(originalName).replace('.', '').toLowerCase();
    // Incoming (upload-time) transformation -- Cloudinary stores the *transformed* result as the
    // asset's master version, so this is what actually keeps free-tier storage usage down. 'raw'
    // (PDF/office/zip/etc) has no Cloudinary compression support and is stored byte-for-byte.
    const transformation =
      resourceType === 'image'
        ? [{ width: IMAGE_MAX_DIMENSION[category] ?? 1920, height: IMAGE_MAX_DIMENSION[category] ?? 1920, crop: 'limit' }, { quality: 'auto:good', fetch_format: 'auto' }]
        : resourceType === 'video' && category === 'videos'
          ? [{ width: VIDEO_MAX_DIMENSION, height: VIDEO_MAX_DIMENSION, crop: 'limit' }, { quality: 'auto' }]
          : resourceType === 'video'
            ? [{ quality: 'auto' }] // audio (Cloudinary has no separate audio resource type)
            : undefined;
    try {
      // NOTE: despite its .d.ts claiming `Promise<UploadApiResponse> | UploadStream`,
      // upload_large in the installed cloudinary version is callback-only when given no
      // callback it silently returns a plain stream/undefined, not a Promise (verified by
      // testing directly against this project's Cloudinary account).
      return await new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader.upload_large(
          filePath,
          {
            resource_type: resourceType,
            folder: category,
            chunk_size: UPLOAD_CHUNK_SIZE_BYTES,
            // The SDK's default per-request timeout (60s) is tuned for small files -- a large
            // lecture video on a slow/mobile connection can legitimately take several minutes per
            // chunk, and that shouldn't be mistaken for a hung/failed request.
            timeout: UPLOAD_TIMEOUT_MS,
            ...(publicId ? { public_id: publicId } : {}),
            ...(resourceType === 'raw' && ext ? { format: ext } : {}),
            ...(transformation ? { transformation } : {}),
          },
          (error, uploadResult) => (error || !uploadResult ? reject(error) : resolve(uploadResult)),
        );
      });
    } catch (error) {
      // Cloudinary rejects e.g. a corrupted/truncated file, an unsupported codec, or (most
      // commonly here) the account plan's own media_limits (confirmed via cloudinary.api.usage():
      // this free-tier account caps image/raw at 10MB and video at 100MB, independent of anything
      // configured in multer.config.ts) -- without this, any of that was an unhandled promise
      // rejection, surfacing to the client as a bare, unhelpful 500 ("حدث خطأ في الخادم") instead
      // of telling them what actually went wrong. Reaching this for the size case specifically means
      // either a chunk's target size drifted above the real cap (see CHUNK_SAFETY_FACTOR) or this ran
      // against a non-chunkable category -- report it plainly rather than the generic "corrupted
      // file" message, which would be actively misleading.
      const cloudinaryMessage = (error as Error)?.message ?? String(error);
      this.logger.error(`Cloudinary upload failed for category "${category}": ${cloudinaryMessage}`);
      const isTooLarge = /too large|maximum is/i.test(cloudinaryMessage);
      throw new BadRequestException(
        isTooLarge
          ? 'حجم الملف أكبر من الحد المسموح به لهذا النوع من الملفات في خطة التخزين الحالية.'
          : 'تعذّر رفع الملف، تأكد من أن الملف غير تالف وحاول مرة أخرى',
      );
    }
  }

  // Fetches raw bytes back for a previously-uploaded file, given its stored URL (Cloudinary URL or
  // local "/uploads/..." path, as stored on Post.attachmentUrl/Assignment.attachmentUrl) -- used
  // by LectureIndexService to re-read a lecture file's content for text extraction. Returns null
  // if the URL doesn't match a resolvable location (never throws -- indexing is best-effort).
  async getObject(url: string): Promise<Buffer | null> {
    if (url.startsWith(LOCAL_URL_PREFIX)) {
      try {
        return await readFile(join(this.localUploadsRoot, url.slice(LOCAL_URL_PREFIX.length)));
      } catch {
        return null;
      }
    }

    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  // One-off legacy backfill (see src/scripts/compress-legacy-images.ts): re-uploads an existing
  // Cloudinary *image* over itself with this category's size cap applied as an incoming
  // transformation, so the STORED master shrinks and stops counting full-size against the
  // free-tier storage quota. Deliberately does NOT apply fetch_format here -- that would change
  // the asset's stored format/extension and could break URLs already saved in the DB; format
  // modernization happens at delivery time instead (frontend lib/images.ts::cldOptimize).
  // `invalidate: true` purges the old CDN copy; the 'legacy-compressed' tag lets the script skip
  // assets it already processed. Returns null when Cloudinary isn't configured; returns a
  // `skippedReason` (no re-upload) for an animated GIF, where re-encoding risks surprises and the
  // storage win is marginal. Throws on a real Cloudinary error so the script can count failures.
  async recompressStoredImage(
    publicId: string,
    category: UploadCategory,
  ): Promise<{ beforeBytes: number; afterBytes: number; version: number; skippedReason?: string } | null> {
    if (!this.configured) return null;

    const before = await cloudinary.api.resource(publicId, { resource_type: 'image' });
    if (before.format === 'gif' && (before.pages ?? 1) > 1) {
      return { beforeBytes: before.bytes, afterBytes: before.bytes, version: before.version, skippedReason: 'animated-gif' };
    }

    const cap = IMAGE_MAX_DIMENSION[category] ?? 1920;
    const sourceUrl = cloudinary.url(publicId, {
      resource_type: 'image',
      secure: true,
      version: before.version,
      format: before.format,
    });

    const result = await cloudinary.uploader.upload(sourceUrl, {
      public_id: publicId,
      resource_type: 'image',
      type: 'upload',
      overwrite: true,
      invalidate: true,
      transformation: [{ width: cap, height: cap, crop: 'limit' }, { quality: 'auto:good' }],
      tags: ['legacy-compressed'],
    });

    return { beforeBytes: before.bytes, afterBytes: result.bytes, version: result.version };
  }
}
