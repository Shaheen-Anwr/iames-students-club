# Atlas Search setup

The app's free-text search (`GET /api/search?q=…` — the top-bar box and the ⌘K palette) runs on
MongoDB's built-in `$text` / `$regex` by default. That works with zero setup but has no typo
tolerance, weak ranking, and the `groups` / `users` legs are unindexed collection scans.

Turning on Atlas Search swaps in a `$search` aggregation stage for all four legs — fuzzy matching,
relevance ordering, real indexes. The code is already wired (`src/common/search/atlas-search.util.ts`
+ the `search()` method in `posts` / `qa` / `groups` / `users` services); it stays dormant until
you do the two steps below.

## Tier limit — M0 free clusters allow only **3** Atlas Search indexes

M0 (and M2) cap the number of search indexes (M0 = 3, M2 = 5, M5 = 10, M10+ = unlimited). On M0,
create these **3**, in priority order, and skip `questions_search` — the Q&A search leg just keeps
using `$text` automatically (it logs the fallback once and works):

1. `users_search`  — replaces an unindexed `$regex` scan (biggest win)
2. `groups_search` — replaces an unindexed `$regex` scan
3. `posts_search`  — largest content collection

If you're on M10+ or don't mind upgrading, create all four.

## 1. Create the indexes (Atlas UI → Cluster → **Atlas Search** tab → **Create Search Index** → **JSON Editor**)

Each is a **Search Index** (not a normal index, and not a Vector Search index), on the named
collection, in the app's database (`college-social`).

**`posts_search`** on `posts`:
```json
{ "mappings": { "dynamic": false, "fields": {
  "caption": { "type": "string" }
} } }
```

**`questions_search`** on `questions`:
```json
{ "mappings": { "dynamic": false, "fields": {
  "title": { "type": "string" },
  "body":  { "type": "string" }
} } }
```

**`groups_search`** on `studygroups`:
```json
{ "mappings": { "dynamic": false, "fields": {
  "name":        { "type": "string" },
  "description":  { "type": "string" }
} } }
```
> Confirm the collection name in Atlas — Mongoose pluralises `StudyGroup` to `studygroups`.

**`users_search`** on `users`:
```json
{ "mappings": { "dynamic": false, "fields": {
  "name":      { "type": "string" },
  "collegeId": { "type": "string" }
} } }
```

Index builds take a minute or two on a small collection; the status goes **Active** when ready.

## 2. Flip the switch

Set on the backend host (Render):
```
ATLAS_SEARCH=on
```
Redeploy / restart. That's it.

If you named the indexes differently, also set `ATLAS_INDEX_POSTS` / `_QUESTIONS` / `_GROUPS` /
`_USERS`.

## Safety / rollback

- Setting `ATLAS_SEARCH=on` **before** the indexes are Active is safe: the first search logs
  `Atlas Search unavailable, using $text/$regex fallback: …` once and every search keeps working
  on the old path.
- To roll back, unset `ATLAS_SEARCH` and restart. No data migration either way — the indexes are
  derived, deleting them costs nothing.
- Visibility scoping (شعبة split for posts/questions, public-only for groups) is applied as a
  `$match` stage right after `$search`, identical to the fallback queries — Atlas Search never
  widens what a user can see.

## Not covered here

`wall` and `marketplace` still use `$text` — they aren't part of the unified search box. Add them
the same way if you wire them in later.
