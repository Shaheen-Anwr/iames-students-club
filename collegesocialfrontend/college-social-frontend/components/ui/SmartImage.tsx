'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { cldBlurPlaceholder, cldOptimize } from '@/lib/images';

// A photo that loads the way a fast app's photos load: a ~1KB blurred version paints instantly,
// the real (format-modernized, right-sized, progressive) image streams in on top and cross-fades
// once decoded, and anything off-screen isn't fetched until it's near the viewport. Cloudinary
// does the format/size/blur work at delivery time -- this component is just the wiring.
export function SmartImage({
  src,
  alt = '',
  width,
  quality,
  priority = false,
  className,
  imgClassName,
}: {
  // Raw stored URL (Cloudinary or local). Optimization is applied here.
  src: string;
  alt?: string;
  // Target render width in CSS px; a DPR-2 variant is what actually gets requested.
  width: number;
  quality?: string;
  // Skip lazy-loading for an image that's above the fold (e.g. an open lightbox).
  priority?: boolean;
  // Wrapper classes -- set the box size / aspect ratio here.
  className?: string;
  // Classes for the <img> itself -- e.g. object-fit, hover transforms.
  imgClassName?: string;
}) {
  const optimized = cldOptimize(src, { width: width * 2, quality }) ?? src;
  const placeholder = cldBlurPlaceholder(src);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // An <img> that's already in cache when it mounts may fire `load` before React attaches the
  // handler -- reconcile against the DOM's own `complete` flag so it doesn't stay blurred forever.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, [optimized]);

  return (
    <div className={cn('relative overflow-hidden bg-surface-2', className)}>
      {placeholder && !loaded && (
        <img
          src={placeholder}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
        />
      )}
      <img
        ref={imgRef}
        src={optimized}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cn(
          // `transition` (not `transition-opacity`) so a caller-supplied `imgClassName` with its
          // own `transition-transform` for a hover effect doesn't cancel the opacity fade.
          'relative h-full w-full object-cover transition duration-500',
          loaded ? 'opacity-100' : 'opacity-0',
          imgClassName,
        )}
      />
    </div>
  );
}
