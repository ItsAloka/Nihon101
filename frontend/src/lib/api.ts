const API = import.meta.env.PUBLIC_API_URL;

export type User = { id: string; email: string; displayName: string; role: string };

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const getAccessToken = () => accessToken;

/** Ask the backend to rotate the refresh cookie and hand back a new access token. */
export async function silentRefresh(): Promise<User | null> {
  try {
    const r = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!r.ok) {
      accessToken = null;
      return null;
    }
    const { access, user } = (await r.json()) as { access: string; user: User };
    accessToken = access;
    return user;
  } catch {
    accessToken = null;
    return null;
  }
}

/** Authenticated fetch with one transparent refresh-and-retry on 401. */
export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let r = await fetch(`${API}${path}`, { ...opts, headers, credentials: 'include' });
  if (r.status === 401 && (await silentRefresh())) {
    headers.set('Authorization', `Bearer ${accessToken}`);
    r = await fetch(`${API}${path}`, { ...opts, headers, credentials: 'include' });
  }
  if (!r.ok) {
    let code = `${r.status}`;
    try {
      const body = (await r.json()) as { error?: string };
      if (body.error) code = body.error;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(code, r.status);
  }
  return r.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

type AuthResp = { access: string; user: User };

export const authApi = {
  async register(email: string, password: string, displayName: string): Promise<User> {
    const { access, user } = await post<AuthResp>('/auth/register', { email, password, displayName });
    accessToken = access;
    return user;
  },
  async login(email: string, password: string): Promise<User> {
    const { access, user } = await post<AuthResp>('/auth/login', { email, password });
    accessToken = access;
    return user;
  },
  async logout(): Promise<void> {
    await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    accessToken = null;
  },
  forgot(email: string, locale: 'ja' | 'en') {
    return post('/auth/forgot', { email, locale });
  },
  reset(token: string, password: string) {
    return post('/auth/reset', { token, password });
  },
};

function post<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}
