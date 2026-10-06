import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const API = 'https://api.cloudflare.com/client/v4';
const UID_RE = /^[0-9a-f]{32}$/i;

interface StreamConfig {
  accountId: string;
  apiToken: string;
  customerSubdomain: string; // host only, e.g. customer-xxxx.cloudflarestream.com
}

export interface StreamStatus {
  uid: string;
  ready: boolean;
  durationSec: number;
  playbackUrl: string; // HLS manifest (.m3u8)
  thumbnailUrl: string;
  /** Who requested the upload (set from the JWT at direct-upload time), null on older videos. */
  creator: string | null;
  /** meta.name -- story uploads carry `${STATUS_VIDEO_NAME}:<userId>` so they can be swept. */
  name: string | null;
}

// Name prefix for story videos -- what sweepVideos() searches for. Reels carry no name.
export const STATUS_VIDEO_NAME = 'chat-status';

// Cloudflare Stream integration -- video hosting + adaptive HLS, used for new reels when
// configured (CF_STREAM_*). Talks to the Stream REST API with a Bearer token; the browser
// uploads the file bytes straight to Stream via the one-time tus URL from createDirectUpload(),
// never through this server. All methods no-op / throw a 503 when Stream isn't configured, so the
// reels flow transparently falls back to Cloudinary.
@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private readonly cfg: StreamConfig | null;

  constructor(config: ConfigService) {
    const accountId = config.get<string>('stream.accountId') ?? '';
    const apiToken = config.get<string>('stream.apiToken') ?? '';
    const customerSubdomain = config.get<string>('stream.customerSubdomain') ?? '';
    this.cfg = accountId && apiToken && customerSubdomain ? { accountId, apiToken, customerSubdomain } : null;
    if (!this.cfg) {
      this.logger.warn('Cloudflare Stream not configured (CF_STREAM_*) -- reels fall back to Cloudinary.');
    }
  }

  get isConfigured(): boolean {
    return this.cfg !== null;
  }

  private assert(): StreamConfig {
    if (!this.cfg) throw new ServiceUnavailableException('رفع الفيديو عبر Cloudflare Stream غير مُفعّل');
    return this.cfg;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.cfg!.apiToken}`, 'Content-Type': 'application/json' };
  }

  playbackUrl(uid: string): string {
    return `https://${this.assert().customerSubdomain}/${uid}/manifest/video.m3u8`;
  }

  thumbnailUrl(uid: string): string {
    return `https://${this.assert().customerSubdomain}/${uid}/thumbnails/thumbnail.jpg`;
  }

  // A one-time upload URL (tus endpoint) the browser pushes the file to, plus the video uid.
  // maxDurationSeconds is enforced by Stream itself -- a longer upload is rejected on their side.
  async createDirectUpload(
    maxDurationSeconds = 60,
    tag: { creator?: string; name?: string } = {},
  ): Promise<{ uploadURL: string; uid: string }> {
    const cfg = this.assert();
    let json: { success?: boolean; result?: { uploadURL: string; uid: string }; errors?: unknown };
    try {
      const res = await fetch(`${API}/accounts/${cfg.accountId}/stream/direct_upload`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          maxDurationSeconds,
          requireSignedURLs: false,
          ...(tag.creator ? { creator: tag.creator } : {}),
          ...(tag.name ? { meta: { name: tag.name } } : {}),
        }),
      });
      json = (await res.json()) as typeof json;
      if (!res.ok || !json.success || !json.result?.uploadURL) {
        this.logger.warn(`Stream direct_upload failed: ${JSON.stringify(json.errors ?? json)}`);
        throw new ServiceUnavailableException('تعذّر بدء رفع الفيديو');
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn(`Stream direct_upload error: ${(err as Error).message}`);
      throw new ServiceUnavailableException('تعذّر الاتصال بخدمة الفيديو');
    }
    return { uploadURL: json.result.uploadURL, uid: json.result.uid };
  }

  async getStatus(uidRaw: string): Promise<StreamStatus> {
    const cfg = this.assert();
    const uid = (uidRaw ?? '').trim();
    if (!UID_RE.test(uid)) throw new BadRequestException('معرّف فيديو غير صالح');

    let json: {
      success?: boolean;
      result?: { readyToStream?: boolean; duration?: number; creator?: string | null; meta?: { name?: string } };
    };
    try {
      const res = await fetch(`${API}/accounts/${cfg.accountId}/stream/${uid}`, { headers: this.headers() });
      json = (await res.json()) as typeof json;
      if (!res.ok || !json.success || !json.result) {
        throw new ServiceUnavailableException('تعذّر التحقق من حالة الفيديو');
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn(`Stream status error for ${uid}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('تعذّر التحقق من حالة الفيديو');
    }

    return {
      uid,
      ready: json.result.readyToStream === true,
      durationSec: Math.max(0, Math.round(json.result.duration ?? 0)),
      playbackUrl: this.playbackUrl(uid),
      thumbnailUrl: this.thumbnailUrl(uid),
      creator: json.result.creator ?? null,
      name: json.result.meta?.name ?? null,
    };
  }

  // Deletes every story video (meta.name starting with STATUS_VIDEO_NAME) created more than
  // `olderThanMs` ago -- expired stories and abandoned uploads alike. Never throws.
  async sweepStatusVideos(olderThanMs: number): Promise<number> {
    if (!this.cfg) return 0;
    try {
      const res = await fetch(`${API}/accounts/${this.cfg.accountId}/stream?search=${encodeURIComponent(STATUS_VIDEO_NAME)}`, {
        headers: this.headers(),
      });
      const json = (await res.json()) as { success?: boolean; result?: { uid: string; created: string; meta?: { name?: string } }[] };
      if (!res.ok || !json.success) return 0;
      const cutoff = Date.now() - olderThanMs;
      const stale = (json.result ?? []).filter(
        (video) => video.meta?.name?.startsWith(`${STATUS_VIDEO_NAME}:`) && Date.parse(video.created) < cutoff,
      );
      for (const video of stale) await this.deleteVideo(video.uid);
      return stale.length;
    } catch (err) {
      this.logger.warn(`Stream story-video sweep failed: ${(err as Error).message}`);
      return 0;
    }
  }

  // Best-effort cleanup when a Stream-hosted reel is deleted. Never throws.
  async deleteVideo(uid: string): Promise<void> {
    if (!this.cfg || !UID_RE.test(uid ?? '')) return;
    try {
      await fetch(`${API}/accounts/${this.cfg.accountId}/stream/${uid}`, {
        method: 'DELETE',
        headers: this.headers(),
      });
    } catch {
      /* ignore */
    }
  }
}
