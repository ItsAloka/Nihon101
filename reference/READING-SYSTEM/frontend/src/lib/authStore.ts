/* NOT BAGEL — auth state. Access token lives in memory only (never localStorage,
 * per the auth design); the refresh token is an HttpOnly cookie the browser
 * sends to the backend. `bootstrapAuth()` silently restores a session on load. */
import { useEffect, useState } from 'react';
import { apiFetch } from './api';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarColor: string;
  bio: string;
  role: string;
  emailVerified: boolean;
  createdAt: number;
}

interface SessionResponse {
  access: string;
  user: AuthUser;
}

let accessToken: string | null = null;
let user: AuthUser | null = null;
let ready = false; // bootstrap finished (session known to be present or absent)
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Called by the API layer after a silent token refresh. */
export function setAccessToken(token: string): void {
  accessToken = token;
  emit();
}

function setSession(res: SessionResponse): void {
  accessToken = res.access;
  user = res.user;
  emit();
}

export function clearSession(): void {
  accessToken = null;
  user = null;
  emit();
}

/* ---------------- React binding ---------------- */

export interface AuthState {
  user: AuthUser | null;
  ready: boolean;
}

export function useAuth(): AuthState {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return { user, ready };
}

/* ---------------- actions ---------------- */

export async function login(email: string, password: string): Promise<void> {
  setSession(await apiFetch<SessionResponse>('/auth/login', { method: 'POST', auth: true, body: { email, password } }));
}

export async function register(input: {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}): Promise<void> {
  setSession(await apiFetch<SessionResponse>('/auth/register', { method: 'POST', auth: true, body: input }));
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST', auth: true });
  } catch {
    /* ignore — clear locally regardless */
  }
  clearSession();
}

let bootstrapped = false;

/** Restore a session on app load. Safe to call from multiple islands. */
export async function bootstrapAuth(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    setSession(await apiFetch<SessionResponse>('/auth/refresh', { method: 'POST', auth: true }));
  } catch {
    /* not logged in */
  }
  ready = true;
  emit();
}
