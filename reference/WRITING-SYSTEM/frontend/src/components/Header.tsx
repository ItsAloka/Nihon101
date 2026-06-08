/* NOT BAGEL — site header. Part of the page island; owns the theme toggle. */
import { useEffect, useState } from 'react';
import { Icon, Avatar } from './ui';
import { I } from '../lib/icons';
import { CATEGORIES } from '../data/seed';
import { nav, applyTheme, getTheme, type Route, type Theme } from '../lib/store';
import { useAuth } from '../lib/authStore';
import { categoryApi } from '../lib/content';

export function Header({ route }: { route: Route }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<Theme>('light');
  // Hydrate from the value the inline head script already applied (no flash).
  useEffect(() => { setTheme(getTheme()); }, []);

  // Nav starts from the seed defaults (stable SSR), then reflects the live
  // top-6 categories by post count once the API responds.
  const [topCats, setTopCats] = useState(CATEGORIES.map((c) => ({ id: c.id, label: c.label })));
  useEffect(() => {
    categoryApi.list()
      .then((cs) => setTopCats(cs.slice(0, 6).map((c) => ({ id: c.id, label: c.label }))))
      .catch(() => { /* keep seed defaults */ });
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  const navItems = [
    { id: 'home', label: 'Home', view: 'home' as const, arg: null as string | null },
    ...topCats.map((c) => ({ id: c.id, label: c.label, view: 'category' as const, arg: c.id })),
  ];

  return (
    <header className="hdr">
      <div className="wrap hdr-row">
        <a className="brand" href="/" style={{ cursor: 'pointer' }}>
          <img src="/assets/logo.png" alt="Not Bagel" />
          <span className="brand-name">Not<span className="b2">Bagel</span></span>
        </a>
        <nav className="nav">
          {navItems.map((n) => {
            const active = n.view === 'home'
              ? route.view === 'home'
              : route.view === 'category' && route.arg === n.arg;
            return (
              <a key={n.id} className={active ? 'active' : ''}
                onClick={() => nav(n.view, n.arg)} style={{ cursor: 'pointer' }}>{n.label}</a>
            );
          })}
        </nav>
        <div className="hdr-right">
          <div className="search-mini" onClick={() => nav('search')}>
            <Icon d={I.search} size={17} />
            <span>Search…</span>
            <kbd>/</kbd>
          </div>
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
            <Icon d={theme === 'dark' ? I.sun : I.moon} size={19} />
          </button>
          <button className="icon-btn" onClick={() => nav('profile', 'you')} title="Notifications">
            <Icon d={I.bell} size={19} />
          </button>
          <button className="btn btn-primary" onClick={() => nav(user ? 'editor' : 'auth')}>
            <Icon d={I.edit} size={17} /> Write
          </button>
          {user ? (
            <a onClick={() => nav('profile', 'you')} style={{ cursor: 'pointer' }}>
              <Avatar user={{ name: user.displayName, color: user.avatarColor }} size={40} />
            </a>
          ) : (
            <button className="btn btn-ghost" onClick={() => nav('auth')}>Sign in</button>
          )}
        </div>
      </div>
    </header>
  );
}
