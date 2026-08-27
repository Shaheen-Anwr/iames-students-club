import { ImageResponse } from 'next/og';
import { BRAND, logoDataUri } from '@/lib/brand';

// Generated at build time -> /opengraph-image.png, auto-attached to every page's OG/Twitter
// tags via the metadata system. English-forward on purpose: ImageResponse would need an
// embedded Arabic font file to render RTL text, and the share card is the one surface where
// a Latin lockup is acceptable.
export const runtime = 'nodejs';
export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: `radial-gradient(1100px 700px at 88% -10%, ${BRAND.accent}22, transparent 60%), radial-gradient(900px 600px at -5% 110%, ${BRAND.accentWarm}1f, transparent 55%), linear-gradient(135deg, ${BRAND.navy}, ${BRAND.ink})`,
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDataUri()} width={112} height={112} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.5 }}>{BRAND.name}</span>
            <span style={{ fontSize: 20, color: '#FFFFFFB3' }}>{BRAND.community}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1.5, maxWidth: 920 }}>
            The whole campus, in one place.
          </span>
          <span style={{ fontSize: 30, color: '#FFFFFFCC', maxWidth: 860 }}>{BRAND.tagline}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              padding: '10px 22px',
              borderRadius: 999,
              background: `linear-gradient(115deg, ${BRAND.accent}, ${BRAND.accentWarm})`,
              color: BRAND.ink,
            }}
          >
            Social · Study · Schedule
          </span>
          <span style={{ fontSize: 20, color: '#FFFFFF80' }}>For IAEMS students & faculty</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
