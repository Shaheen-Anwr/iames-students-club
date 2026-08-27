'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { SmartImage } from '@/components/ui/SmartImage';
import { Lightbox } from '@/components/ui/Lightbox';

// Facebook-style photo grid: 1 image fills the width, 2 sit side by side, 3 is one tall tile plus
// two stacked, and 4+ is a 2x2 grid with a "+N" overlay on the last tile for anything beyond 4.
export function ImageGallery({ images }: { images: string[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  const extra = images.length - 4;

  return (
    <>
      <div
        className={cn(
          'grid gap-1 overflow-hidden rounded-xl2',
          images.length === 1 && 'grid-cols-1',
          images.length === 2 && 'grid-cols-2',
          images.length === 3 && 'grid-cols-2 grid-rows-2',
          images.length >= 4 && 'grid-cols-2 grid-rows-2',
        )}
      >
        {images.slice(0, 4).map((url, i) => (
          <button
            key={i}
            onClick={() => setOpenIndex(i)}
            className={cn(
              'relative overflow-hidden bg-surface-2',
              images.length === 1 && 'aspect-video',
              images.length === 2 && 'aspect-square',
              images.length === 3 && i === 0 && 'row-span-2 aspect-auto',
              images.length === 3 && i !== 0 && 'aspect-square',
              images.length >= 4 && 'aspect-square',
            )}
          >
            <SmartImage
              src={url}
              width={images.length === 1 ? 680 : 400}
              quality="auto:eco"
              className="h-full w-full"
              imgClassName="transition-transform hover:scale-105"
            />
            {i === 3 && extra > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-semibold text-white">
                +{extra}
              </div>
            )}
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <Lightbox images={images} index={openIndex} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
      )}
    </>
  );
}
