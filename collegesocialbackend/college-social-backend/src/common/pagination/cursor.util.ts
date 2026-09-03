import { Types } from 'mongoose';

// Opaque keyset ("cursor") pagination for reverse-chronological lists. Encodes the last row's
// createdAt + _id (and an optional tier tag for the feed's two-tier academic-year sort) into one
// URL-safe string. Keyset beats skip/limit here because the compound indexes end in
// `createdAt: -1` -- every page is an index range read, O(log n) at any depth, where `.skip(N)`
// walks and discards N docs first.

export interface Cursor {
  /** last row's createdAt, epoch millis */
  c: number;
  /** last row's _id, hex */
  id: string;
  /** optional tier tag ('a' = viewer's own academic year, 'b' = other years) */
  t?: 'a' | 'b';
}

export function encodeCursor(cur: Cursor): string {
  return Buffer.from(`${cur.t ?? ''}|${cur.c}|${cur.id}`).toString('base64url');
}

export function decodeCursor(raw?: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const [t, c, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    if (!c || !id || !Types.ObjectId.isValid(id) || Number.isNaN(Number(c))) return null;
    return { c: Number(c), id, t: t === 'a' || t === 'b' ? t : undefined };
  } catch {
    return null;
  }
}

/** Mongo match for "strictly older than the cursor" on a `{ createdAt: -1, _id: -1 }` sort. */
export function keysetMatch(cur: Cursor): Record<string, unknown> {
  const d = new Date(cur.c);
  return {
    $or: [{ createdAt: { $lt: d } }, { createdAt: d, _id: { $lt: new Types.ObjectId(cur.id) } }],
  };
}

export const KEYSET_SORT = { createdAt: -1, _id: -1 } as const;

/**
 * Build the next-page cursor from a just-fetched page, or null when it's the last page. Accepts
 * Mongoose docs directly -- `createdAt` comes from `timestamps: true` and isn't on the schema
 * class type, so this reads it structurally and coerces.
 */
export function nextCursorFrom(
  rows: ReadonlyArray<{ _id: unknown; createdAt?: unknown }>,
  limit: number,
  tier?: 'a' | 'b',
): string | null {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1];
  return encodeCursor({
    c: new Date(last.createdAt as string | number | Date).getTime(),
    id: String(last._id),
    t: tier,
  });
}
