'use client';

// Stories ("الحالات") -- shared types plus the video upload. Same paths as reels (lib/reels.ts):
// Cloudflare Stream when enabled, otherwise the direct browser -> Cloudinary upload. Every upload
// asks for purpose 'status', so the server only accepts this user's own story upload and deletes
// it once the story is gone. Big phone videos are first shrunk in the browser (~720p), which makes
// posting on mobile data far quicker. No server-route fallback: /upload/video is staff-only.

import { api, ApiError } from './api';
import { DirectUploadUnavailableError, uploadVideoDirect, type DirectUploadTicket } from './cloudinary-upload';
import { maybeCompressVideo } from './video-compress';

export interface ChatStatus {
  _id: string;
  author: { _id: string; name: string; photoUrl: string | null } | null;
  text: string;
  imageUrl: string | null;
  /** HLS manifest (Stream) or MP4 (Cloudinary). */
  videoUrl?: string | null;
  videoProvider?: 'cloudinary' | 'stream' | null;
  posterUrl?: string | null;
  durationSec?: number | null;
  createdAt: string;
  expiresAt: string;
}

export const STATUS_VIDEO_MAX_SEC = 60;

export type StatusUploadPhase = 'preparing' | 'uploading' | 'processing';

function streamEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_STREAM_ENABLED && process.env.NEXT_PUBLIC_STREAM_ENABLED !== '0';
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export async function postVideoStatus({
  file,
  text,
  onProgress,
  signal,
}: {
  file: File;
  text: string;
  onProgress?: (phase: StatusUploadPhase, percent: number) => void;
  signal?: AbortSignal;
}): Promise<ChatStatus> {
  onProgress?.('preparing', 0);
  const { file: upload } = await maybeCompressVideo(file, {
    minBytesToBother: 12 * 1024 * 1024,
    onProgress: (fraction) => onProgress?.('preparing', Math.round(fraction * 100)),
    signal,
  });
  const body = { text: text || undefined };

  if (streamEnabled()) {
    try {
      const { uploadToStream } = await import('./stream-upload');
      const video = await uploadToStream(upload, {
        purpose: 'status',
        signal,
        onProgress: (percent) => onProgress?.(percent >= 90 ? 'processing' : 'uploading', percent),
      });
      return await api.post<ChatStatus>('/chat/statuses', { ...body, streamUid: video.uid });
    } catch (err) {
      if (isAbort(err)) throw err;
      // 503 = Stream isn't set up on this server -- fall through to Cloudinary. Anything else
      // (moderation, the 5-a-day limit, a failed upload) is a real answer for the user.
      if (!(err instanceof ApiError && err.status === 503)) throw err;
    }
  }

  try {
    return await uploadVideoDirect<ChatStatus>(upload, {
      sign: () => api.post<DirectUploadTicket>('/upload/video/sign', { purpose: 'status' }),
      confirm: (publicIds) => api.post<ChatStatus>('/chat/statuses', { ...body, publicIds }),
      onProgress: (percent) => onProgress?.('uploading', percent),
      signal,
    });
  } catch (err) {
    if (err instanceof DirectUploadUnavailableError) {
      throw new Error('تعذّر رفع هذا الفيديو من متصفحك. جرّب فيديو أقصر أو أصغر حجمًا.');
    }
    throw err;
  }
}
