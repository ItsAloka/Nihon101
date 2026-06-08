/* NOT BAGEL — Article view. */
import { useEffect, useState } from 'react';
import { Icon, Cover, Avatar, Stars } from '../ui';
import { GridCard } from '../cards';
import { I } from '../../lib/icons';
import { POSTS, COMMENTS, postById, type Block, type Comment, type Post, type Category } from '../../data/seed';
import { nav, emitToast, type Store } from '../../lib/store';
import { useAuth } from '../../lib/authStore';
import { categoryApi, postApi, hydrateCategory, hydratePost, type ApiPost } from '../../lib/content';

export function ArticleView({ postId, store }: { postId?: string; store: Store }) {
  const { user } = useAuth();
  // Seed posts render from structured blocks; runtime posts (id in `?id=`) are
  // fetched from the API and render their stored HTML body.
  const id = postId ?? (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null);
  const seedPost = id ? postById(id) : null;

  const [runtimePost, setRuntimePost] = useState<Post | null>(null);
  const [density, setDensity] = useState<'compact' | 'normal' | 'relaxed'>('compact');
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [following, setFollowing] = useState(false);
  const [comments, setComments] = useState<Comment[]>(COMMENTS);
  const [draft, setDraft] = useState('');

  useEffect(() => { window.scrollTo(0, 0); }, [id]);
  useEffect(() => {
    if (seedPost || !id) return;
    let alive = true;
    (async () => {
      try {
        const cats = await categoryApi.list();
        const catMap = new Map<string, Category>(cats.map((c) => [c.id, hydrateCategory(c)]));
        const raw: ApiPost = await postApi.get(id);
        if (!alive) return;
        setRuntimePost(hydratePost(raw, catMap));
        setDensity(raw.density);
        setAuthorId(raw.authorId);
      } catch { if (alive) setNotFound(true); }
    })();
    return () => { alive = false; };
  }, [id, seedPost]);

  const post = seedPost ?? runtimePost;
  const isOwner = !!(post && user && authorId && user.id === authorId);

  const doDelete = async () => {
    if (!post || deleting) return;
    setDeleting(true);
    try { await postApi.remove(post.id); emitToast('Post deleted'); nav('profile', 'you'); }
    catch { setDeleting(false); emitToast('Delete failed — try again'); }
  };

  if (!post) {
    return (
      <div className="wrap fade-in">
        <div className="empty" style={{ marginTop: 80 }}>
          <div className="big">{notFound ? '🫥' : '⏳'}</div>
          {notFound ? "We couldn't find that post." : 'Loading…'}
        </div>
      </div>
    );
  }

  const liked = store.likes.has(post.id);
  const saved = store.saves.has(post.id);

  const related = POSTS.filter((p) => p.cat === post.cat && p.id !== post.id).slice(0, 3);
  if (related.length < 3) {
    POSTS.filter((p) => p.id !== post.id && !related.includes(p)).forEach((p) => { if (related.length < 3) related.push(p); });
  }

  const renderBlock = (b: Block, i: number) => {
    if (b.t === 'p') return <p key={i} dangerouslySetInnerHTML={{ __html: b.v }} />;
    if (b.t === 'h2') return <h2 key={i}>{b.v}</h2>;
    if (b.t === 'h3') return <h3 key={i}>{b.v}</h3>;
    if (b.t === 'quote') return <blockquote key={i}>{b.v}</blockquote>;
    return null;
  };

  const addComment = () => {
    if (!draft.trim()) return;
    setComments([{ author: 'You Otaku', color: 'var(--teal)', time: 'just now', text: draft.trim(), likes: 0 }, ...comments]);
    setDraft('');
    emitToast('Comment posted!');
  };

  return (
    <div className="wrap fade-in">
      <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0 0' }}>
        <button className="btn btn-ghost" onClick={() => nav('home')}>
          <Icon d={I.back} size={17} /> Back
        </button>
        {isOwner && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => { window.location.href = `/write?id=${post.id}`; }}>
              <Icon d={I.edit} size={16} /> Edit
            </button>
            <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>
              <Icon d={I.trash} size={16} /> Delete
            </button>
          </div>
        )}
      </div>

      <article className="article">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 22 }}>
          <span className="cat-tag" style={{ color: `var(${post.catObj.var})`, background: `color-mix(in srgb, var(${post.catObj.var}) 14%, transparent)` }}>{post.catObj.label}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-3)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>{post.kind}</span>
          {post.score != null && <span style={{ marginLeft: 'auto' }}><Stars score={post.score} /></span>}
        </div>

        <h1 className="art-title">{post.title}</h1>
        <p className="art-sub">{post.excerpt}</p>

        <div className="art-meta">
          <span className="who" style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }} onClick={() => nav('profile', post.author)}>
            <Avatar user={post.authorObj} size={46} />
            <span>
              <b style={{ fontWeight: 700, display: 'block', fontSize: 15 }}>{post.authorObj.name}</b>
              <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{post.date} · {post.read} read</span>
            </span>
          </span>
          <button className={`btn ${following ? 'btn-ghost' : 'btn-primary'}`} style={{ marginLeft: 'auto' }}
            onClick={() => { setFollowing(!following); emitToast(following ? 'Unfollowed' : `Following ${post.authorObj.name}`); }}>
            {following ? <><Icon d={I.check} size={16} /> Following</> : <><Icon d={I.plus} size={16} /> Follow</>}
          </button>
        </div>

        <div className="article-hero"><Cover post={post} /></div>

        {post.md ? (
          <div className={`prose-gap-${density}`}>
            <div className="art-body" style={{ marginTop: 30 }} dangerouslySetInnerHTML={{ __html: post.md }} />
          </div>
        ) : (
          <div className="art-body" style={{ marginTop: 30 }}>
            {post.body.map(renderBlock)}
          </div>
        )}

        {post.verdict && (
          <div className="verdict">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div className="vscore">{post.verdict.score}</div>
              <div>
                <div className="eyebrow">The Verdict · {post.verdict.label}</div>
                <Stars score={post.verdict.score} />
              </div>
            </div>
            <p style={{ marginTop: 14, fontSize: 16, color: 'var(--text-2)', lineHeight: 1.6 }}>{post.verdict.text}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 28 }}>
          {post.tags.map((t) => <span key={t} className="tag" onClick={() => nav('search')} style={{ cursor: 'pointer' }}># {t}</span>)}
        </div>

        <div className="side-card" style={{ marginTop: 34, display: 'flex', gap: 18, alignItems: 'center' }}>
          <Avatar user={post.authorObj} size={64} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-.02em' }}>{post.authorObj.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-3)', marginBottom: 6 }}>{post.authorObj.handle} · {post.authorObj.followers} followers</div>
            <p style={{ fontSize: 14, color: 'var(--text-2)' }}>{post.authorObj.bio}</p>
          </div>
          <button className="btn btn-ghost" onClick={() => nav('profile', post.author)}>View profile</button>
        </div>

        <div className="float-bar">
          <button className={liked ? 'on' : ''} onClick={() => { store.toggle('likes', post.id); emitToast(liked ? '' : 'Liked!'); }}>
            <Icon d={I.heart} size={19} fill={liked ? 'currentColor' : 'none'} /> {post.likes + (liked ? 1 : 0)}
          </button>
          <button className={saved ? 'on save' : ''} onClick={() => { store.toggle('saves', post.id); emitToast(saved ? 'Removed bookmark' : 'Bookmarked!'); }}>
            <Icon d={I.bookmark} size={18} fill={saved ? 'currentColor' : 'none'} /> Save
          </button>
          <div className="sep"></div>
          <button onClick={() => emitToast('Link copied!')}><Icon d={I.share} size={18} /> Share</button>
          <button onClick={() => document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })}>
            <Icon d={I.comment} size={18} /> {comments.length}
          </button>
        </div>

        <div id="comments" style={{ marginTop: 50 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 18 }}>
            {comments.length} Comments
          </h2>
          <div className="comment-box">
            <Avatar user={{ name: 'You Otaku', color: 'var(--teal)' }} size={42} />
            <div style={{ flex: 1 }}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Share your take… (be kind, no spoilers!)" />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 9 }}>
                <button className="btn btn-primary" onClick={addComment}>Post comment</button>
              </div>
            </div>
          </div>
          {comments.map((c, i) => (
            <div key={i} className="comment">
              <Avatar user={{ name: c.author, color: c.color }} size={42} />
              <div className="comment-body">
                <div className="cwho"><b>{c.author}</b> <span className="ct">{c.time}</span></div>
                <p>{c.text}</p>
                <div className="cactions">
                  <span><Icon d={I.heart} size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {c.likes}</span>
                  <span>Reply</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 54 }}>
          <div className="shead"><h2>More like this</h2></div>
          <div className="grid-3">
            {related.map((p) => <GridCard key={p.id} post={p} store={store} />)}
          </div>
        </div>
      </article>
      <div style={{ height: 40 }}></div>

      {confirmDel && (
        <div className="modal-backdrop" onClick={() => !deleting && setConfirmDel(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>Delete this post?</h3>
            <p style={{ color: 'var(--text-2)', fontSize: 14.5, lineHeight: 1.6, marginTop: 10 }}>
              You're about to permanently delete <b>“{post.title}”</b>. Every comment and like it received will be lost. This can't be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
              <button className="btn btn-ghost" disabled={deleting} onClick={() => setConfirmDel(false)}>Cancel</button>
              <button className="btn btn-danger" disabled={deleting} onClick={doDelete}>{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
