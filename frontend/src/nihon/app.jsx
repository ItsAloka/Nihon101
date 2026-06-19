// app.jsx — root, routing, theme, multi-user state
import React from "react";
import "./api.jsx";
import "./content.jsx";
import "./editor.jsx";
import "./ui.jsx";
import "./home.jsx";
import "./screens.jsx";
import "./social.jsx";
const { HomePage, ArticlePage, CategoryPage, SearchPage, AuthorPage, FeedPage,
        AboutPage, PrivacyPage, ContactPage, SavedPage, TrendingPage, ComposerPage, ProfilePage,
        LoginModal, Nav, Footer, SettingsPage, PALETTES, deriveDark, FONT_PAIRINGS, getAllPosts, getPost } = window;
function useTweaks(defaults) {
  const [t, setT] = React.useState(defaults);
  const setTweak = React.useCallback((k, v) => setT(prev => ({ ...prev, [k]: v })), []);
  return [t, setTweak];
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  palette: 'hakuji',
  font: 'shippori',
  density: 'regular',
  heroLayout: 'split',
  cardStyle: 'clean',
  accentIntensity: 'medium',
  showHanko: true,
  showTategaki: true
}/*EDITMODE-END*/;


function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState(()=>{
    try {
      const h = window.location.hash; if (h && h.startsWith('#/')) return parseHash(h);
      const fromPath = routeFromPath(window.location.pathname, window.location.search);
      if (fromPath) return fromPath;
    } catch(e){}
    return { name: 'home' };
  });
  const [history, setHistory] = React.useState([]);
  const [lang, setLang] = React.useState(()=>{ try { return localStorage.getItem('nihon.lang') || 'en'; } catch(e){ return 'en'; } });
  const [mode, setMode] = React.useState(()=>{ try { return localStorage.getItem('nihon.mode') || 'light'; } catch(e){ return 'light'; } });
  const [savedSet, setSavedSet] = React.useState(()=>{ try { return new Set(JSON.parse(localStorage.getItem('nihon.saved') || '[]')); } catch(e){ return new Set(); } });
  const [follows, setFollows] = React.useState(new Set()); // real, loaded from the backend on session restore
  const [claps, setClaps] = React.useState(()=>{ try { return JSON.parse(localStorage.getItem('nihon.claps') || '{}'); } catch(e){ return {}; } });
  const [currentUser, setCurrentUser] = React.useState(()=>{ try { return JSON.parse(localStorage.getItem('nihon.user') || 'null'); } catch(e){ return null; } });
  const [userPosts, setUserPosts] = React.useState(()=>{ try { return JSON.parse(localStorage.getItem('nihon.posts') || '[]'); } catch(e){ return []; } });
  const [comments, setComments] = React.useState(()=>{ try { const s = localStorage.getItem('nihon.comments'); return s ? JSON.parse(s) : {}; } catch(e){ return {}; } });
  const [notifs, setNotifs] = React.useState([]); // real, loaded from the backend on session restore
  const [loginOpen, setLoginOpen] = React.useState(false);

  // Persist + expose globals used by helper lookups
  React.useEffect(()=>{ try{ localStorage.setItem('nihon.lang', lang);}catch(e){} }, [lang]);
  React.useEffect(()=>{ try{ localStorage.setItem('nihon.mode', mode);}catch(e){} }, [mode]);
  React.useEffect(()=>{ try{ localStorage.setItem('nihon.saved', JSON.stringify([...savedSet]));}catch(e){} }, [savedSet]);
  React.useEffect(()=>{ window.__follows = follows; }, [follows]);
  React.useEffect(()=>{ try{ localStorage.setItem('nihon.claps', JSON.stringify(claps));}catch(e){} }, [claps]);
  React.useEffect(()=>{ window.__currentUser = currentUser; try{ localStorage.setItem('nihon.user', JSON.stringify(currentUser));}catch(e){} }, [currentUser]);
  React.useEffect(()=>{ window.__userPosts = userPosts; try{ localStorage.setItem('nihon.posts', JSON.stringify(userPosts));}catch(e){} }, [userPosts]);
  React.useEffect(()=>{ try{ localStorage.setItem('nihon.comments', JSON.stringify(comments));}catch(e){} }, [comments]);

  // keep globals fresh on first render too
  window.__currentUser = currentUser;
  window.__userPosts = userPosts;
  window.__follows = follows;

  const go = React.useCallback((r)=>{
    // Reader-discovery surfaces are real SSR pages now (Phase 3) — leave the SPA.
    const loc = (typeof location !== 'undefined' && location.pathname.startsWith('/ja')) ? 'ja' : 'en';
    if (r.name==='search') { window.location.href = `/${loc}/search${r.q ? `?q=${encodeURIComponent(r.q)}` : ''}`; return; }
    if (r.name==='category') { window.location.href = `/${loc}/c/${r.slug}`; return; }
    if (r.name==='tag') { window.location.href = `/${loc}/t/${r.slug}`; return; }
    if (r.name==='author') { window.location.href = `/${loc}/u/${r.slug}`; return; }
    if (r.name==='trending') { window.location.href = `/${loc}/trending`; return; }
    if (r.name==='feed') { window.location.href = `/${loc}/for-you`; return; }
    if (r.name==='about') { window.location.href = `/${loc}/about`; return; }
    if (r.name==='article') { window.location.href = `/${loc}/p/${r.slug}`; return; }
    if (r.name==='saved') { window.location.href = `/${loc}/saved`; return; }
    // auth-guarded clean-URL surfaces
    if (r.name==='compose' || r.name==='write') {
      if (!window.__currentUser) { setLoginOpen(true); return; }
      window.location.href = r.editId ? `/${loc}/write?id=${r.editId}` : `/${loc}/write`; return;
    }
    if (r.name==='profile') {
      if (!window.__currentUser) { setLoginOpen(true); return; }
      window.location.href = `/${loc}/me`; return;
    }
    if (r.name==='settings') {
      if (!window.__currentUser) { setLoginOpen(true); return; }
      window.location.href = `/${loc}/settings`; return;
    }
    setHistory(h=>[...h, r._from || routeRef.current]);
    setRoute(r);
    try { window.location.hash = serializeHash(r); } catch(e){}
    window.scrollTo({top:0});
  }, []);
  const routeRef = React.useRef(route);
  React.useEffect(()=>{ routeRef.current = route; }, [route]);

  const back = React.useCallback(()=>{
    setHistory(h=>{
      if (h.length===0) { setRoute({name:'home'}); try{window.location.hash='#/';}catch(e){} window.scrollTo({top:0}); return []; }
      const last = h[h.length-1];
      setRoute(last);
      try { window.location.hash = serializeHash(last); } catch(e){}
      window.scrollTo({top:0});
      return h.slice(0,-1);
    });
  }, []);
  React.useEffect(()=>{ window.__nihon_go = go; window.__nihon_back = back; }, [go, back]);

  const base = window.PALETTES[t.palette] || window.PALETTES.hakuji;
  const p = mode==='dark' ? window.deriveDark(base) : base;
  const f = window.FONT_PAIRINGS[t.font] || window.FONT_PAIRINGS.shippori;
  const cssVars = {
    '--fontDisplay': f.display,
    '--fontBody': f.body,
    '--fontMono': '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
  };

  const onLike = React.useCallback((slug)=>{ setClaps(c=>({...c, [slug]: (c[slug]||0)+1})); }, []);
  // Save/unsave a post by slug. Must be logged in; optimistic, with the real
  // call to the backend (post_saves) and a rollback if it fails.
  const onSave = React.useCallback((slug)=>{
    if (!window.__currentUser) { setLoginOpen(true); return; }
    let wasSaved = false;
    setSavedSet(s=>{ const ns=new Set(s); if(ns.has(slug)){ns.delete(slug); wasSaved=true;} else {ns.add(slug);} return ns; });
    window.N101_CONTENT.postApi.toggleSave(slug).catch(()=>{ // rollback on failure
      setSavedSet(s=>{ const ns=new Set(s); wasSaved?ns.add(slug):ns.delete(slug); return ns; });
    });
  }, []);
  // Follow/unfollow a writer by handle. Must be logged in; optimistic, with the
  // real call to the backend and a rollback if it fails.
  const onToggleFollow = React.useCallback((handle)=>{
    if (!window.__currentUser) { setLoginOpen(true); return; }
    const { followApi } = window.N101_CONTENT;
    let nowFollowing = false;
    setFollows(s=>{ const ns=new Set(s); if(ns.has(handle)){ns.delete(handle);} else {ns.add(handle); nowFollowing=true;} return ns; });
    const call = nowFollowing ? followApi.follow(handle) : followApi.unfollow(handle);
    call.catch(()=>{ // rollback on failure
      setFollows(s=>{ const ns=new Set(s); nowFollowing?ns.delete(handle):ns.add(handle); return ns; });
    });
  }, []);
  const onSearch = React.useCallback((q)=>{ go({name:'search', q}); }, [go]);

  // Load the real follow set + notifications for a signed-in user (replacing any
  // stale local cache — the backend is the truth).
  const hydrateSocial = React.useCallback(()=>{
    const { followApi, notifApi, postApi } = window.N101_CONTENT;
    followApi.following().then(list=>setFollows(new Set(list.map(f=>f.handle)))).catch(()=>{});
    notifApi.list().then(({notifications})=>setNotifs(notifications)).catch(()=>{});
    postApi.listSaved().then(rows=>setSavedSet(new Set(rows.map(po=>po.slug)))).catch(()=>{});
  }, []);

  const onLogin = React.useCallback((user)=>{ setCurrentUser(user); setLoginOpen(false); hydrateSocial(); }, [hydrateSocial]);
  const onLogout = React.useCallback(()=>{ window.N101_API.logout(); setCurrentUser(null); setFollows(new Set()); setNotifs([]); setSavedSet(new Set()); go({name:'home'}); }, [go]);

  // Restore the session from the HttpOnly refresh cookie on load. If there's no
  // valid backend session, clear any stale local user (real auth is the truth now).
  React.useEffect(()=>{
    let live = true;
    window.N101_API.refresh()
      .then(u=>{ if(live){ setCurrentUser(prev=>window.N101_API.toAppUser(u, prev)); hydrateSocial(); } })
      .catch(()=>{ if(live){ setCurrentUser(null); setFollows(new Set()); setNotifs([]); } });
    return ()=>{ live = false; };
  }, [hydrateSocial]);

  const onAddComment = React.useCallback((slug, text, parentId=null)=>{
    const u = window.__currentUser; if (!u) return;
    const c = { id:'c'+Date.now(), parentId, userId:u.id, author:{slug:u.slug, en:u.en, jp:u.jp, initials:u.initials, tint:u.tint}, text, ts:Date.now(), likes:0, liked:false };
    setComments(prev=>({...prev, [slug]: [...(prev[slug]||[]), c]}));
  }, []);
  const onLikeComment = React.useCallback((slug, id)=>{
    setComments(prev=>({...prev, [slug]: (prev[slug]||[]).map(c=> c.id===id ? {...c, liked:!c.liked, likes: c.likes + (c.liked?-1:1)} : c)}));
  }, []);

  const onPublish = React.useCallback((post, isDraft)=>{
    setUserPosts(prev=>{ const without = prev.filter(x=>x.slug!==post.slug); return [post, ...without]; });
    window.__userPosts = [post, ...(window.__userPosts||[]).filter(x=>x.slug!==post.slug)];
    if (!isDraft) {
      go({name:'article', slug:post.slug});
    } else {
      go({name:'profile'});
    }
  }, [go]);

  React.useEffect(()=>{
    document.body.style.background = p.bg;
    document.body.style.color = p.ink;
    document.documentElement.style.colorScheme = mode==='dark' ? 'dark' : 'light';
    // Expose the active palette as CSS custom properties on :root so components
    // that portal to <body> (e.g. the Readers/Writers modal in FollowStats) —
    // which escape the app wrapper's scope — still resolve var(--surface) etc.
    // instead of falling back to transparent.
    const r = document.documentElement.style;
    for (const k of ['bg','surface','surface2','ink','inkSoft','inkFaint','line','accent','accentDeep','stamp','tint']) {
      if (p[k]) r.setProperty(`--${k}`, p[k]);
    }
  }, [p, mode]);

  // keyboard ⌘K → search
  React.useEffect(()=>{
    const h=(e)=>{ if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); go({name:'search'}); } };
    window.addEventListener('keydown', h); return ()=>window.removeEventListener('keydown', h);
  }, [go]);

  let screen = null;
  const r = route;
  // Almost every screen is a real SSR page now (the SPA only truly *renders* the
  // private surfaces it's mounted on: saved / write / me, plus privacy/contact).
  // Whenever the current route maps to an SSR URL that ISN'T the page we're on,
  // hard-navigate there. The pathname diff is what prevents a self-redirect loop
  // (e.g. route 'saved' while already at /{loc}/saved) — and it's what makes
  // navigating back to 'home' from /saved or /write leave the SPA instead of
  // rendering a blank screen.
  {
    const loc = window.location.pathname.split('/')[1] === 'en' ? 'en' : 'ja';
    const ssr = (
      r.name === 'home' ? `/${loc}/` :
      r.name === 'category' && r.slug ? `/${loc}/c/${r.slug}` :
      r.name === 'tag' && r.slug ? `/${loc}/t/${r.slug}` :
      r.name === 'author' && r.slug ? `/${loc}/u/${r.slug}` :
      r.name === 'article' && r.slug ? `/${loc}/p/${r.slug}` :
      r.name === 'trending' ? `/${loc}/trending` :
      r.name === 'feed' ? `/${loc}/for-you` :
      r.name === 'about' ? `/${loc}/about` :
      r.name === 'saved' ? `/${loc}/saved` :
      r.name === 'profile' ? `/${loc}/me` :
      r.name === 'settings' ? `/${loc}/settings` :
      (r.name === 'compose' || r.name === 'write') ? (r.editId ? `/${loc}/write?id=${r.editId}` : `/${loc}/write`) :
      r.name === 'search' ? `/${loc}/search${r.q ? `?q=${encodeURIComponent(r.q)}` : ''}` :
      ''
    );
    if (ssr && ssr.split('?')[0] !== window.location.pathname) { window.location.href = ssr; return null; }
  }
  if (r.name === 'home') {
    return null; // handled by the SSR guard above
  } else if (r.name === 'article') {
    screen = <window.ArticleLoader p={p} lang={lang} slug={r.slug} t={t} savedSet={savedSet} claps={claps} onClap={onLike} onSave={onSave}
          comments={comments[r.slug]||[]} onAddComment={onAddComment} onLikeComment={onLikeComment}
          currentUser={currentUser} onRequireLogin={()=>setLoginOpen(true)}/>;
  } else if (r.name === 'category') {
    screen = <CategoryPage p={p} lang={lang} slug={r.slug} t={t} savedSet={savedSet} onSave={onSave}/>;
  } else if (r.name === 'search') {
    screen = <SearchPage p={p} lang={lang} initialQuery={r.q || ''} t={t} savedSet={savedSet} onSave={onSave}/>;
  } else if (r.name === 'author') {
    screen = <AuthorPage p={p} lang={lang} slug={r.slug} t={t} savedSet={savedSet} onSave={onSave} follows={follows} onToggleFollow={onToggleFollow}/>;
  } else if (r.name === 'feed') {
    screen = <FeedPage p={p} lang={lang} t={t} savedSet={savedSet} onSave={onSave} claps={claps}
              follows={follows} onToggleFollow={onToggleFollow} currentUser={currentUser} onRequireLogin={()=>setLoginOpen(true)}/>;
  } else if (r.name === 'about') {
    screen = <AboutPage p={p} lang={lang}/>;
  } else if (r.name === 'privacy') {
    screen = <PrivacyPage p={p} lang={lang}/>;
  } else if (r.name === 'contact') {
    screen = <ContactPage p={p} lang={lang}/>;
  } else if (r.name === 'saved') {
    screen = <SavedPage p={p} lang={lang} savedSet={savedSet} t={t} onSave={onSave}/>;
  } else if (r.name === 'trending') {
    screen = <TrendingPage p={p} lang={lang} t={t} savedSet={savedSet} onSave={onSave} claps={claps} comments={comments}/>;
  } else if (r.name === 'compose') {
    screen = currentUser
      ? <ComposerPage p={p} lang={lang} currentUser={currentUser} editId={r.editId}/>
      : <LoginPrompt p={p} lang={lang} onLogin={()=>setLoginOpen(true)}/>;
  } else if (r.name === 'profile') {
    screen = currentUser
      ? <ProfilePage p={p} lang={lang} user={currentUser} t={t} savedSet={savedSet} onSave={onSave} onUpdateUser={setCurrentUser} claps={claps} comments={comments}/>
      : <LoginPrompt p={p} lang={lang} onLogin={()=>setLoginOpen(true)}/>;
  } else if (r.name === 'settings') {
    screen = currentUser
      ? <SettingsPage p={p} lang={lang} user={currentUser} onUpdateUser={setCurrentUser} onLogout={onLogout}/>
      : <LoginPrompt p={p} lang={lang} onLogin={()=>setLoginOpen(true)}/>;
  } else {
    screen = <NotFound p={p} lang={lang}/>;
  }

  return (
    <div style={{...cssVars, minHeight:'100vh', background:p.bg, color:p.ink}}>
      <Nav p={p} route={route} lang={lang} onLang={setLang} onSearch={onSearch} savedCount={savedSet.size}
           mode={mode} onToggleMode={()=>setMode(m=>m==='dark'?'light':'dark')}
           currentUser={currentUser} onLogin={()=>setLoginOpen(true)} onLogout={onLogout}
           notifs={notifs}
           onReadNotifs={()=>{ window.N101_CONTENT.notifApi.markRead(); setNotifs(prev=>prev.map(n=>({...n, read:true}))); }}
           onClearNotifs={()=>{ window.N101_CONTENT.notifApi.clearAll(); setNotifs([]); }}/>
      <main>{screen}</main>
      <Footer p={p} lang={lang}/>
      {loginOpen && <LoginModal p={p} lang={lang} onLogin={onLogin} onClose={()=>setLoginOpen(false)}/>}
    </div>
  );
}

function LoginPrompt({p, lang, onLogin}) {
  return (
    <div style={{maxWidth:1320, margin:'0 auto', padding:'120px 32px', textAlign:'center'}}>
      <div style={{fontFamily:'var(--fontDisplay)', fontSize:72, color:p.stamp, fontWeight:600, marginBottom:8}}>入</div>
      <h1 style={{fontFamily:'var(--fontDisplay)', fontSize:34, color:p.ink, fontWeight:600, letterSpacing:'-0.02em', marginBottom:12}}>
        {lang==='jp'?'ログインが必要です':'Sign in to continue'}
      </h1>
      <p style={{fontFamily:'var(--fontBody)', fontSize:16, color:p.inkSoft, marginBottom:24}}>
        {lang==='jp'?'記事を書いたり、プロフィールを編集するにはログインしてください。':'You need an account to write and manage your profile.'}
      </p>
      <button onClick={onLogin} style={{...window.gradStyle(p), display:'inline-flex'}}>{lang==='jp'?'ログイン':'Sign in'}</button>
    </div>
  );
}

// Initial screen from a clean pathname (the SPA is mounted at /{loc}/saved,
// /{loc}/write[?id=], /{loc}/me — see the matching .astro pages). Returns null
// for any other path so the caller falls back to the hash / home.
function routeFromPath(pathname, search) {
  const seg = (pathname || '').split('/').filter(Boolean); // [locale, screen]
  const screen = seg[1];
  const qp = new URLSearchParams(search || '');
  if (screen === 'saved') return { name: 'saved' };
  if (screen === 'write') return qp.get('id') ? { name: 'compose', editId: qp.get('id') } : { name: 'compose' };
  if (screen === 'me') return { name: 'profile' };
  if (screen === 'settings') return { name: 'settings' };
  return null;
}

function parseHash(h) {
  const parts = h.slice(2).split('?');
  const path = parts[0].split('/');
  const qp = new URLSearchParams(parts[1] || '');
  if (path[0]==='') return {name:'home'};
  if (path[0]==='article' && path[1]) return {name:'article', slug:path[1]};
  if (path[0]==='category' && path[1]) return {name:'category', slug:path[1]};
  if (path[0]==='author' && path[1]) return {name:'author', slug:path[1]};
  if (path[0]==='about') return {name:'about'};
  if (path[0]==='privacy') return {name:'privacy'};
  if (path[0]==='contact') return {name:'contact'};
  if (path[0]==='saved') return {name:'saved'};
  if (path[0]==='trending') return {name:'trending'};
  if (path[0]==='feed' || path[0]==='following') return {name:'feed'};
  if (path[0]==='compose' || path[0]==='write') return path[1] ? {name:'compose', editId:path[1]} : {name:'compose'};
  if (path[0]==='profile') return {name:'profile'};
  if (path[0]==='settings') return {name:'settings'};
  if (path[0]==='search') return {name:'search', q: qp.get('q')||''};
  return {name:'home'};
}
function serializeHash(r) {
  if (r.name==='home') return '#/';
  if (r.name==='article') return `#/article/${r.slug}`;
  if (r.name==='category') return `#/category/${r.slug}`;
  if (r.name==='author') return `#/author/${r.slug}`;
  if (r.name==='about') return '#/about';
  if (r.name==='privacy') return '#/privacy';
  if (r.name==='contact') return '#/contact';
  if (r.name==='saved') return '#/saved';
  if (r.name==='trending') return '#/trending';
  if (r.name==='feed') return '#/following';
  if (r.name==='compose') return r.editId ? `#/compose/${r.editId}` : '#/compose';
  if (r.name==='profile') return '#/profile';
  if (r.name==='settings') return '#/settings';
  if (r.name==='search') return r.q ? `#/search?q=${encodeURIComponent(r.q)}` : '#/search';
  return '#/';
}

function NotFound({p, lang}) {
  return (
    <div style={{maxWidth:1320, margin:'0 auto', padding:'120px 32px', textAlign:'center'}}>
      <div style={{fontFamily:'var(--fontDisplay)', fontSize:120, color:p.stamp, fontWeight:600}}>無</div>
      <h1 style={{fontFamily:'var(--fontDisplay)', fontSize:32, color:p.ink, fontWeight:600}}>
        {lang==='jp'?'ここには何もありません。':'Nothing here.'}
      </h1>
      <button onClick={()=>window.__nihon_go({name:'home'})} style={{marginTop:16, appearance:'none', border:`1px solid ${p.ink}`, background:'transparent', color:p.ink, padding:'10px 22px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:14, fontWeight:600}}>
        {lang==='jp'?'ホームへ':'Go home'}
      </button>
    </div>
  );
}

export default App;
