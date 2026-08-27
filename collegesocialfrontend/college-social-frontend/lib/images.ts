// Delivery-time Cloudinary optimization. The backend already applies an incoming
// (upload-time) transformation so the *stored* master is small (see the backend's
// StorageService.uploadSingleAsset); this is the complementary delivery-time layer that
// right-sizes and format-modernizes what's actually sent to a given viewer -- crucial for
// old assets uploaded before upload-time compression existed, which are still stored large.
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
  quality?: string;
}

export function cldOptimize(url: string | undefined | null, opts: CldOptimizeOpts = {}): string | undefined {
  if (!url) return undefined;
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
  // Already transformed (e.g. ".../upload/f_auto,q_auto,w_250/v123/..."): leave it alone.
  if (/\/image\/upload\/[^/]*(f_auto|q_auto|w_\d|c_)/.test(url)) return url;

  const { width, height, crop = 'limit', quality = 'auto:good' } = opts;
  const segment = [
    'f_auto',
    `q_${quality}`,
    `c_${crop}`,
    ...(crop === 'thumb' ? ['g_face'] : []),
    ...(width ? [`w_${width}`] : []),
    ...(height ? [`h_${height}`] : []),
  ].join(',');

  return url.replace('/image/upload/', `/image/upload/${segment}/`);
}
