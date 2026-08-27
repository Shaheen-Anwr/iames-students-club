import { useEffect, useState } from 'react';
import { cn, initials } from '@/lib/utils';
import { cldOptimize } from '@/lib/images';
import { ViewablePhoto } from './ViewablePhoto';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ring?: boolean;
  online?: boolean;
  // Opt-in: tap the photo to open it full-screen. Off by default so control avatars
  // (nav menu, pickers, the uploader's edit button) stay plain.
  viewable?: boolean;
}

const sizeClasses = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-24 w-24 text-2xl',
};

// Longest edge actually rendered per size -- keeps the delivered avatar a few KB instead of
// shipping a multi-MB original into a small circle.
const sizePx = { xs: 96, sm: 96, md: 96, lg: 160, xl: 320 } as const;

const dotSizeClasses = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-4 w-4',
};

export function Avatar({ src, name, size = 'md', className, ring, online, viewable }: AvatarProps) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [src]);

  const thumbSrc = src ? cldOptimize(src, { width: sizePx[size], height: sizePx[size], crop: 'thumb' }) : undefined;
  const showPhoto = Boolean(thumbSrc) && !errored;

  const image = (
    // Uploaded avatars are user photos from the backend; keep as plain <img> to avoid
    // configuring next/image remote patterns for a dynamic, per-deployment backend origin.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={thumbSrc} alt={name} className="h-full w-full object-cover" onError={() => setErrored(true)} />
  );

  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-full bg-gradient-accent font-semibold text-white',
          ring && 'ring-2 ring-surface',
          sizeClasses[size],
          className,
        )}
      >
        {showPhoto ? (
          viewable ? (
            <ViewablePhoto src={cldOptimize(src, { width: 1600 })} alt={name} className="block h-full w-full cursor-zoom-in">
              {image}
            </ViewablePhoto>
          ) : (
            image
          )
        ) : (
          <span>{initials(name) || '?'}</span>
        )}
      </div>
      {online && (
        <span
          className={cn(
            'absolute bottom-0 end-0 rounded-full bg-emerald-500 ring-2 ring-surface',
            dotSizeClasses[size],
          )}
        />
      )}
    </div>
  );
}
