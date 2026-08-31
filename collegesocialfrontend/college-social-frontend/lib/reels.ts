'use client';

// Upload flow for a reel. Reuses the feed's direct browser -> Cloudinary path
// (lib/cloudinary-upload.ts): the video bytes never touch our API server, and the `confirm`
// callback is pointed straight at POST /reels so the reel row is created in the same round-trip
// that validates the Cloudinary asset. Falls back to the plain multipart /upload/video route
// (then POST /reels with the resulting URL) when the direct path is unavailable.

import { api, ApiError } from './api';
import {
  uploadVideoDirect,
  DirectUploadUnavailableError,
  type DirectUploadTicket,
} from './cloudinary-upload';
import type { Reel } from './types';

export interface CreateReelInput {
  file: File;
  caption: string;
  durationSec: number;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

// Same kill switch the feed's video upload honours (see lib/api.ts).
function directUploadEnabled(): boolean {
  return typeof window !== 'undefined' && process.env.NEXT_PUBLIC_DIRECT_UPLOAD !== '0';
}

// Set NEXT_PUBLIC_STREAM_ENABLED=1 once the backend has CF_STREAM_* configured -- new reels then
// upload to Cloudflare Stream (adaptive HLS) instead of Cloudinary. Existing reels are unaffected.
function streamEnabled(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!process.env.NEXT_PUBLIC_STREAM_ENABLED &&
    process.env.NEXT_PUBLIC_STREAM_ENABLED !== '0'
  );
}

export async function createReel({
  file,
  caption,
  durationSec,
  onProgress,
  signal,
}: CreateReelInput): Promise<Reel> {
  if (streamEnabled()) {
    const { uploadToStream } = await import('./stream-upload');
    const s = await uploadToStream(file, { onProgress, signal });
    return api.post<Reel>('/reels', {
      streamUid: s.uid,
      caption,
      durationSec: Math.round(s.durationSec || durationSec),
    });
  }

  if (directUploadEnabled()) {
    try {
      return await uploadVideoDirect<Reel>(file, {
        sign: () => api.post<DirectUploadTicket>('/upload/video/sign'),
        confirm: (publicIds, meta) =>
          api.post<Reel>('/reels', { publicIds, caption, durationSec, ...meta }),
        onProgress,
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (!(err instanceof DirectUploadUnavailableError)) {
        // eslint-disable-next-line no-console
        console.warn('[reels] direct upload failed, falling back to server route:', err);
      }
    }
  }

  // Fallback: multipart upload through our server, then create the reel from the returned URL.
  const uploaded = await api.upload<{ url: string; chunkCount?: number }>('/upload/video', file, onProgress);
  return api.post<Reel>('/reels', {
    videoUrl: uploaded.url,
    chunkCount: uploaded.chunkCount ?? 1,
    caption,
    durationSec,
  });
}

export { ApiError };
