'use client';

import { useState, type ReactNode } from 'react';
import { Lightbox } from './Lightbox';

// Wraps any thumbnail trigger (an <img>, an avatar, a cover strip) so tapping it opens the photo
// full-screen in the shared Lightbox. Single-image mode -- Lightbox already hides its prev/next
// arrows and dots when given one image.
//
// Renders a role="button" <span> (not a <button>) so it stays valid HTML even nested inside
// another interactive element, and stops the click from bubbling so wrapping it in a card/link
// opens the photo instead of navigating.
export function ViewablePhoto({
  src,
  alt,
  className,
  children,
}: {
  src?: string;
  alt?: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!src) return <>{children}</>;

  function activate(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={alt ? `عرض ${alt}` : 'عرض الصورة'}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') activate(e);
        }}
        className={className}
      >
        {children}
      </span>
      {open && <Lightbox images={[src]} index={0} onIndexChange={() => {}} onClose={() => setOpen(false)} />}
    </>
  );
}
