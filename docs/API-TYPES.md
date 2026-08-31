# Typed API contract

The frontend's API calls are typed against the backend's actual routes + DTOs, generated from
an OpenAPI 3 spec. A renamed or removed endpoint becomes a **compile error**, not a runtime 404.

## Files

| File | What | Committed? |
|---|---|---|
| `collegesocialbackend/.../openapi.json` | OpenAPI 3 spec, generated from the NestJS controllers + class-validator DTOs | yes (diff it in PRs to see API changes) |
| `collegesocialfrontend/.../lib/api-types.ts` | `paths` / `operations` / `components` TS types, generated from `openapi.json` | yes |
| `collegesocialfrontend/.../lib/api-typed.ts` | `apiGet` / `apiPost` / `apiPatch` / `apiDelete` — thin typed wrappers over `lib/api.ts` | hand-written |

## Regenerate after any backend route or DTO change

```bash
cd collegesocialbackend/college-social-backend && npm run gen:openapi
cd ../../collegesocialfrontend/college-social-frontend && npm run gen:api-types
```

`gen:openapi` boots the app (no HTTP listener) against the normal MongoDB purely to reflect
routes; nothing is written to the DB. It runs `nest build` first — the swagger CLI plugin
(`nest-cli.json`) is what auto-derives request-body schemas from the `class-validator` decorators
so you don't have to sprinkle `@ApiProperty` everywhere.

## Using it

```ts
import { apiGet, apiPost } from '@/lib/api-typed';

// path is autocompleted + validated; `?query` suffix is allowed (passed through untyped)
const rooms = await apiGet<'/rooms', StudyRoomListItem[]>('/rooms');
await apiPost('/wall', { body: text }); // body typed from CreateWallPostDto
```

**Coverage today:** paths, methods, and **request bodies** are fully typed. **Response bodies**
are `unknown` unless the endpoint carries an explicit `@ApiOkResponse({ type: SomeDto })` on the
backend — until then pass the response type as the generic (same as `api.get<T>()` does now).
Adding `@ApiOkResponse` per endpoint + migrating call sites from `api.*` to `api*` is the
incremental follow-up; `lib/api.ts` stays as-is for everything not yet migrated.
