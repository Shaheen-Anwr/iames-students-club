// Typed thin wrappers over `api` (lib/api.ts), keyed off the generated OpenAPI paths
// (lib/api-types.ts). Gives editor autocomplete for real endpoints + compile errors on typos or
// routes that were removed/renamed on the backend -- the drift that keeps biting during parallel
// edits.
//
// Regenerate after any backend route/DTO change:
//   cd collegesocialbackend/college-social-backend && npm run gen:openapi
//   cd collegesocialfrontend/college-social-frontend && npm run gen:api-types
//
// Coverage note: request bodies + query params are typed from the class-validator DTOs
// automatically. RESPONSE bodies are only typed for endpoints that carry an explicit
// `@ApiOkResponse({ type: ... })` on the backend -- until then pass the response type as the
// generic (`apiGet<'/x', MyType>('/x')`), same as `api.get<MyType>('/x')` today. Migrating
// endpoints to typed responses is the incremental follow-up.

import type { paths } from './api-types';
import { api } from './api';

type HasMethod<P extends keyof paths, M extends string> = M extends keyof paths[P]
  ? paths[P][M] extends { responses: unknown }
    ? true
    : false
  : false;

type PathsForMethod<M extends string> = {
  [P in keyof paths]: HasMethod<P, M> extends true ? P : never;
}[keyof paths];

export type GetPath = PathsForMethod<'get'> & string;
export type PostPath = PathsForMethod<'post'> & string;
export type PatchPath = PathsForMethod<'patch'> & string;
export type PutPath = PathsForMethod<'put'> & string;
export type DeletePath = PathsForMethod<'delete'> & string;

type Json2xx<Op> = Op extends { responses: { 200: { content: { 'application/json': infer R } } } }
  ? R
  : Op extends { responses: { 201: { content: { 'application/json': infer R } } } }
    ? R
    : unknown;

type ReqBody<Op> = Op extends { requestBody: { content: { 'application/json': infer B } } } ? B : unknown;

// A concrete path, optionally followed by a `?query` string (which is passed through untyped --
// the base path is what gets validated).
type WithQuery<P extends string> = P | `${P}?${string}`;

export function apiGet<P extends GetPath, T = Json2xx<paths[P] extends { get: infer G } ? G : never>>(
  path: WithQuery<P>,
): Promise<T> {
  return api.get<T>(path);
}

export function apiPost<
  P extends PostPath,
  T = Json2xx<paths[P] extends { post: infer O } ? O : never>,
>(path: P, body?: ReqBody<paths[P] extends { post: infer O } ? O : never>): Promise<T> {
  return api.post<T>(path, body);
}

export function apiPatch<
  P extends PatchPath,
  T = Json2xx<paths[P] extends { patch: infer O } ? O : never>,
>(path: P, body?: ReqBody<paths[P] extends { patch: infer O } ? O : never>): Promise<T> {
  return api.patch<T>(path, body);
}

export function apiDelete<P extends DeletePath, T = Json2xx<paths[P] extends { delete: infer O } ? O : never>>(
  path: P,
): Promise<T> {
  return api.delete<T>(path);
}
