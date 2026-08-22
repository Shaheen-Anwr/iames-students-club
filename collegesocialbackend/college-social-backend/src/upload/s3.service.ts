import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly region: string;
  private readonly localUploadsRoot: string;

  constructor(private readonly config: ConfigService) {
    this.localUploadsRoot = this.config.get<string>('uploadsDir') ?? join(process.cwd(), 'uploads');
    this.region = this.config.get<string>('aws.region') ?? '';
    this.bucket = this.config.get<string>('aws.bucket') ?? '';
    const accessKeyId = this.config.get<string>('aws.accessKeyId') ?? '';
    const secretAccessKey = this.config.get<string>('aws.secretAccessKey') ?? '';

    // S3Client's constructor throws synchronously if region is empty, and Nest instantiates
    // providers eagerly at boot -- so an unconfigured bucket must not construct the client at
    // all, or the whole app fails to start. Uploads fall back to local disk storage (below)
    // until real AWS_* env vars are set, so the app is usable out of the box in dev.
    if (!this.region || !this.bucket || !accessKeyId || !secretAccessKey) {
      this.logger.warn('AWS S3 is not configured (AWS_REGION/AWS_S3_BUCKET/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) -- falling back to local disk storage under ./uploads.');
      this.client = null;
    } else {
      this.client = new S3Client({ region: this.region, credentials: { accessKeyId, secretAccessKey } });
    }
  }

  async upload(buffer: Buffer, category: UploadCategory, mimetype: string, originalName: string): Promise<string> {
    const filename = `${uuid()}${extname(originalName).toLowerCase()}`;

    if (!this.client) {
      const dir = join(this.localUploadsRoot, category);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, filename), buffer);
      return `${LOCAL_URL_PREFIX}${category}/${filename}`;
    }

    const key = `${category}/${filename}`;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: mimetype }),
    );
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  // Fetches raw bytes back for a previously-uploaded file, given its stored URL (full S3 URL or
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

    if (!this.client) return null;
    const prefix = `https://${this.bucket}.s3.${this.region}.amazonaws.com/`;
    if (!url.startsWith(prefix)) return null;
    const key = url.slice(prefix.length);

    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = result.Body;
    if (!body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
