const API = import.meta.env.PUBLIC_API_URL;

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

async function refresh(): Promise<boolean> {
  const r = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!r.ok) return false;
  const { accessToken: t } = await r.json<{ accessToken: string }>();
  accessToken = t;
  return true;
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let r = await fetch(`${API}${path}`, { ...opts, headers, credentials: 'include' });
  if (r.status === 401 && await refresh()) {
    headers.set('Authorization', `Bearer ${accessToken}`);
    r = await fetch(`${API}${path}`, { ...opts, headers, credentials: 'include' });
  }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json<T>();
}
