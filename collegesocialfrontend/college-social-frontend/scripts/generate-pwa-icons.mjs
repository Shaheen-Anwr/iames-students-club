// Regenerates the raster PWA icons in public/icons/ from the single source of truth,
// app/icon.svg, using Next's bundled image renderer (next/og) -- no extra dependency.
//
//   npm run gen:icons
//
// Run this whenever the brand mark in app/icon.svg changes. The favicon and the
// apple-touch icon are generated automatically by Next at build time (app/icon.svg and
// app/apple-icon.tsx); these PNGs exist only for the installable PWA manifest and for
// browsers without SVG-favicon support.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// next/og publishes a CJS entry; load it through require so this plain .mjs script works
// without a build step.
const { ImageResponse } = createRequire(import.meta.url)('next/og');

const ROOT = process.cwd();
const svg = readFileSync(join(ROOT, 'app', 'icon.svg'), 'utf8');
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const NAVY = '#141520';
const INK = '#0B0C12';

async function render(element, px, outPath) {
  const res = new ImageResponse(element, { width: px, height: px });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(ROOT, outPath), buf);
  console.log(`  ${outPath}  (${px}x${px}, ${(buf.length / 1024).toFixed(1)} KB)`);
}

// Edge-to-edge: the mark's own rounded tile is the icon (manifest purpose "any").
const full = (px) => ({
  type: 'div',
  props: {
    style: { display: 'flex', width: '100%', height: '100%' },
    children: { type: 'img', props: { src: dataUri, width: px, height: px, alt: '' } },
  },
});

// Full-bleed navy with the mark inside the maskable safe zone (~62%), so platform-applied
// circle/squircle masks never clip it.
const masked = (px) => ({
  type: 'div',
  props: {
    style: {
      display: 'flex',
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      background: `linear-gradient(135deg, ${NAVY}, ${INK})`,
    },
    children: {
      type: 'img',
      props: { src: dataUri, width: Math.round(px * 0.62), height: Math.round(px * 0.62), alt: '' },
    },
  },
});

console.log('Generating PWA icons from app/icon.svg:');
await render(full(192), 192, 'public/icons/icon-192.png');
await render(full(512), 512, 'public/icons/icon-512.png');
await render(masked(512), 512, 'public/icons/icon-maskable-512.png');
await render(masked(180), 180, 'public/icons/apple-touch-icon.png');
console.log('Done.');
