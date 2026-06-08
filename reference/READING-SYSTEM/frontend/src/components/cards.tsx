/* NOT BAGEL — post cards + sidebar widgets. */
import { useEffect, useState } from 'react';
import { Icon, Cover, Avatar, Metric } from './ui';
import { I } from '../lib/icons';
import { CATEGORIES, POSTS, type Post } from '../data/seed';
import { nav, fmt, type Store } from '../lib/store';
import { categoryApi, type ApiCategory } from '../lib/content';

/* ---------------- Post card (horizontal feed) ---------------- */
export function PostCard({ post, store }: { post: Post; store: Store }) {
  const liked = store.likes.has(post.id);
  const saved = store.saves.has(post.id);
  return (
    <article className="pcard fade-in" onClick={() => nav('article', post.id)}>
      <Cover post={post} showScore={post.score != null} titleSize={17} />
      <div className="pcard-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="cat-tag" style={{ color: `var(${post.catObj.var})`, background: `color-mix(in srgb, var(${post.catObj.var}) 14%, transparent)` }}>
            {post.catObj.label}
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--text-3)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{post.kind}</span>
        </div>
        <h3>{post.title}</h3>
        <p className="excerpt">{post.excerpt}</p>
        <div className="pcard-meta">
          <span className="who" onClick={(e) => { e.stopPropagation(); nav('profile', post.author); }}>
            <Avatar user={post.authorObj} size={26} />
            <b>{post.authorObj.name}</b>
          </span>
          <span>·</span>
          <span>{post.date}</span>
          <span>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={I.clock} size={14} /> {post.read}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
            <Metric type="like" count={post.likes + (liked ? 1 : 0)} on={liked} onClick={() => store.toggle('likes', post.id)} />
            <Metric type="save" count={post.saves + (saved ? 1 : 0)} on={saved} onClick={() => store.toggle('saves', post.id)} />
          </div>
        </div>
      </div>
    </article>
  );
}

/* ---------------- Grid card (compact) ---------------- */
export function GridCard({ post, onOpen }: { post: Post; store?: Store; onOpen?: (post: Post) => void }) {
  return (
    <article className="gcard fade-in" onClick={() => (onOpen ? onOpen(post) : nav('article', post.id))}>
      <Cover post={post} showScore={post.score != null} titleSize={16} />
      <div className="gcard-body">
        <span className="cat-tag" style={{ alignSelf: 'flex-start', color: `var(${post.catObj.var})`, background: `color-mix(in srgb, var(${post.catObj.var}) 14%, transparent)` }}>{post.catObj.label}</span>
        <h4>{post.title}</h4>
        <div className="gcard-meta">
          <Avatar user={post.authorObj} size={20} />
          <span>{post.authorObj.name}</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon d={I.heart} size={13} /> {fmt(post.likes)}
          </span>
        </div>
      </div>
    </article>
  );
}

/* ---------------- Sidebar widgets ---------------- */
export function TrendingCard() {
  const top = [...POSTS].sort((a, b) => b.likes - a.likes).slice(0, 5);
  return (
    <div className="side-card">
      <div className="side-h">🔥 Trending now</div>
      {top.map((p, i) => (
        <div key={p.id} className="trend-item" onClick={() => nav('article', p.id)}>
          <span className="trend-rank">{String(i + 1).padStart(2, '0')}</span>
          <div>
            <h5>{p.title}</h5>
            <div className="sub">{p.catObj.label} · {fmt(p.likes)} likes</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CategoriesCard() {
  // Seed defaults render first (stable SSR), then the live top-6 by post count.
  const [cats, setCats] = useState<ApiCategory[]>(
    CATEGORIES.map((c) => ({ id: c.id, label: c.label, colorVar: c.var, postCount: 0, createdBy: null, createdAt: '' })),
  );
  useEffect(() => {
    categoryApi.list().then((cs) => setCats(cs.slice(0, 6))).catch(() => { /* keep seed defaults */ });
  }, []);
  return (
    <div className="side-card">
      <div className="side-h">Browse by world</div>
      <div className="cat-list">
        {cats.map((c) => (
          <div key={c.id} className="cat-row" onClick={() => nav('category', c.id)}>
            <span className="dot" style={{ background: `var(${c.colorVar})` }}></span>
            {c.label}
            <span className="ct">{c.postCount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NewsletterCard() {
  const [done, setDone] = useState(false);
  return (
    <div className="side-card" style={{ background: 'var(--pink-soft)', borderColor: 'transparent' }}>
      <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-.02em', marginBottom: 6 }}>The Weekly Crumb 🍩</div>
      <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 14 }}>
        Our best otaku reads, every Sunday. No spam, just good taste.
      </p>
      {done ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: 'var(--pink-strong)' }}>
          <Icon d={I.check} size={18} /> You're in! See you Sunday.
        </div>
      ) : (
        <>
          <input className="ed-input" placeholder="you@email.com" style={{ marginBottom: 9, background: 'var(--surface)' }} />
          <button className="btn btn-primary btn-block" onClick={() => setDone(true)}>Subscribe</button>
        </>
      )}
    </div>
  );
}
