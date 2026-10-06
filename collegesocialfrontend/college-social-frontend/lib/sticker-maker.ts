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
  const base = opts.shape === 'free' ? Math.min(area / iw, area / ih) : Math.max(area / iw, area / ih);
  const scale = base * opts.zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, S / 2 - dw / 2 + opts.offsetX, S / 2 - dh / 2 + opts.offsetY, dw, dh);
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
