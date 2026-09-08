// Safety numbers for out-of-band verification (docs/e2ee-design.md §8, phase P4). Two people who
// can see each other's screen (or read it aloud) compare a 60-digit code; if it matches, no one
// is sitting in the middle. Symmetric -- both devices derive the same number from the pair of
// identity public keys, regardless of who is "A".
//
// Pure: only WebCrypto. No network, no storage.

import { concatBytes, sha256, unb64, utf8, type Bytes } from './crypto';

const SN_INFO = 'iaems-e2ee-safety-number-v1';
const GROUPS = 12; // 12 groups of 5 digits = a 60-digit code, same length as Signal's
const DIGITS_PER_GROUP = 5;
const GROUP_MOD = 100000; // 10 ** DIGITS_PER_GROUP

function bytesToDigits(src: Bytes): string {
  let out = '';
  for (let g = 0; g < GROUPS; g++) {
    // 5 bytes -> a 40-bit big-endian integer -> 5 decimal digits.
    let acc = 0;
    for (let i = 0; i < 5; i++) acc = acc * 256 + src[g * 5 + i];
    out += String(acc % GROUP_MOD).padStart(DIGITS_PER_GROUP, '0');
  }
  return out;
}

/**
 * The 60-digit safety number for a conversation, from both parties' identity public keys
 * (base64 SPKI). Order-independent.
 */
export async function computeSafetyNumber(identityKeyA: string, identityKeyB: string): Promise<string> {
  const [lo, hi] = [identityKeyA, identityKeyB].sort();
  // Two chained SHA-256 rounds give 64 bytes; we need 60 (12 * 5).
  const h1 = await sha256(concatBytes(unb64(lo), unb64(hi), utf8(SN_INFO)));
  const h2 = await sha256(concatBytes(h1, utf8(SN_INFO)));
  return bytesToDigits(concatBytes(h1, h2).slice(0, GROUPS * 5));
}

/** "12345 67890 …" — groups of 5, for display. */
export function formatSafetyNumber(sn: string): string {
  return (sn.match(/.{1,5}/g) ?? []).join(' ');
}
