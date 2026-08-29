import Cookies from 'js-cookie';
import { compressImage, compressImages, type CompressImageOptions } from './compress-image';
import {
  uploadVideoDirect,
  uploadFileDirect,
  DirectUploadUnavailableError,
  type DirectUploadTicket,
  type DirectFileUploadTicket,
} from './cloudinary-upload';

// Relative by default -- see next.config.js's rewrites(), which proxies /api/* to the real
// backend so the refresh-token cookie stays same-site instead of a droppable cross-site one.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';
export const TOKEN_COOKIE = 'college_social_token';

// A 'lecture'/'file' post's attachment should always be linked/embedded through this rather than
// its raw attachmentUrl -- the backend transparently reassembles it here when it was too large for
// a single Cloudinary asset and got split on upload (see the backend's StorageService.upload() and
// PostsController's GET :id/attachment), and just redirects straight to Cloudinary otherwise.
// Plain markup (<a>/<iframe>) can't attach a custom Authorization header, so the current access
// token is embedded directly as a query param instead -- the backend's JwtStrategy accepts it from
// there as a fallback. (A same-site cookie fallback also exists server-side, but confirmed in
// production not to reliably survive the frontend's cross-domain rewrite proxy to the real backend
// -- this query param is what actually works regardless of that.)
//
// CAVEAT: the token is captured at call time and baked into the returned string. Access tokens
// live ~15min, so a URL built for a feed/lecture list that then sits open longer -- or whose token
// gets silently refreshed after render -- points at an expired token and 401s when finally opened.
// Prefer fetchAttachmentObjectUrl() below, which fetches on demand through the normal
// refresh-on-401 path; use this only where an eager string URL is genuinely required.
export function postAttachmentUrl(postId: string): string {
  const token = getToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_URL}/posts/${postId}/attachment${query}`;
}

// Fetches a 'lecture'/'file' post's attachment and returns a short-lived blob: object URL for it.
// Unlike postAttachmentUrl(), the request carries a live Authorization header and retries once
// through refreshAccessToken() on a 401, so an attachment opened after its access token has already
// expired still works instead of surfacing the 401. The caller owns the returned URL and must
// URL.revokeObjectURL() it when done (see useAttachmentObjectUrl()).
export async function fetchAttachmentObjectUrl(postId: string, isRetry = false): Promise<string> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}/posts/${postId}/attachment`, { headers, credentials: 'include' });

  if (res.status === 401 && !isRetry) {
    try {
      await refreshAccessToken();
      return fetchAttachmentObjectUrl(postId, true);
    } catch {
      clearToken();
      // fall through -- report the original 401 below
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, `فشل تحميل المرفق (${res.status})`);
  }

  return URL.createObjectURL(await res.blob());
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | undefined {
  return Cookies.get(TOKEN_COOKIE);
}

export function setToken(token: string) {
  // The JWT itself expires in 15min server-side; the cookie is kept around longer so a silent
  // refresh (see requestWithRefresh below) can transparently replace it across browser sessions.
  Cookies.set(TOKEN_COOKIE, token, { expires: 30, sameSite: 'lax' });
}

export function clearToken() {
  Cookies.remove(TOKEN_COOKIE);
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as { message: unknown }).message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return fallback;
}

// Shared in-flight refresh promise so concurrent 401s trigger a single /auth/refresh call.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('refresh failed');
        const data = (await res.json()) as { accessToken: string };
        setToken(data.accessToken);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Auth endpoints that must never trigger a refresh-and-retry themselves.
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'];

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });

  if (res.status === 401 && !isRetry && !NO_REFRESH_PATHS.includes(path)) {
    try {
      await refreshAccessToken();
      return request<T>(path, options, true);
    } catch {
      clearToken();
      // fall through -- report the original 401 below
    }
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, extractMessage(body, `فشل الطلب (${res.status})`));
  }

  return body as T;
}

export type AiStreamEvent =
  | { type: 'delta'; text: string; stub?: boolean }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; summary: string }
  | { type: 'done'; message: import('./types').AiMessage }
  | { type: 'error'; message: string };

export interface AiMessageAttachment {
  url: string;
  type: 'image' | 'document';
  mimeType?: string;
}

// Shared by streamAiMessage and regenerateAiMessage: posts to an SSE route (see
// AiController.streamSse) and dispatches each `data: ` frame to onEvent as it arrives. Native
// EventSource can't do POST + a custom Authorization header, so this is a manual fetch() +
// ReadableStream reader instead, reusing the same token/refresh-on-401 logic as request() above.
async function streamSseRequest(
  path: string,
  body: unknown,
  onEvent: (event: AiStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  async function attempt(isRetry: boolean): Promise<void> {
    const token = getToken();
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
      signal,
    });

    if (res.status === 401 && !isRetry) {
      await refreshAccessToken();
      return attempt(true);
    }
    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => '');
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* not json */
      }
      throw new ApiError(res.status, extractMessage(parsed, `فشل الطلب (${res.status})`));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (line) {
          try {
            onEvent(JSON.parse(line.slice(6)) as AiStreamEvent);
          } catch {
            /* skip malformed frame */
          }
        }
      }
    }
  }

  return attempt(false);
}

export async function streamAiMessage(
  conversationId: string,
  text: string,
  onEvent: (event: AiStreamEvent) => void,
  attachment?: AiMessageAttachment,
  sharedPostId?: string,
  signal?: AbortSignal,
): Promise<void> {
  return streamSseRequest(
    `/ai/conversations/${conversationId}/messages`,
    { text, ...(attachment ? { attachment } : {}), ...(sharedPostId ? { sharedPostId } : {}) },
    onEvent,
    signal,
  );
}

// Deletes the last assistant reply server-side and re-answers the same question fresh. Doesn't
// count against the daily message quota (see AiConversationsService.regenerateLastReply).
export async function regenerateAiMessage(
  conversationId: string,
  onEvent: (event: AiStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamSseRequest(`/ai/conversations/${conversationId}/regenerate`, {}, onEvent, signal);
}

// 0-100. fetch() has no upload-progress event at all, so a real progress bar needs
// XMLHttpRequest for the upload path specifically -- everything else stays on fetch via request().
export type UploadProgressHandler = (percent: number) => void;

function uploadWithProgress<T>(path: string, formData: FormData, onProgress?: UploadProgressHandler, isRetry = false): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    xhr.withCredentials = true;
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      let body: unknown = null;
      if (xhr.responseText) {
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = xhr.responseText;
        }
      }

      if (xhr.status === 401 && !isRetry) {
        refreshAccessToken()
          .then(() => uploadWithProgress<T>(path, formData, onProgress, true))
          .then(resolve, () => {
            clearToken();
            reject(new ApiError(401, extractMessage(body, 'فشل الطلب (401)')));
          });
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError(xhr.status, extractMessage(body, `فشل الطلب (${xhr.status})`)));
        return;
      }

      resolve(body as T);
    };

    xhr.onerror = () => reject(new ApiError(0, 'تعذّر الاتصال بالخادم'));
    xhr.send(formData);
  });
}

// Per-category ceiling (MB), mirroring the backend's own limits (see the backend's
// multer.config.ts SIZE_LIMIT_MB_BY_CATEGORY -- keep these two in sync). Images/audio match what
// the connected Cloudinary account's plan enforces directly (10MB/100MB on the free tier -- not
// just an app preference, Cloudinary itself would reject anything larger). 'lecture'/'video'/'file'
// are higher because the backend transparently splits an oversized upload into multiple sub-cap
// Cloudinary assets and reassembles them on read (see StorageService.upload()'s chunked path) --
// this is still a real ceiling (disk space, processing time), just a much more generous one.
const UPLOAD_MAX_SIZE_MB: Record<string, number> = {
  photo: 10,
  'cover-photo': 10,
  'post-images': 10,
  lecture: 300, // PDF/PPT/DOC lecture notes and scanned books -- chunked above Cloudinary's 10MB raw cap
  video: 1024, // lecture recordings -- chunked above Cloudinary's 100MB video cap
  file: 200, // chunked
  audio: 100,
  'chat-background': 10,
};

function assertWithinSizeLimit(path: string, file: File) {
  const category = path.replace(/^\/?upload\//, '');
  const maxMb = UPLOAD_MAX_SIZE_MB[category];
  if (maxMb === undefined) return;
  if (file.size > maxMb * 1024 * 1024) {
    throw new ApiError(413, `حجم الملف "${file.name}" أكبر من الحد المسموح به (${maxMb} ميجابايت).`);
  }
}

// Upload endpoints whose payload is a photo meant purely for on-screen display -- these get
// downscaled + re-encoded to WebP in the browser first (see lib/compress-image.ts), so a 12MP
// phone photo uploads as ~0.5MB instead of ~8MB, lands well under Cloudinary's free-tier 10MB
// image cap, and costs almost nothing against the storage quota. The size check runs on the
// *compressed* file so a huge original that shrinks fine is accepted, while one that somehow
// can't be re-encoded still gets a clear "too large" error instead of failing at the server.
const IMAGE_UPLOAD_COMPRESS_OPTS: Record<string, CompressImageOptions> = {
  // An avatar renders at most ~256px; 1024 is already 2x headroom for a high-DPR screen.
  photo: { maxEdge: 1024 },
  'cover-photo': { maxEdge: 2560 },
  'post-images': { maxEdge: 2560 },
  'chat-background': { maxEdge: 2560 },
};

function compressOptsFor(path: string): CompressImageOptions | null {
  return IMAGE_UPLOAD_COMPRESS_OPTS[path.replace(/^\/?upload\//, '')] ?? null;
}

// The direct browser -> Cloudinary paths (video, and large generic files -- see
// lib/cloudinary-upload.ts) are on by default; NEXT_PUBLIC_DIRECT_UPLOAD=0 is a kill switch that
// reverts both to their plain server multipart route (e.g. if Cloudinary CORS ever misbehaves in
// production).
function directUploadEnabled(): boolean {
  return typeof window !== 'undefined' && process.env.NEXT_PUBLIC_DIRECT_UPLOAD !== '0';
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data !== undefined ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: async <T>(path: string, file: File, onProgress?: UploadProgressHandler) => {
    const category = path.replace(/^\/?upload\//, '');

    // Video: upload the bytes straight from the browser to Cloudinary (segmenting oversized files
    // in-browser first), skipping the server hop entirely. Any failure that isn't a user abort
    // falls through to the plain server multipart route below.
    if (category === 'video' && directUploadEnabled()) {
      assertWithinSizeLimit(path, file);
      try {
        return await uploadVideoDirect<T>(file, {
          sign: () => api.post<DirectUploadTicket>('/upload/video/sign'),
          confirm: (publicIds, meta) => api.post<T>('/upload/video/confirm', { publicIds, ...meta }),
          onProgress,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        if (!(err instanceof DirectUploadUnavailableError)) {
          // eslint-disable-next-line no-console
          console.warn('[upload] direct video upload failed, falling back to server route:', err);
        }
      }
    }

    // Large generic files (PDFs, scanned books, zips, etc.): same idea as video above, but split
    // by plain byte-range slicing (no re-encoding needed for opaque bytes) -- only worth the extra
    // round trip once a file is big enough to need splitting at all.
    const FILE_DIRECT_UPLOAD_THRESHOLD_BYTES = 8 * 1024 * 1024;
    if (category === 'file' && directUploadEnabled() && file.size > FILE_DIRECT_UPLOAD_THRESHOLD_BYTES) {
      assertWithinSizeLimit(path, file);
      try {
        return await uploadFileDirect<T>(file, {
          sign: (fileSize, originalName) => api.post<DirectFileUploadTicket>('/upload/file/sign', { fileSize, originalName }),
          confirm: (groupId, partCount, meta) => api.post<T>('/upload/file/confirm', { groupId, partCount, ...meta }),
          onProgress,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        if (!(err instanceof DirectUploadUnavailableError)) {
          // eslint-disable-next-line no-console
          console.warn('[upload] direct file upload failed, falling back to server route:', err);
        }
      }
    }

    const opts = compressOptsFor(path);
    const prepared = opts ? await compressImage(file, opts) : file;
    assertWithinSizeLimit(path, prepared);
    const formData = new FormData();
    formData.append('file', prepared);
    return uploadWithProgress<T>(path, formData, onProgress);
  },
  uploadMany: async <T>(path: string, files: File[], onProgress?: UploadProgressHandler) => {
    const opts = compressOptsFor(path);
    const prepared = opts ? await compressImages(files, opts) : files;
    for (const file of prepared) assertWithinSizeLimit(path, file);
    const formData = new FormData();
    for (const file of prepared) formData.append('files', file);
    return uploadWithProgress<T>(path, formData, onProgress);
  },
};
