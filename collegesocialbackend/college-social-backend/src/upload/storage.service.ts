import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { v4 as uuid } from 'uuid';
import { UploadCategory } from './multer.config';

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

  async upload(buffer: Buffer, category: UploadCategory, mimetype: string, originalName: string): Promise<string> {
    if (!this.configured) {
      const filename = `${uuid()}${extname(originalName).toLowerCase()}`;
      const dir = join(this.localUploadsRoot, category);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, filename), buffer);
      return `${LOCAL_URL_PREFIX}${category}/${filename}`;
    }

    const resourceType = RESOURCE_TYPE_BY_CATEGORY[category];
    // 'raw' uploads skip Cloudinary's content-based format detection, so the original extension
    // must be passed explicitly or the delivered file loses it (e.g. a lecture PDF served with no
    // ".pdf" in the URL). 'image'/'video' detect format from the actual bytes, so leave those alone.
    const ext = extname(originalName).replace('.', '').toLowerCase();
    let result: UploadApiResponse;
    try {
      result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            folder: category,
            ...(resourceType === 'raw' && ext ? { format: ext } : {}),
          },
          (error, uploadResult) => (error || !uploadResult ? reject(error) : resolve(uploadResult)),
        );
        stream.end(buffer);
      });
    } catch (error) {
      // Cloudinary rejects e.g. a corrupted/truncated file or an unsupported codec -- without this,
      // that rejection was an unhandled promise rejection, surfacing to the client as a bare,
      // unhelpful 500 ("حدث خطأ في الخادم") instead of telling them what actually went wrong.
      this.logger.error(`Cloudinary upload failed for category "${category}": ${(error as Error)?.message ?? error}`);
      throw new BadRequestException('تعذّر رفع الملف، تأكد من أن الملف غير تالف وحاول مرة أخرى');
    }
    return result.secure_url;
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
}
