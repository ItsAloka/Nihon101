/* NOT BAGEL — API client. Attaches the in-memory access token, sends the
 * refresh cookie on auth calls (`credentials: 'include'`), and retries once
 * through /auth/refresh on a 401. */
import { getAccessToken, setAccessToken, clearSession } from './authStore';

export const API_URL = (import.meta.env.PUBLIC_API_URL as string | undefined) || 'http://localhost:8787';

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
    this.name = 'ApiError';
  }
}

export interface FetchOpts {
  method?: string;
  body?: unknown;
  /** Send the refresh cookie (login/register/refresh/logout/me). */
  auth?: boolean;
  /** Internal: marks the replayed request after a refresh. */
  _retry?: boolean;
}

export async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { method = 'GET', body, auth = false } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_URL + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: auth ? 'include' : 'same-origin',
  });

  // One silent refresh + replay on expired access token.
  if (res.status === 401 && token && !opts._retry && path !== '/auth/refresh') {
    if (await tryRefresh()) return apiFetch<T>(path, { ...opts, _retry: true });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || 'request_failed');
  return data as T;
}

/** Upload a single image file (multipart). Returns its public URL. Retries once
 * through /auth/refresh on a 401, like apiFetch. */
export async function uploadImage(file: File, _retry = false): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAccessToken();
  const res = await fetch(API_URL + '/media', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (res.status === 401 && token && !_retry) {
    if (await tryRefresh()) return uploadImage(file, true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || 'upload_failed');
  return (data as { url: string }).url;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(API_URL + '/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) {
      clearSession();
      return false;
    }
    const data = (await res.json()) as { access: string };
    setAccessToken(data.access);
    return true;
  } catch {
    return false;
  }
}
