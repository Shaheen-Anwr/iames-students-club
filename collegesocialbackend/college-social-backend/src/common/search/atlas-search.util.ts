import { Logger } from '@nestjs/common';

// MongoDB Atlas Search ($search aggregation stage) for the app's free-text search. Gated behind
// ATLAS_SEARCH=on so it's a complete no-op until (a) the search indexes exist on the cluster and
// (b) the env var is set. Every caller keeps its existing $text / $regex query as a fallback --
// used both when the flag is off and when a $search call errors because the index isn't there
// yet -- so flipping the flag on early just logs once and keeps working.
//
// See docs/ATLAS-SEARCH.md for the index definitions to create in the Atlas UI.

export const ATLAS_SEARCH_ENABLED = process.env.ATLAS_SEARCH === 'on';

// Index names. Override per-deploy if you named them differently in Atlas.
export const ATLAS_INDEX = {
  posts: process.env.ATLAS_INDEX_POSTS ?? 'posts_search',
  questions: process.env.ATLAS_INDEX_QUESTIONS ?? 'questions_search',
  groups: process.env.ATLAS_INDEX_GROUPS ?? 'groups_search',
  users: process.env.ATLAS_INDEX_USERS ?? 'users_search',
};

/** A `$search` stage: fuzzy full-text over `paths`, results already ordered by relevance. */
export function atlasTextStage(index: string, query: string, paths: string[]) {
  return {
    $search: {
      index,
      text: { query, path: paths, fuzzy: { maxEdits: 1, prefixLength: 2 } },
    },
  };
}

const logger = new Logger('AtlasSearch');
let warned = false;

/**
 * Log the first fallback, then stay quiet. A `$search` on a missing index throws a plain
 * MongoServerError, so rather than pattern-match error text we just fall back on ANY error from
 * the $search path -- the fallback query is always correct, only slower.
 */
export function warnAtlasFallbackOnce(err: unknown): void {
  if (warned) return;
  warned = true;
  logger.warn(`Atlas Search unavailable, using $text/$regex fallback: ${(err as Error).message}`);
}
