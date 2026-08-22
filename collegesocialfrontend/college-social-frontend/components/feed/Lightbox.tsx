'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
        src={images[index]}
        alt=""
        className="relative z-[5] max-h-[90vh] max-w-full rounded-lg object-contain animate-bubble-in"
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
