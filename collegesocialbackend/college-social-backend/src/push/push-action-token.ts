import { createHmac, timingSafeEqual } from 'crypto';

// A chat notification's buttons ("تمت القراءة" / "كتم ساعة") run inside the service worker, which
// has no session token. So each chat push carries this small signed token instead: it names one
// user and one conversation, expires after a few days, and is only accepted by
// POST /api/chat/push-action. It travels inside the (encrypted) push payload, so only that device
// ever sees it. The HMAC key is domain-separated from the JWT secret it derives from.

export interface PushActionClaims {
  /** user id */
  u: string;
  /** conversation id */
  c: string;
  /** expiry, unix seconds */
  e: number;
}

const TTL_SECONDS = 3 * 24 * 60 * 60;

function mac(secret: string, body: string): Buffer {
  return createHmac('sha256', `push-action:${secret}`).update(body).digest();
}

export function signPushActionToken(secret: string, userId: string, conversationId: string, now = Date.now()): string {
  const claims: PushActionClaims = { u: userId, c: conversationId, e: Math.floor(now / 1000) + TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${mac(secret, body).toString('base64url')}`;
}

export function verifyPushActionToken(secret: string, token: string, now = Date.now()): PushActionClaims | null {
  const [body, signature] = (token ?? '').split('.');
  if (!body || !signature) return null;
  const given = Buffer.from(signature, 'base64url');
  const expected = mac(secret, body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PushActionClaims;
    if (typeof claims.u !== 'string' || typeof claims.c !== 'string' || typeof claims.e !== 'number') return null;
    return claims.e * 1000 > now ? claims : null;
  } catch {
    return null;
  }
}
