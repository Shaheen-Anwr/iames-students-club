import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Brand constants shared by the generated icon / OG-image routes and the app metadata.
export const BRAND = {
  name: 'IAEMS Students Club',
  shortName: 'IAEMS',
  community: 'IAEMS Students Community',
  tagline: 'Lectures, files, schedule & chat for the whole campus in one place.',
  // App-shell / icon-tile ground and the two design-system accents (indigo -> amber).
  navy: '#141520',
  ink: '#0B0C12',
  accent: '#8B7CFF',
  accentWarm: '#F7B733',
} as const;

// The brand mark lives in one place: app/icon.svg. Node-runtime image routes read it from
// disk so there is never a second copy to keep in sync.
export function logoSvg(): string {
  return readFileSync(join(process.cwd(), 'app', 'icon.svg'), 'utf8');
}

export function logoDataUri(): string {
  return `data:image/svg+xml;base64,${Buffer.from(logoSvg()).toString('base64')}`;
}
