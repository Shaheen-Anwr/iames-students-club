import { ImageResponse } from 'next/og';
import { BRAND, logoDataUri } from '@/lib/brand';

// Generated at build time -> /apple-icon.png, auto-linked as <link rel="apple-touch-icon">.
// iOS masks its own rounded corners, so the mark sits on a full-bleed navy field with a
// little breathing room rather than the SVG's own rounded tile.
export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.ink})`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoDataUri()} width={132} height={132} alt="" />
      </div>
    ),
    { ...size },
  );
}
