/* NOT BAGEL — shared UI primitives. */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { I } from '../lib/icons';
import { COV, type Post } from '../data/seed';
import { fmt } from '../lib/store';

/* ---------------- Icon ---------------- */
export function Icon({
  d, size = 20, fill = 'none', stroke = 2, style,
}: {
  d: string; size?: number; fill?: string; stroke?: number; style?: CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={d} />
    </svg>
  );
}

/* ---------------- Cover placeholder ----------------
 * Accepts a full Post or a lightweight stand-in (profile banner uses one). */
export type CoverPost = Pick<Post, 'cov' | 'cat' | 'title'> & {
  score?: number | null;
  coverImg?: string | null;
  catObj?: { label: string };
};

export function Cover({
  post, kicker, showScore, titleSize = 21, bare,
}: {
  post: CoverPost; kicker?: string; showScore?: boolean; titleSize?: number; bare?: boolean;
}) {
  const pair = COV[post.cov] || COV[post.cat] || COV.anime;
  const style = { '--cov-a': pair[0], '--cov-b': pair[1] } as CSSProperties;
  return (
    <div className="cover" style={style}>
      {post.coverImg && <img className="cover-img" src={post.coverImg} alt={post.title} />}
      {showScore && post.score != null && (
        <div className="cover-score"><Icon d={I.star} size={13} fill="currentColor" stroke={0} /> {post.score}</div>
      )}
      {!bare && (
        <div className="cover-body">
          <span className="cover-kicker">{kicker || post.catObj?.label}</span>
          <div className="cover-title" style={{ fontSize: titleSize }}>{post.title}</div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({ user, size = 34 }: { user: { name: string; color: string }; size?: number }) {
  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <div className="avatar" style={{ width: size, height: size, background: user.color, fontSize: size * 0.4 }}>
      {initials}
    </div>
  );
}

/* ---------------- Rating stars ---------------- */
export function Stars({ score }: { score: number }) {
  const s = Math.round(score / 2);
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} d={I.star} size={15} fill="currentColor" stroke={0}
          style={{ color: i <= s ? 'var(--c-manhua)' : 'var(--border-2)' }} />
      ))}
    </span>
  );
}

/* ---------------- Metric (like / save / comment) ---------------- */
export function Metric({
  type, count, on, onClick,
}: {
  type: 'like' | 'save' | 'comment'; count: number; on?: boolean; onClick?: () => void;
}) {
  const cfg = {
    like: { d: I.heart, cls: 'btn-like', onCls: 'on-like' },
    save: { d: I.bookmark, cls: 'btn-save', onCls: 'on-save' },
    comment: { d: I.comment, cls: '', onCls: '' },
  }[type];
  return (
    <button className={`metric ${cfg.cls} ${on ? cfg.onCls : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}>
      <Icon d={cfg.d} size={16} fill={on ? 'currentColor' : 'none'} />
      {fmt(count)}
    </button>
  );
}

/* ---------------- Toaster (island, lives in Layout) ----------------
 * Listens for `nb:toast` window events (see emitToast in lib/store). */
export function Toaster() {
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (!detail) return;
      setMsg(detail);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(''), 2200);
    };
    window.addEventListener('nb:toast', onToast);
    return () => window.removeEventListener('nb:toast', onToast);
  }, []);
  return <div className={`toast ${msg ? 'show' : ''}`}>{msg && <><Icon d={I.check} size={17} /> {msg}</>}</div>;
}
