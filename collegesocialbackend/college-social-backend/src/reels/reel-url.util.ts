// Cloudinary delivery-URL string transforms for reels. Kept as plain string manipulation (no SDK)
// so the same logic can be mirrored verbatim on the frontend (lib/video.ts).

const UPLOAD_MARKER = '/upload/';
const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)(\?.*)?$/i;

// A single JPEG frame ~1s into the clip, cropped to a 9:16 poster -- used as the <video> poster so
// the feed paints instantly. Returns the input unchanged if it isn't a Cloudinary /upload/ URL.
export function buildReelThumbnailUrl(videoUrl: string): string {
  const i = videoUrl.indexOf(UPLOAD_MARKER);
  if (i < 0) return videoUrl;
  const head = videoUrl.slice(0, i + UPLOAD_MARKER.length);
  const tail = videoUrl.slice(i + UPLOAD_MARKER.length).replace(VIDEO_EXT_RE, '.jpg');
  return `${head}so_1,w_720,h_1280,c_fill,f_jpg,q_auto/${tail}`;
}

// Adds automatic format + quality selection to a stored video URL for fast-start playback.
export function cldVideoOptimize(videoUrl: string): string {
  const i = videoUrl.indexOf(UPLOAD_MARKER);
  if (i < 0) return videoUrl;
  const head = videoUrl.slice(0, i + UPLOAD_MARKER.length);
  const tail = videoUrl.slice(i + UPLOAD_MARKER.length);
  if (tail.startsWith('f_auto') || tail.startsWith('q_auto')) return videoUrl;
  return `${head}f_auto,q_auto/${tail}`;
}
