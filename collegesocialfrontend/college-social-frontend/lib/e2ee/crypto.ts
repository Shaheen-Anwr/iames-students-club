// Low-level WebCrypto helpers for chat E2EE (docs/e2ee-design.md §2). Browser-native only --
// no third-party crypto lib. All curve ops are ECDH/ECDSA P-256; symmetric is AES-256-GCM;
// KDFs are HKDF-SHA-256 and HMAC-SHA-256.
//
// Byte arrays are typed `Bytes` (Uint8Array over a plain ArrayBuffer) -- lib.dom's `BufferSource`
// rejects the wider `Uint8Array<ArrayBufferLike>` the generic now defaults to.

export type Bytes = Uint8Array<ArrayBuffer>;

const subtle = globalThis.crypto?.subtle;

export function e2eeSupported(): boolean {
  return (
    typeof globalThis.crypto?.subtle?.deriveBits === 'function' &&
    typeof indexedDB !== 'undefined' &&
    typeof globalThis.crypto?.getRandomValues === 'function'
  );
}

// --- base64 <-> bytes (no data: prefix) ------------------------------------------------------
export function b64(bytes: Bytes | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
export function unb64(s: string): Bytes {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export function utf8(s: string): Bytes {
  const src = new TextEncoder().encode(s);
  const out = new Uint8Array(src.length);
  out.set(src);
  return out;
}
export function fromUtf8(b: Bytes): string {
  return new TextDecoder().decode(b);
}

export function randomBytes(n: number): Bytes {
  const u8 = new Uint8Array(n);
  globalThis.crypto.getRandomValues(u8);
  return u8;
}

export function concatBytes(...parts: Bytes[]): Bytes {
  const total = parts.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of parts) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

export function bytesEqual(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

function toBytes(buf: ArrayBuffer): Bytes {
  return new Uint8Array(buf);
}

// --- key generation / import / export ------------------------------------------------------
export function generateECDH(extractable = false): Promise<CryptoKeyPair> {
  return subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, extractable, ['deriveBits']);
}
export function generateECDSA(extractable = false): Promise<CryptoKeyPair> {
  return subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, extractable, ['sign', 'verify']);
}

export async function exportPublic(key: CryptoKey): Promise<string> {
  return b64(await subtle.exportKey('spki', key));
}
export function importECDHPublic(spkiB64: string): Promise<CryptoKey> {
  return subtle.importKey('spki', unb64(spkiB64), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}
export function importECDSAPublic(spkiB64: string): Promise<CryptoKey> {
  return subtle.importKey('spki', unb64(spkiB64), { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
}

// --- DH / signatures --------------------------------------------------------------------------
/** 32 raw bytes of shared secret from our ECDH private key and their ECDH public key. */
export async function ecdh(priv: CryptoKey, pub: CryptoKey): Promise<Bytes> {
  return toBytes(await subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256));
}
export async function sign(priv: CryptoKey, data: Bytes): Promise<string> {
  return b64(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, data));
}
export function verify(pub: CryptoKey, sigB64: string, data: Bytes): Promise<boolean> {
  return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64(sigB64), data);
}

// --- KDFs ----------------------------------------------------------------------------------
export async function hkdf(ikm: Bytes, salt: Bytes, info: string, length = 32): Promise<Bytes> {
  const base = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) },
    base,
    length * 8,
  );
  return toBytes(bits);
}
export async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBytes(await subtle.sign('HMAC', k, data));
}
export async function sha256(data: Bytes): Promise<Bytes> {
  return toBytes(await subtle.digest('SHA-256', data));
}

// --- AES-256-GCM -------------------------------------------------------------------------------
export async function aesGcmEncrypt(keyBytes: Bytes, plaintext: Bytes, iv: Bytes, aad?: Bytes): Promise<Bytes> {
  const key = await subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  return toBytes(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext));
}
export async function aesGcmDecrypt(keyBytes: Bytes, ciphertext: Bytes, iv: Bytes, aad?: Bytes): Promise<Bytes> {
  const key = await subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  return toBytes(await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, ciphertext));
}
