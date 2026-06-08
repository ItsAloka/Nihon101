/* NOT BAGEL — site footer. */
import { CATEGORIES } from '../data/seed';
import { nav } from '../lib/store';

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <a className="brand" href="/" style={{ cursor: 'pointer', marginBottom: 14 }}>
              <img src="/assets/logo.png" alt="" style={{ width: 32, height: 32 }} />
              <span className="brand-name" style={{ fontSize: 19 }}>Not<span className="b2">Bagel</span></span>
            </a>
            <p style={{ color: 'var(--text-2)', fontSize: 14, maxWidth: 280, lineHeight: 1.6 }}>
              The home for otaku writing. Reviews, deep dives, and hot takes on anime, manga, manhwa, manhua, novels & games — by fans, for fans.
            </p>
          </div>
          <div>
            <h6>Explore</h6>
            {CATEGORIES.slice(0, 5).map((c) => <a key={c.id} onClick={() => nav('category', c.id)} style={{ cursor: 'pointer' }}>{c.label}</a>)}
          </div>
          <div>
            <h6>Community</h6>
            <a onClick={() => nav('editor')} style={{ cursor: 'pointer' }}>Write a post</a>
            <a onClick={() => nav('profile', 'you')} style={{ cursor: 'pointer' }}>Your profile</a>
            <a onClick={() => nav('search')} style={{ cursor: 'pointer' }}>Search</a>
            <a>Guidelines</a>
          </div>
          <div>
            <h6>Company</h6>
            <a>About</a><a>Contact</a><a>Privacy</a><a>Advertise</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Not Bagel. Definitely not a bagel.</span>
          <span style={{ marginLeft: 'auto' }}>Made with 🍩 for the otaku internet.</span>
        </div>
      </div>
    </footer>
  );
}
