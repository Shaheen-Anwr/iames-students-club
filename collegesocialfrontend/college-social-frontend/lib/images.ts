// Delivery-time Cloudinary optimization. The backend already applies an incoming
// (upload-time) transformation so the *stored* master is small (see the backend's
// StorageService.uploadSingleAsset), and new photos are additionally downscaled + re-encoded to
// WebP in the browser before upload (see lib/compress-image.ts); this is the complementary
// delivery-time layer that right-sizes and format-modernizes what's actually sent to a given
// viewer -- crucial for old assets uploaded before either of those existed, which are still
// stored large.
//
// No-op (returns the input untouched) for: a missing value, a local "/uploads/..." path, any
// non-Cloudinary URL, or a Cloudinary URL that already carries a transformation right after
// "/upload/" (e.g. built by an older ad-hoc helper) -- so it's always safe to wrap assetUrl().

interface CldOptimizeOpts {
  width?: number;
  height?: number;
  // 'limit' never upscales and keeps aspect ratio (default); 'fill' crops to an exact box;
  // 'thumb' is fill + face-aware gravity, for avatars.
  crop?: 'limit' | 'fill' | 'thumb';
  // Cloudinary quality token WITHOUT the leading "q_" -- e.g. 'auto:good' (default), 'auto:eco'
  // for feed thumbnails (~30% fewer bytes, invisible at grid size), 'auto:best' for a hero.
  quality?: string;
  // Emit `fl_progressive:steep` so a JPEG fallback paints top-to-bottom as it streams instead of
  // popping in at the end. Ignored by Cloudinary for WebP/AVIF, so it's free to leave on (default).
  progressive?: boolean;
}

// Guard: a URL already carrying a transformation segment right after "/image/upload/".
const ALREADY_TRANSFORMED = /\/image\/upload\/[^/]*(f_auto|q_auto|w_\d|c_|e_blur)/;

function isCloudinaryImage(url: string): boolean {
  return url.includes('res.cloudinary.com') && url.includes('/image/upload/');
}

export function cldOptimize(url: string | undefined | null, opts: CldOptimizeOpts = {}): string | undefined {
  if (!url) return undefined;
  if (!isCloudinaryImage(url)) return url;
  if (ALREADY_TRANSFORMED.test(url)) return url;

  const { width, height, crop = 'limit', quality = 'auto:good', progressive = true } = opts;
  const segment = [
    'f_auto',
    `q_${quality}`,
    ...(progressive ? ['fl_progressive:steep'] : []),
    `c_${crop}`,
    ...(crop === 'thumb' ? ['g_face'] : []),
    ...(width ? [`w_${width}`] : []),
    ...(height ? [`h_${height}`] : []),
  ].join(',');

  return url.replace('/image/upload/', `/image/upload/${segment}/`);
}

// A ~1KB blurred micro-thumbnail of the same asset, for use as an instant placeholder behind the
// real image while it loads (see components/ui/SmartImage). Returns undefined when there's no
// distinct cheap placeholder to make -- a non-Cloudinary URL, or one that's already transformed.
export function cldBlurPlaceholder(url: string | undefined | null): string | undefined {
  if (!url || !isCloudinaryImage(url) || ALREADY_TRANSFORMED.test(url)) return undefined;
  return url.replace('/image/upload/', '/image/upload/w_48,h_48,c_fill,g_auto,q_10,f_auto,e_blur:600/');
}
