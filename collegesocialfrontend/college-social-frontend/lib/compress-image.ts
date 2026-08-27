// Client-side image downscale + re-encode, run right before an upload leaves the browser.
//
// Why: a modern phone photo is 12-24 megapixels and 4-12 MB, but nothing in this app ever
// displays an image wider than ~1920 CSS px. Shrinking to a sane longest edge and re-encoding to
// WebP in the browser turns a multi-MB upload into ~300-800 KB -- so the upload finishes many
// times faster, never trips Cloudinary's free-tier 10 MB image ceiling, and the *stored* master
// (and therefore the free storage quota) stays tiny. Cloudinary's own incoming transformation
// still runs on top of this server-side; this just means it starts from a small source.
//
// Everything here degrades to "return the original file untouched" on anything unexpected (a
// format the browser can't decode to a canvas -- e.g. HEIC on Chrome, SVG, animated GIF -- an
// OffscreenCanvas gap, a decode error), so a call site can always `await compressImage(file)` and
// treat the result as a drop-in replacement for `file`.

export interface CompressImageOptions {
  // Longest-edge cap in pixels. The image is only ever scaled down, never up.
  maxEdge?: number;
  // Output encoder quality, 0..1 (WebP/JPEG).
  quality?: number;
  // Output MIME type. WebP is ~25-35% smaller than JPEG at matched quality and is universally
  // supported by every browser this app targets.
  mimeType?: 'image/webp' | 'image/jpeg';
}

// Formats a browser can reliably draw to a <canvas>. Deliberately excludes image/gif (re-encoding
// drops animation) and everything non-raster.
const RE_ENCODABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

const DEFAULTS: Required<CompressImageOptions> = {
  maxEdge: 2560,
  quality: 0.82,
  mimeType: 'image/webp',
};

export async function compressImage(file: File, options: CompressImageOptions = {}): Promise<File> {
  const { maxEdge, quality, mimeType } = { ...DEFAULTS, ...options };

  if (typeof window === 'undefined') return file;
  if (!RE_ENCODABLE.has(file.type)) return file;
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap;
  try {
    // `imageOrientation: 'from-image'` bakes in the EXIF rotation so a portrait phone photo doesn't
    // come out sideways once the orientation metadata is dropped by re-encoding.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxEdge / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const willResize = scale < 1;

    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height });

    const ctx = canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const encode = (type: string): Promise<Blob | null> =>
      'convertToBlob' in canvas
        ? canvas.convertToBlob({ type, quality }).catch(() => null)
        : new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, type, quality));

    // Some older Safari builds can't encode WebP from a canvas -- fall back to JPEG before giving up.
    let outType = mimeType;
    let blob = await encode(outType);
    if ((!blob || blob.type !== outType) && outType !== 'image/jpeg') {
      outType = 'image/jpeg';
      blob = await encode(outType);
    }
    if (!blob) return file;

    // Re-encoding a small, already-optimized image can come out *bigger*. If we didn't need to
    // resize and didn't save at least a few percent, keep the original.
    if (!willResize && blob.size >= file.size * 0.95) return file;

    const ext = outType === 'image/webp' ? 'webp' : 'jpg';
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${base}.${ext}`, { type: outType, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}

// Runs compressImage over many files with bounded concurrency -- 10 full-res decodes fired at once
// can spike memory hard on a low-end phone, and the encodes are CPU-bound anyway so there's no
// throughput lost by capping it.
export async function compressImages(
  files: File[],
  options: CompressImageOptions = {},
  concurrency = 3,
): Promise<File[]> {
  const out = new Array<File>(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      out[i] = await compressImage(files[i], options);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return out;
}
