'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cldOptimize } from '@/lib/images';

const MAX_SCALE = 5;

export function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Live gesture state. Kept in a ref (not React state) so the non-passive native listeners below
  // never close over a stale copy and a pinch doesn't re-render the tree 60x/second.
  const g = useRef({
    scale: 1,
    tx: 0,
    ty: 0,
    pinchDist: 0,
    pinchScale: 1,
    mid: null as { x: number; y: number } | null,
    panning: false,
    panFrom: { x: 0, y: 0 },
    moved: false,
    lastTap: 0,
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onIndexChange((index - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight') onIndexChange((index + 1) % images.length);
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [index, images.length, onIndexChange, onClose]);

  // Warm the browser cache for the neighbouring photos so next/prev is instant instead of showing
  // a blank frame while the full-size image downloads.
  useEffect(() => {
    if (images.length < 2) return;
    for (const i of [(index + 1) % images.length, (index - 1 + images.length) % images.length]) {
      const preload = new Image();
      preload.src = cldOptimize(images[i], { width: 1600, crop: 'limit' }) ?? images[i];
    }
  }, [index, images]);

  // Pinch / wheel / double-tap zoom that stays *inside* the photo: the listeners are non-passive and
  // call preventDefault, and the container is `touch-action: none`, so the two-finger gesture drives
  // this transform instead of the browser zooming the whole page.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const instant = () => {
      const img = imgRef.current;
      if (img) img.style.transition = 'none';
    };
    const settle = () => {
      const img = imgRef.current;
      if (img) img.style.transition = 'transform .18s ease';
    };

    const draw = () => {
      const img = imgRef.current;
      if (!img) return;
      const s = g.current.scale;
      // Keep the image covering the centre -- don't let a pan fling it off screen.
      const maxX = (img.offsetWidth * (s - 1)) / 2;
      const maxY = (img.offsetHeight * (s - 1)) / 2;
      g.current.tx = Math.min(maxX, Math.max(-maxX, g.current.tx));
      g.current.ty = Math.min(maxY, Math.max(-maxY, g.current.ty));
      img.style.transform = `translate(${g.current.tx}px, ${g.current.ty}px) scale(${s})`;
      img.style.cursor = s > 1 ? 'grab' : '';
    };

    const reset = (animated: boolean) => {
      g.current.scale = 1;
      g.current.tx = 0;
      g.current.ty = 0;
      const img = imgRef.current;
      if (img) {
        img.style.transition = animated ? 'transform .2s ease' : 'none';
        img.style.transform = 'translate(0px, 0px) scale(1)';
        img.style.cursor = '';
      }
    };

    // Scale toward a fixed client point so the pixel under the fingers / cursor stays put.
    const zoomTo = (nextScale: number, fx: number, fy: number) => {
      const img = imgRef.current;
      if (!img) return;
      const s1 = Math.min(MAX_SCALE, Math.max(1, nextScale));
      const rect = img.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const k = 1 - s1 / g.current.scale;
      g.current.tx += (fx - cx) * k;
      g.current.ty += (fy - cy) * k;
      g.current.scale = s1;
      if (s1 === 1) {
        g.current.tx = 0;
        g.current.ty = 0;
      }
      draw();
    };

    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

    const onTouchStart = (e: TouchEvent) => {
      g.current.moved = false;
      if (e.touches.length === 2) {
        instant();
        g.current.pinchDist = dist(e.touches);
        g.current.pinchScale = g.current.scale;
        g.current.mid = mid(e.touches);
      } else if (e.touches.length === 1 && g.current.scale > 1) {
        instant();
        g.current.panning = true;
        g.current.panFrom = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && g.current.mid) {
        e.preventDefault();
        g.current.moved = true;
        const m = mid(e.touches);
        g.current.tx += m.x - g.current.mid.x;
        g.current.ty += m.y - g.current.mid.y;
        g.current.mid = m;
        zoomTo(g.current.pinchScale * (dist(e.touches) / g.current.pinchDist), m.x, m.y);
      } else if (e.touches.length === 1 && g.current.panning) {
        e.preventDefault();
        g.current.moved = true;
        const t = e.touches[0];
        g.current.tx += t.clientX - g.current.panFrom.x;
        g.current.ty += t.clientY - g.current.panFrom.y;
        g.current.panFrom = { x: t.clientX, y: t.clientY };
        draw();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) g.current.mid = null;
      if (e.touches.length > 0) return;
      g.current.panning = false;

      // Double-tap the photo to toggle a 2.5x zoom centred on the tapped point.
      if (!g.current.moved && e.target === imgRef.current) {
        const now = Date.now();
        const t = e.changedTouches[0];
        if (now - g.current.lastTap < 300) {
          settle();
          zoomTo(g.current.scale > 1 ? 1 : 2.5, t.clientX, t.clientY);
          g.current.lastTap = 0;
        } else {
          g.current.lastTap = now;
        }
      }

      if (g.current.scale <= 1.01) reset(true);
      else settle();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      instant();
      zoomTo(g.current.scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY);
      if (g.current.scale <= 1.01) reset(false);
    };

    // Desktop: drag to pan while zoomed in.
    const onMouseDown = (e: MouseEvent) => {
      if (g.current.scale <= 1 || e.target !== imgRef.current) return;
      e.preventDefault();
      g.current.panning = true;
      g.current.panFrom = { x: e.clientX, y: e.clientY };
      instant();
      if (imgRef.current) imgRef.current.style.cursor = 'grabbing';
      const move = (ev: MouseEvent) => {
        g.current.tx += ev.clientX - g.current.panFrom.x;
        g.current.ty += ev.clientY - g.current.panFrom.y;
        g.current.panFrom = { x: ev.clientX, y: ev.clientY };
        draw();
      };
      const up = () => {
        g.current.panning = false;
        settle();
        if (imgRef.current) imgRef.current.style.cursor = 'grab';
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    };

    const onDblClick = (e: MouseEvent) => {
      if (e.target !== imgRef.current) return;
      settle();
      zoomTo(g.current.scale > 1 ? 1 : 2.5, e.clientX, e.clientY);
      if (g.current.scale <= 1.01) reset(true);
    };

    // iOS Safari fires its own pinch gesture events on top of touch events -- swallow them so the
    // page doesn't zoom underneath the lightbox.
    const stopGesture = (e: Event) => e.preventDefault();

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('dblclick', onDblClick);
    el.addEventListener('gesturestart', stopGesture as EventListener, { passive: false });
    el.addEventListener('gesturechange', stopGesture as EventListener, { passive: false });
    el.addEventListener('gestureend', stopGesture as EventListener);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('dblclick', onDblClick);
      el.removeEventListener('gesturestart', stopGesture as EventListener);
      el.removeEventListener('gesturechange', stopGesture as EventListener);
      el.removeEventListener('gestureend', stopGesture as EventListener);
    };
  }, []);

  // Whenever the visible photo changes, snap back to a clean, unzoomed view.
  useEffect(() => {
    g.current.scale = 1;
    g.current.tx = 0;
    g.current.ty = 0;
    g.current.panning = false;
    g.current.mid = null;
    const img = imgRef.current;
    if (img) {
      img.style.transition = 'none';
      img.style.transform = 'translate(0px, 0px) scale(1)';
      img.style.cursor = '';
    }
  }, [index]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    // Top of the entire z-stack: a fullscreen photo is the most "modal" surface in the app and
    // can be opened from inside menus, sheets, the message context menu (z-[100]) and the chat
    // mobile-actions overlay (z-[9999]) -- it has to sit above all of them.
    //
    // stopPropagation on the container: this is portaled to <body>, but React still bubbles the
    // event through the *component* tree back to whatever opened the lightbox -- and that trigger
    // is often a click-to-open element (a cover photo, an avatar). Without this, clicking the X (or
    // the backdrop) closes the lightbox and then the same click re-opens it on the way out.
    //
    // touch-action:none -- the two-finger pinch has to reach our listeners and zoom the <img>,
    // never the page.
    <div
      ref={containerRef}
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/90 animate-fade-in" onClick={onClose} />

      <button
        onClick={onClose}
        className="absolute end-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {images.length > 1 && (
        <>
          <button
            onClick={() => onIndexChange((index - 1 + images.length) % images.length)}
            className="absolute start-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:start-4"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={() => onIndexChange((index + 1) % images.length)}
            className="absolute end-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:end-4"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <img
        ref={imgRef}
        key={index}
        src={cldOptimize(images[index], { width: 1600, crop: 'limit' })}
        alt=""
        decoding="async"
        draggable={false}
        // @ts-expect-error -- fetchpriority is a valid HTML attribute React hasn't typed yet
        fetchpriority="high"
        className="relative z-[5] max-h-[90vh] max-w-full select-none rounded-lg object-contain animate-bubble-in"
        style={{ willChange: 'transform', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <div className="absolute bottom-4 inset-x-0 z-10 flex justify-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => onIndexChange(i)}
              className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/40')}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
