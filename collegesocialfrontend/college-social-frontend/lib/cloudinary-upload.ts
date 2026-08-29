'use client';

// Direct browser -> Cloudinary video upload. Instead of streaming every byte through our own API
// server (which then re-uploads to Cloudinary -- two hops, and our box's CPU/bandwidth/request
// timeout on the path), the browser pushes the video straight to Cloudinary's ingest using a
// short-lived signature our server hands out. Our server is only involved to (a) sign the request
// and (b) validate the resulting public_id(s) afterwards.
//
// Large videos are re-encoded + split into <cap-sized segments in the browser first (see
// lib/video-compress.ts `segmentVideo`); each segment is uploaded as its own Cloudinary asset and
// the backend's /video/confirm splices them into one continuous delivery URL. Anything this can't
// do cleanly throws, and the caller (lib/api.ts) falls back to the multipart server upload route.

import { maybeCompressVideo, segmentVideo } from './video-compress';

export interface DirectUploadTicket {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  tags: string;
  /** Per-segment byte ceiling (Cloudinary's per-video-asset cap on this plan, with margin). */
  maxPieceBytes: number;
  /** Byte size of each Content-Range'd PUT within one asset's upload. */
  chunkSize: number;
}

export interface DirectVideoUploadDeps<T> {
  /** Fetch a fresh signed ticket from our API (POST /api/upload/video/sign). */
  sign: () => Promise<DirectUploadTicket>;
  /** Hand the uploaded public_id(s) to our API for validation (POST /api/upload/video/confirm). */
  confirm: (publicIds: string[], meta: { originalName: string; size: number; mimeType: string }) => Promise<T>;
  /** 0-100, matches UploadProgressHandler. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

// One raw file part's signed public_id -- unlike video (where Cloudinary auto-assigns each
// segment's public_id and one shared signature covers them all), a raw file's read-back path
// depends on every part being named "<group>-part-<i>" exactly (see PostsController's GET
// :id/attachment), so each part needs its own signature over its own fixed public_id.
export interface DirectFileUploadPart {
  publicId: string;
  timestamp: number;
  signature: string;
  format: string;
}

export interface DirectFileUploadTicket {
  cloudName: string;
  apiKey: string;
  folder: string;
  tags: string;
  groupId: string;
  /** Per-part byte ceiling (Cloudinary's per-raw-asset cap on this plan, with margin). */
  maxPieceBytes: number;
  parts: DirectFileUploadPart[];
}

export interface DirectFileUploadDeps<T> {
  /** Fetch per-part signed tickets from our API (POST /api/upload/file/sign). */
  sign: (fileSize: number, originalName: string) => Promise<DirectFileUploadTicket>;
  /** Tell our API how many parts landed under `groupId` so it can verify + build the read URL. */
  confirm: (groupId: string, partCount: number, meta: { originalName: string; size: number; mimeType: string }) => Promise<T>;
  /** 0-100, matches UploadProgressHandler. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

// Exactly the params one Cloudinary upload POST needs -- generalizes over video (one shared
// signature/resource_type for every piece) and raw files (a distinct public_id/signature per piece).
interface PieceUploadParams {
  cloudName: string;
  apiKey: string;
  resourceType: 'video' | 'raw';
  /** Content-Range chunk size within this one piece's upload; pieces are almost always under it. */
  chunkSize: number;
  /** Exact params the signature covers -- echoed back verbatim in the upload POST. */
  signedParams: Record<string, string | number>;
}

// Thrown when the direct path can't proceed and the caller should fall back to the server route.
// (An aborted upload throws a DOMException/AbortError instead and must NOT be swallowed.)
export class DirectUploadUnavailableError extends Error {}

const MAX_CHUNK_RETRIES = 3;
const CLOUDINARY_MULTIPART_MIN_CHUNK = 5 * 1024 * 1024; // Cloudinary rejects non-final chunks < 5MB

function randomUploadId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

// One Content-Range'd chunk POST to Cloudinary, with upload-progress reporting and retry on
// transient failures. Resolves with the parsed response body (only meaningful on the final chunk).
function postChunk(
  url: string,
  form: FormData,
  headers: Record<string, string>,
  onBytes: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener('abort', onAbort);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onBytes(e.loaded);
    };
    xhr.onload = () => {
      cleanup();
      let body: any = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = xhr.responseText;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body);
      } else {
        const message = body?.error?.message || `Cloudinary responded ${xhr.status}`;
        const err = new Error(message) as Error & { status?: number; retryable?: boolean };
        err.status = xhr.status;
        err.retryable = xhr.status === 0 || xhr.status === 429 || xhr.status >= 500;
        reject(err);
      }
    };
    xhr.onerror = () => {
      cleanup();
      const err = new Error('network error talking to Cloudinary') as Error & { retryable?: boolean };
      err.retryable = true;
      reject(err);
    };
    xhr.onabort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    xhr.send(form);
  });
}

// Uploads one file (a whole small video, one segment of a big one, or one raw-file part) to
// Cloudinary, splitting it into Content-Range'd chunks when it's bigger than `params.chunkSize`.
// Returns the asset's public_id. `reportSegmentBytes` is called with this piece's cumulative
// uploaded byte count.
async function uploadOnePiece(
  file: Blob,
  params: PieceUploadParams,
  reportSegmentBytes: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const url = `https://api.cloudinary.com/v1_1/${params.cloudName}/${params.resourceType}/upload`;
  const total = file.size;
  const single = total <= params.chunkSize;
  // Keep every non-final chunk >= Cloudinary's 5MB floor.
  const step = Math.max(params.chunkSize, CLOUDINARY_MULTIPART_MIN_CHUNK);
  const uploadId = randomUploadId();
  let lastBody: any = null;
  let completedBytes = 0;

  for (let start = 0; start < total || start === 0; start += step) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const end = Math.min(start + step, total);
    const slice = file.slice(start, end);

    const form = new FormData();
    form.append('file', slice);
    form.append('api_key', params.apiKey);
    for (const [key, value] of Object.entries(params.signedParams)) form.append(key, String(value));

    const headers: Record<string, string> = single
      ? {}
      : { 'X-Unique-Upload-Id': uploadId, 'Content-Range': `bytes ${start}-${end - 1}/${total}` };

    let attempt = 0;
    for (;;) {
      try {
        lastBody = await postChunk(
          url,
          form,
          headers,
          (loaded) => reportSegmentBytes(completedBytes + loaded),
          signal,
        );
        break;
      } catch (err: any) {
        if (signal?.aborted) throw err;
        if (!err?.retryable || attempt >= MAX_CHUNK_RETRIES) throw err;
        attempt += 1;
        await sleep(500 * 2 ** (attempt - 1), signal);
      }
    }
    completedBytes = end;
    reportSegmentBytes(completedBytes);
    if (end >= total) break;
  }

  const publicId = lastBody?.public_id;
  if (typeof publicId !== 'string' || !publicId) {
    throw new Error('Cloudinary upload returned no public_id');
  }
  return publicId;
}

const DIRECT_UPLOAD_CONCURRENCY = 4;

// Uploads every piece straight to Cloudinary with up to DIRECT_UPLOAD_CONCURRENCY in flight at
// once, instead of one at a time -- meaningfully faster on high-latency/mobile connections where
// per-request overhead (not raw bandwidth) dominates. Order matters for correctness, not just
// cosmetics: the backend splices these public_ids back together in array order
// (StorageService.buildVideoSpliceUrl), so each result is written into `publicIds[index]` by the
// piece's *original* index -- never pushed in completion order, which a naive
// `Promise.all(pieces.map(...))` would do and could silently reorder the video's segments.
async function uploadPiecesConcurrently(
  pieces: File[],
  paramsForPiece: (index: number) => PieceUploadParams,
  onAggregateBytes: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  const publicIds = new Array<string>(pieces.length);
  const perPieceLoaded = new Array<number>(pieces.length).fill(0);
  let nextIndex = 0;
  let firstError: unknown;

  async function worker() {
    for (;;) {
      if (firstError || signal?.aborted) return;
      const index = nextIndex++;
      if (index >= pieces.length) return;
      try {
        publicIds[index] = await uploadOnePiece(
          pieces[index],
          paramsForPiece(index),
          (loaded) => {
            perPieceLoaded[index] = loaded;
            onAggregateBytes(perPieceLoaded.reduce((sum, n) => sum + n, 0));
          },
          signal,
        );
      } catch (err) {
        firstError ??= err;
        return;
      }
    }
  }

  const workerCount = Math.min(DIRECT_UPLOAD_CONCURRENCY, pieces.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (firstError) throw firstError;
  return publicIds;
}

export async function uploadVideoDirect<T>(file: File, deps: DirectVideoUploadDeps<T>): Promise<T> {
  const { onProgress, signal } = deps;
  const report = (fraction: number) => onProgress?.(Math.max(0, Math.min(100, Math.round(fraction * 100))));

  let ticket: DirectUploadTicket;
  try {
    ticket = await deps.sign();
  } catch (err) {
    throw new DirectUploadUnavailableError((err as Error)?.message ?? 'could not obtain upload signature');
  }
  if (!ticket?.cloudName || !ticket.signature) {
    throw new DirectUploadUnavailableError('incomplete upload signature');
  }

  // --- prepare pieces (this is up to ~35% of the reported progress) ---
  const PREP_SHARE = 0.35;
  let pieces: File[];
  if (file.size > ticket.maxPieceBytes) {
    try {
      pieces = await segmentVideo(file, {
        maxPieceBytes: ticket.maxPieceBytes,
        signal,
        onProgress: (f) => report(f * PREP_SHARE),
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new DirectUploadUnavailableError(`in-browser segmentation failed: ${(err as Error)?.message ?? err}`);
    }
    // A segment that's still over cap would be rejected by Cloudinary after the others uploaded --
    // bail to the server route, which re-segments with ffmpeg, before wasting that bandwidth.
    if (pieces.some((p) => p.size > ticket.maxPieceBytes * 1.05)) {
      throw new DirectUploadUnavailableError('a segment exceeded the size cap after re-encoding');
    }
  } else {
    // Small enough for one asset -- still worth a best-effort shrink so the upload itself is quick.
    try {
      const { file: prepared } = await maybeCompressVideo(file, { signal, onProgress: (f) => report(f * PREP_SHARE) });
      pieces = [prepared];
    } catch (err) {
      if (signal?.aborted) throw err;
      pieces = [file];
    }
  }
  if (!pieces.length) throw new DirectUploadUnavailableError('no video data to upload');

  // --- upload every piece straight to Cloudinary, several at once (~35% -> ~95%) ---
  const totalBytes = pieces.reduce((n, p) => n + p.size, 0) || 1;
  const publicIds = await uploadPiecesConcurrently(
    pieces,
    () => ({
      cloudName: ticket.cloudName,
      apiKey: ticket.apiKey,
      resourceType: 'video',
      chunkSize: ticket.chunkSize,
      // Cloudinary auto-assigns each video piece's public_id, so the same signed params cover
      // every piece -- unlike a raw file part, which needs its own public_id (see uploadFileDirect).
      signedParams: { folder: ticket.folder, tags: ticket.tags, timestamp: ticket.timestamp, signature: ticket.signature },
    }),
    (loaded) => report(PREP_SHARE + (loaded / totalBytes) * (0.95 - PREP_SHARE)),
    signal,
  );

  // --- server validates + returns the canonical URL (last ~5%) ---
  const result = await deps.confirm(publicIds, {
    originalName: file.name,
    size: file.size,
    mimeType: file.type || 'video/mp4',
  });
  report(1);
  return result;
}

// Direct browser -> Cloudinary upload for a large generic file (PDF/PPT/scanned book/zip/etc, the
// "files" category). Unlike video, a raw file has no server-side splice transform to reassemble
// pieces at read time -- the existing chunked-upload read path (PostsController's GET
// :id/attachment) instead reconstructs by literally string-replacing "-part-0" with "-part-<i>" in
// the stored URL, which only works because every part is uploaded under a server-chosen
// "<group>-part-<i>" public_id. So each part gets its own signed ticket (see
// StorageService.createDirectFileUploadTicket) instead of one shared signature, and splitting is
// plain byte-range slicing -- no ffmpeg-style re-encoding needed for opaque bytes.
export async function uploadFileDirect<T>(file: File, deps: DirectFileUploadDeps<T>): Promise<T> {
  const { onProgress, signal } = deps;
  const report = (fraction: number) => onProgress?.(Math.max(0, Math.min(100, Math.round(fraction * 100))));

  let ticket: DirectFileUploadTicket;
  try {
    ticket = await deps.sign(file.size, file.name);
  } catch (err) {
    throw new DirectUploadUnavailableError((err as Error)?.message ?? 'could not obtain upload signature');
  }
  if (!ticket?.cloudName || !ticket.parts?.length) {
    throw new DirectUploadUnavailableError('incomplete upload signature');
  }

  const pieces: File[] = [];
  for (let start = 0; start < file.size || pieces.length === 0; start += ticket.maxPieceBytes) {
    const end = Math.min(start + ticket.maxPieceBytes, file.size);
    pieces.push(new File([file.slice(start, end)], file.name, { type: file.type }));
    if (end >= file.size) break;
  }
  if (pieces.length !== ticket.parts.length) {
    // The server computed partCount from the same fileSize/maxPieceBytes it just sent back --
    // a mismatch means something is inconsistent enough to not trust the rest of this ticket.
    throw new DirectUploadUnavailableError('part count mismatch between client and server');
  }

  const totalBytes = file.size || 1;
  await uploadPiecesConcurrently(
    pieces,
    (index) => {
      const part = ticket.parts[index];
      return {
        cloudName: ticket.cloudName,
        apiKey: ticket.apiKey,
        resourceType: 'raw',
        // Every part is already <= maxPieceBytes, so this always takes the single-request path --
        // raw uploads aren't confirmed to support the same Content-Range continuation as video.
        chunkSize: ticket.maxPieceBytes,
        signedParams: {
          folder: ticket.folder,
          tags: ticket.tags,
          public_id: part.publicId,
          timestamp: part.timestamp,
          signature: part.signature,
          ...(part.format ? { format: part.format } : {}),
        },
      };
    },
    (loaded) => report((loaded / totalBytes) * 0.95),
    signal,
  );

  // --- server verifies every part landed correctly + returns the canonical URL (last ~5%) ---
  const result = await deps.confirm(ticket.groupId, ticket.parts.length, {
    originalName: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
  });
  report(1);
  return result;
}
