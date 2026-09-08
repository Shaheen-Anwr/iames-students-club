// Attachment encryption for E2EE chat (docs/e2ee-design.md §5, phase P5). Each attachment gets a
// fresh AES-256-GCM key. The CIPHERTEXT blob is uploaded to the CDN (the server sees only random
// bytes); the key + IV travel inside the encrypted `{ k: 'media' }` inner envelope, so only the
// two participants can turn the blob back into a picture / voice note / file.

import { aesGcmDecrypt, aesGcmEncrypt, b64, randomBytes, unb64, type Bytes } from './crypto';

export interface SealedBlob {
  /** Ciphertext bytes to upload (GCM tag appended). */
  data: Bytes;
  /** base64 raw AES-256 key. */
  mk: string;
  /** base64 96-bit IV. */
  iv: string;
}

function toBytes(buf: ArrayBuffer): Bytes {
  return new Uint8Array(buf) as Bytes;
}

/** Encrypt a file's bytes under a fresh random key. */
export async function sealBlob(plain: ArrayBuffer): Promise<SealedBlob> {
  const mk = randomBytes(32);
  const iv = randomBytes(12);
  const data = await aesGcmEncrypt(mk, toBytes(plain), iv);
  return { data, mk: b64(mk), iv: b64(iv) };
}

/** Reverse of `sealBlob`: fetch already done, `cipher` is the downloaded ciphertext. */
export async function openBlobBytes(cipher: ArrayBuffer, mkB64: string, ivB64: string): Promise<Bytes> {
  return aesGcmDecrypt(unb64(mkB64), toBytes(cipher), unb64(ivB64));
}

/** Download an encrypted attachment from its URL and decrypt it into a Blob. */
export async function fetchAndDecryptBlob(
  url: string,
  mkB64: string,
  ivB64: string,
  mime?: string,
): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`attachment fetch failed: ${res.status}`);
  const plain = await openBlobBytes(await res.arrayBuffer(), mkB64, ivB64);
  return new Blob([plain], mime ? { type: mime } : undefined);
}

/** Same, but returns an object URL ready for an <img>/<audio> src. */
export async function fetchAndOpen(
  url: string,
  mkB64: string,
  ivB64: string,
  mime?: string,
): Promise<string> {
  return URL.createObjectURL(await fetchAndDecryptBlob(url, mkB64, ivB64, mime));
}
