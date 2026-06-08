/* NOT BAGEL — client-side helpers: routing, likes/saves store, theme, toast.
 *
 * Navigation here is real URL navigation (one page per route) rather than the
 * prototype's in-memory view switch — that's the "big site" upgrade: every
 * screen has a shareable, SSR-able URL. View components keep calling
 * `nav(view, arg)` exactly as before; it just resolves to a URL now.
 */
import { useState, useEffect } from 'react';

export type View = 'home' | 'category' | 'article' | 'editor' | 'profile' | 'search' | 'auth';
export interface Route {
  view: View;
  arg?: string | null;
}

/** Map a logical (view, arg) to its URL. */
export function hrefFor(view: View, arg?: string | null): string {
  switch (view) {
    case 'category': return `/c/${arg}`;
    case 'article': return `/post/${arg}`;
    case 'editor': return '/write';
    case 'profile': return `/u/${arg ?? 'you'}`;
    case 'search': return '/search';
    case 'auth': return '/auth';
    default: return '/';
  }
}

/** Navigate to a route (full page load — real URLs). No-op during SSR. */
export function nav(view: View, arg?: string | null): void {
  if (typeof window === 'undefined') return;
  window.location.href = hrefFor(view, arg);
}

/* ---------------- likes / saves store (localStorage-backed) ---------------- */

export interface Store {
  likes: Set<string>;
  saves: Set<string>;
  toggle: (which: 'likes' | 'saves', id: string) => void;
}

export function useStore(): Store {
  const load = (k: string): Set<string> => {
    try {
      return new Set(JSON.parse(localStorage.getItem(k) || '[]'));
    } catch {
      return new Set();
    }
  };
  // Start empty so SSR and the first client render match; hydrate from
  // localStorage in an effect (avoids React hydration mismatch warnings).
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [saves, setSaves] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLikes(load('nb_likes'));
    setSaves(load('nb_saves'));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem('nb_likes', JSON.stringify([...likes]));
  }, [likes, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem('nb_saves', JSON.stringify([...saves]));
  }, [saves, ready]);

  const toggle = (which: 'likes' | 'saves', id: string) => {
    const setter = which === 'likes' ? setLikes : setSaves;
    setter((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  return { likes, saves, toggle };
}

/* ---------------- theme ---------------- */

export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'light';
  return (localStorage.getItem('nb_theme') as Theme) || 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('nb_theme', theme);
}

/* ---------------- toast ---------------- */

/** Fire a transient toast. The <Toaster /> island in the layout renders it. */
export function emitToast(msg: string): void {
  if (!msg || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('nb:toast', { detail: msg }));
}

/* ---------------- formatting ---------------- */

/** 2480 -> "2.5k", 980 -> "980". */
export function fmt(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n);
}
