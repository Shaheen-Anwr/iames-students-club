// Turns a photo into a chat sticker on a 512x512 canvas: crop to a shape, optional caption, and the
// classic white "die-cut" outline around everything (built from the content's own alpha, so it
// also hugs a transparent PNG's subject and the caption's letters).

export const STICKER_SIZE = 512;

export type StickerShape = 'circle' | 'rounded' | 'free';

export interface StickerOptions {
  shape: StickerShape;
  /** 1 = fill the frame (circle/rounded) or fit it (free); up to ~3. */
  zoom: number;
  /** Pan, in canvas pixels. */
  offsetX: number;
  offsetY: number;
  outline: boolean;
  text: string;
  textPosition: 'top' | 'bottom';
  textColor: string;
}

export const DEFAULT_STICKER_OPTIONS: StickerOptions = {
  shape: 'rounded',
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  outline: true,
  text: '',
  textPosition: 'bottom',
  textColor: '#ffffff',
};

function canvas(size = STICKER_SIZE): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

// ctx.roundRect is recent (Safari 16, Firefox 112) -- trace the same path by hand where it's missing.
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

type Rect = { x: number; y: number; w: number; h: number };

const boundsCache = new WeakMap<HTMLImageElement, Rect>();

// A transparent PNG (a cut-out subject) usually carries a wide empty margin; the "free" shape trims
// to the visible pixels so the subject fills the sticker, like WhatsApp does. Scanned on a <=256px
// probe and cached per image, since the preview re-renders on every slider/drag change.
function opaqueBounds(image: HTMLImageElement): Rect {
  const cached = boundsCache.get(image);
  if (cached) return cached;
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  let result: Rect = { x: 0, y: 0, w: iw, h: ih };
  try {
    const k = Math.min(1, 256 / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * k));
    const h = Math.max(1, Math.round(ih * k));
    const probe = document.createElement('canvas');
    probe.width = w;
    probe.height = h;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(image, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let minX = w;
      let minY = h;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= 0) {
        // One probe pixel of slack on each side, mapped back to source pixels.
        const x0 = Math.max(0, (minX - 1) / k);
        const y0 = Math.max(0, (minY - 1) / k);
        const x1 = Math.min(iw, (maxX + 2) / k);
        const y1 = Math.min(ih, (maxY + 2) / k);
        result = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
    }
  } catch {
    /* unreadable pixels -- keep the whole image */
  }
  boundsCache.set(image, result);
  return result;
}

function appFontFamily(): string {
  if (typeof document === 'undefined') return 'sans-serif';
  return getComputedStyle(document.body).fontFamily || 'sans-serif';
}

export function renderSticker(image: HTMLImageElement, opts: StickerOptions): HTMLCanvasElement {
  const S = STICKER_SIZE;
  const pad = opts.outline ? 24 : 10;
  const area = S - pad * 2;

  // 1. The photo, cropped to the shape.
  const content = canvas();
  const ctx = content.getContext('2d')!;
  ctx.save();
  ctx.beginPath();
  if (opts.shape === 'circle') ctx.arc(S / 2, S / 2, area / 2, 0, Math.PI * 2);
  else if (opts.shape === 'rounded') roundedRect(ctx, pad, pad, area, area, area * 0.2);
  else ctx.rect(pad, pad, area, area);
  ctx.clip();
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const src: Rect = opts.shape === 'free' ? opaqueBounds(image) : { x: 0, y: 0, w: iw, h: ih };
  const base = opts.shape === 'free' ? Math.min(area / src.w, area / src.h) : Math.max(area / src.w, area / src.h);
  const scale = base * opts.zoom;
  const dw = src.w * scale;
  const dh = src.h * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, src.x, src.y, src.w, src.h, S / 2 - dw / 2 + opts.offsetX, S / 2 - dh / 2 + opts.offsetY, dw, dh);
  ctx.restore();

  // 2. The caption -- part of the content, so the outline wraps its letters too.
  const text = opts.text.trim();
  if (text) {
    let size = 76;
    const family = appFontFamily();
    ctx.font = `900 ${size}px ${family}`;
    while (size > 30 && ctx.measureText(text).width > area - 16) {
      size -= 4;
      ctx.font = `900 ${size}px ${family}`;
    }
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    const y = opts.textPosition === 'top' ? pad + size * 0.95 : S - pad - size * 0.3;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = opts.textColor.toLowerCase() === '#111111' ? '#ffffff' : 'rgba(17,17,17,0.92)';
    ctx.strokeText(text, S / 2, y);
    ctx.fillStyle = opts.textColor;
    ctx.fillText(text, S / 2, y);
  }

  // 3. White die-cut outline from the content's silhouette, then the content on top.
  const result = canvas();
  const out = result.getContext('2d')!;
  if (opts.outline) {
    const silhouette = canvas();
    const s = silhouette.getContext('2d')!;
    s.drawImage(content, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = '#ffffff';
    s.fillRect(0, 0, S, S);
    const r = pad * 0.72;
    out.save();
    out.shadowColor = 'rgba(0,0,0,0.22)';
    out.shadowBlur = 10;
    out.shadowOffsetY = 3;
    out.drawImage(silhouette, 0, 0);
    out.restore();
    for (let i = 0; i < 28; i++) {
      const t = (i / 28) * Math.PI * 2;
      out.drawImage(silhouette, Math.cos(t) * r, Math.sin(t) * r);
    }
  }
  out.drawImage(content, 0, 0);
  return result;
}

/** WebP where the browser can encode it (smaller, keeps transparency), else PNG (Safari). */
export function canvasToFile(c: HTMLCanvasElement): Promise<File> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (webp) => {
        if (webp && webp.type === 'image/webp') {
          resolve(new File([webp], 'sticker.webp', { type: 'image/webp' }));
          return;
        }
        c.toBlob(
          (png) => (png ? resolve(new File([png], 'sticker.png', { type: 'image/png' })) : reject(new Error('encode failed'))),
          'image/png',
        );
      },
      'image/webp',
      0.9,
    );
  });
}

export function loadImageFile(file: File): Promise<{ image: HTMLImageElement; release: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve({ image, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable image'));
    };
    image.src = url;
  });
}
