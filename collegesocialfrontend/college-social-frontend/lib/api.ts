import Cookies from 'js-cookie';

// Relative by default -- see next.config.js's rewrites(), which proxies /api/* to the real
// backend so the refresh-token cookie stays same-site instead of a droppable cross-site one.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';
export const TOKEN_COOKIE = 'college_social_token';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | undefined {
  return Cookies.get(TOKEN_COOKIE);
}

export function setToken(token: string) {
  // The JWT itself expires in 15min server-side; the cookie is kept around longer so a silent
  // refresh (see requestWithRefresh below) can transparently replace it across browser sessions.
  Cookies.set(TOKEN_COOKIE, token, { expires: 30, sameSite: 'lax' });
}

export function clearToken() {
  Cookies.remove(TOKEN_COOKIE);
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as { message: unknown }).message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return fallback;
}

// Shared in-flight refresh promise so concurrent 401s trigger a single /auth/refresh call.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('refresh failed');
        const data = (await res.json()) as { accessToken: string };
        setToken(data.accessToken);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Auth endpoints that must never trigger a refresh-and-retry themselves.
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'];

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });

  if (res.status === 401 && !isRetry && !NO_REFRESH_PATHS.includes(path)) {
    try {
      await refreshAccessToken();
      return request<T>(path, options, true);
    } catch {
      clearToken();
      // fall through -- report the original 401 below
    }
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, extractMessage(body, `فشل الطلب (${res.status})`));
  }

  return body as T;
}

export type AiStreamEvent =
  | { type: 'delta'; text: string; stub?: boolean }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; summary: string }
  | { type: 'done'; message: import('./types').AiMessage }
  | { type: 'error'; message: string };

export interface AiMessageAttachment {
  url: string;
  type: 'image' | 'document';
  mimeType?: string;
}

// Consumes the AI assistant's streamed reply (see AiController.sendMessage's SSE response).
// Native EventSource can't do POST + a custom Authorization header, so this is a manual fetch() +
// ReadableStream reader instead, reusing the same token/refresh-on-401 logic as request() above.
export async function streamAiMessage(
  conversationId: string,
  text: string,
  onEvent: (event: AiStreamEvent) => void,
  attachment?: AiMessageAttachment,
  sharedPostId?: string,
  signal?: AbortSignal,
): Promise<void> {
  async function attempt(isRetry: boolean): Promise<void> {
    const token = getToken();
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${API_URL}/ai/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ text, ...(attachment ? { attachment } : {}), ...(sharedPostId ? { sharedPostId } : {}) }),
      signal,
    });

    if (res.status === 401 && !isRetry) {
      await refreshAccessToken();
      return attempt(true);
    }
    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => '');
      let body: unknown = null;
      try {
        body = JSON.parse(raw);
      } catch {
        /* not json */
      }
      throw new ApiError(res.status, extractMessage(body, `فشل الطلب (${res.status})`));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (line) {
          try {
            onEvent(JSON.parse(line.slice(6)) as AiStreamEvent);
          } catch {
            /* skip malformed frame */
          }
        }
      }
    }
  }

  return attempt(false);
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<T>(path, { method: 'POST', body: formData });
  },
  uploadMany: <T>(path: string, files: File[]) => {
    const formData = new FormData();
    for (const file of files) formData.append('files', file);
    return request<T>(path, { method: 'POST', body: formData });
  },
};
