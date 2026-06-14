// ui.jsx — shared chrome (Nav, Footer, Logo, Placeholders, theme tokens)
import React from "react";
import "./data.js";

const PALETTES = {
  hakuji: {
    label: 'Hakuji',
    label_jp: '白磁',
    bg:        '#FBFAF7',
    surface:   '#FFFFFF',
    surface2:  '#F2F0EB',
    ink:       '#1A1817',
    inkSoft:   '#5C544C',
    inkFaint:  '#A39F98',
    line:      '#ECE8E0',
    accent:    '#F58FA3',
    accentDeep:'#E54E70',
    stamp:     '#D63752',
    tint:      '#FCE5EA',
    gradient:  true,
  },
  sakura: {
    label: 'Sakura',
    label_jp: '桜',
    bg:        '#FDF5EE',
    surface:   '#FFFAF3',
    surface2:  '#F7EADF',
    ink:       '#1E1813',
    inkSoft:   '#6E5F50',
    inkFaint:  '#B6A593',
    line:      '#EEDFCE',
    accent:    '#E8A0AE',   // milky pink
    accentDeep:'#C7626F',
    stamp:     '#C1453D',   // hanko red used sparingly
    tint:      '#FBE6E5',
  },
  yuzu: {
    label: 'Yuzu',
    label_jp: '柚子',
    bg:        '#FAF6E1',
    surface:   '#FDFBED',
    surface2:  '#F3EBC4',
    ink:       '#1F1C0E',
    inkSoft:   '#6F6748',
    inkFaint:  '#B4AB82',
    line:      '#EBE3BA',
    accent:    '#D4D77C',   // yuzu-sage
    accentDeep:'#9AA04A',
    stamp:     '#D67E2E',
    tint:      '#F3F2D2',
  },
  aizome: {
    label: 'Aizome',
    label_jp: '藍',
    bg:        '#EEF2F6',
    surface:   '#F7FAFC',
    surface2:  '#DDE6EE',
    ink:       '#10161D',
    inkSoft:   '#54657A',
    inkFaint:  '#9AAEC2',
    line:      '#D5DEE7',
    accent:    '#A2B9D2',   // milky blue
    accentDeep:'#4C6E94',
    stamp:     '#234567',
    tint:      '#D7E2EC',
  },
  matcha: {
    label: 'Matcha',
    label_jp: '抹茶',
    bg:        '#F2F1E1',
    surface:   '#F8F8EE',
    surface2:  '#E1E2C7',
    ink:       '#1A1D12',
    inkSoft:   '#5F6446',
    inkFaint:  '#A8AC85',
    line:      '#DCDDC0',
    accent:    '#B7C58B',   // milky matcha
    accentDeep:'#76854A',
    stamp:     '#A85A4A',
    tint:      '#DDE0BD',
  },
};

const FONT_PAIRINGS = {
  shippori: {
    label: 'Shippori (default)',
    display: '"Shippori Mincho B1", "Shippori Mincho", "Times New Roman", serif',
    body:    '"Inter", "Noto Sans JP", system-ui, sans-serif',
    weight: { display: 600, body: 400 },
  },
  newsreader: {
    label: 'Newsreader',
    display: '"Newsreader", "Shippori Mincho B1", serif',
    body:    '"Inter", "Noto Sans JP", system-ui, sans-serif',
    weight: { display: 500, body: 400 },
  },
  zen: {
    label: 'Zen Old Mincho',
    display: '"Zen Old Mincho", "Shippori Mincho B1", serif',
    body:    '"Zen Kaku Gothic New", "Inter", system-ui, sans-serif',
    weight: { display: 600, body: 400 },
  },
};

// Tint mapping for category/author chips. Pulls from active palette.
function tintBg(name, p) {
  const map = {
    rose:   '#FBC5CC',
    amber:  '#FFD27A',
    blue:   '#A6C7F0',
    lilac:  '#D6B8F0',
    peach:  '#FBB58B',
    sage:   '#B6D58E',
    clay:   '#E89A7E',
    mauve:  '#D89DBE',
    sky:    '#9BC2EE',
    cream:  '#FFE6B5',
  };
  return map[name] || p.accent;
}

// Vivid gradient stops per tint — used by Photo placeholders
function tintGradient(name) {
  const grads = {
    rose:   ['#FCCFD6', '#F58FA3'],
    amber:  ['#FFE3A2', '#FFAA4F'],
    blue:   ['#C4DCF6', '#7FA9DE'],
    lilac:  ['#E2CCF2', '#B89BD9'],
    peach:  ['#FFCFB0', '#F08D5C'],
    sage:   ['#D4E4B0', '#9CB66D'],
    clay:   ['#F2B59C', '#D17A5A'],
    mauve:  ['#E5BBD2', '#BC7FA0'],
    sky:    ['#C0DAF0', '#7FAFDC'],
    cream:  ['#FFEFC8', '#FFCB7A'],
  };
  return grads[name] || ['#FCE5EA', '#F58FA3'];
}

// Subject glyph per hue — large faded kanji as the photo's 'subject'
function subjectGlyph(hue) {
  const map = {
    cream:  '茶', amber: '麺', peach: '弁',
    blue:   '雪', sky:   '駅', lilac: '燈',
    rose:   '桜', mauve: '香',
    sage:   '葉', clay:  '器',
  };
  return map[hue] || '日';
}

// ------- Multi-user + dark-mode helpers -------
// Resolves an author slug against the live current user first, then seed authors.
function getAuthor(slug) {
  const u = window.__currentUser;
  if (u && u.slug === slug) return u;
  return window.NIHON_DATA.AUTHORS.find(x => x.slug === slug)
      || (window.__extraAuthors || []).find(x => x.slug === slug);
}
// All posts = user-written (newest first) + seed posts.
function getAllPosts() {
  return [...(window.__userPosts || []), ...window.NIHON_DATA.POSTS];
}
function getPost(slug) {
  return getAllPosts().find(p => p.slug === slug);
}
// Derive a warm dark palette from a light one, keeping the accent identity.
function deriveDark(p) {
  return {
    ...p,
    bg:       `color-mix(in oklab, ${p.accent} 7%, #15121A)`,
    surface:  `color-mix(in oklab, ${p.accent} 6%, #1E1B24)`,
    surface2: `color-mix(in oklab, ${p.accent} 10%, #2A2632)`,
    ink:      '#F4EFEA',
    inkSoft:  '#B9B0BC',
    inkFaint: '#7E7588',
    line:     `color-mix(in oklab, ${p.accent} 12%, #342F3C)`,
    tint:     `color-mix(in oklab, ${p.accent} 20%, #1E1B24)`,
    isDark: true,
  };
}

Object.assign(window, { getAuthor, getAllPosts, getPost, deriveDark, subjectGlyph, tintGradient });

// ------- Live categories (from the backend table, post_count desc) -------
// Shared hook over window.N101_CATS. Returns the cached list + helpers; loads
// once on first mount and re-renders subscribers when the cache changes.
function useCategories() {
  const store = window.N101_CATS;
  const [cats, setCats] = React.useState(() => (store && store.get()) || []);
  React.useEffect(() => {
    if (!store) return;
    const unsub = store.subscribe((list) => setCats(list || []));
    store.load().catch(() => {});
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    cats,
    byId: (id) => (store ? store.byId(id) : null),
    refresh: () => (store ? store.refresh() : Promise.resolve()),
  };
}
Object.assign(window, { useCategories });

// Tag slug — mirrors the backend slugify() so tag links resolve to /t/<slug>
// (the SSR tag page slug-normalizes stored labels the same way).
function tagSlug(label) {
  return String(label || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
Object.assign(window, { tagSlug });

// ------- Logo -------
// The mark IS the wordmark: nihon + "1" + a hinomaru sun-disc (the "0") + "1".
function Logo({ p, jp, size = 28 }) {
  const fs = size * 0.95;
  const disc = Math.round(fs * 0.6);
  return (
    <a href="#/" onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'home'});}}
       style={{display:'inline-flex', alignItems:'center', gap:10, textDecoration:'none', color:p.ink, flexShrink:0}}>
      <span style={{
        fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize: fs, letterSpacing:'-0.01em',
        lineHeight:1, display:'inline-flex', alignItems:'center', whiteSpace:'nowrap',
      }}>
        <span style={{color:p.ink, whiteSpace:'nowrap'}}>{jp ? '日本' : 'nihon'}</span>
        <span style={{color:p.stamp, display:'inline-flex', alignItems:'center', letterSpacing:0, marginLeft: jp ? Math.round(fs*0.06) : 0}}>
          1
          <span aria-hidden="true" title="101" style={{
            display:'inline-block', width:disc, height:disc, borderRadius:'50%',
            background:p.stamp, margin:`0 ${Math.round(fs*0.045)}px`,
          }}></span>
          1
        </span>
      </span>
    </a>
  );
}

// ------- Top nav -------
function Nav({ p, route, lang, onLang, onSearch, savedCount, mode, onToggleMode,
              currentUser, onLogin, onLogout, notifs, onReadNotifs }) {
  const items = [
    { label: lang==='jp' ? '今日のこと' : 'Today',     route: {name:'home'} },
    { label: lang==='jp' ? 'おすすめ' : 'For You',  route: {name:'feed'} },
    { label: lang==='jp' ? '探す' : 'Explore',         route: {name:'search'} },
    { label: lang==='jp' ? '人気' : 'Trending',        route: {name:'trending'} },
    { label: lang==='jp' ? '書く人' : 'Writers',        route: {name:'authors'} },
    { label: lang==='jp' ? 'はじめに' : 'About',        route: {name:'about'} },
  ];
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  React.useEffect(()=>{ setNotifOpen(false); setMenuOpen(false); }, [route.name, route.slug]);
  const unread = (notifs || []).filter(n => !n.read).length;
  return (
    <header style={{
      position:'sticky', top:0, zIndex:30,
      background:`color-mix(in oklab, ${p.bg} 88%, transparent)`,
      backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)',
      borderBottom:`1px solid ${p.line}`,
    }}>
      <div style={{
        maxWidth:1320, margin:'0 auto', padding:'12px 32px',
        display:'flex', alignItems:'center', gap:18,
      }}>
        <Logo p={p} jp={lang==='jp'} />
        <nav className="nihon-mainnav" style={{display:'flex', gap:2, marginLeft:14, flex:1}}>
          {items.map((it, i) => {
            const active = (route.name === it.route.name);
            return (
              <button key={i} onClick={()=>window.__nihon_go(it.route)}
                style={{
                  appearance:'none', border:'none', background:'transparent',
                  padding:'8px 13px', borderRadius:999, cursor:'pointer',
                  fontFamily:'var(--fontBody)', fontSize:14, fontWeight: active?600:500,
                  color: active ? p.ink : p.inkSoft, position:'relative',
                  whiteSpace:'nowrap', flexShrink:0,
                }}>
                {it.label}
                {active && <span style={{
                  position:'absolute', left:13, right:13, bottom:2,
                  height:6, background: p.accent, borderRadius:6, zIndex:-1, opacity:0.55,
                }}></span>}
              </button>
            );
          })}
        </nav>
        <SearchBar p={p} onSearch={onSearch} lang={lang} />

        {/* Dark / light toggle */}
        <button onClick={onToggleMode} title={mode==='dark'?'Light mode':'Dark mode'}
          style={{...iconBtn(p), flexShrink:0}}>
          {mode==='dark' ? <SunIcon color={p.ink}/> : <MoonIcon color={p.ink}/>}
        </button>

        {/* Saved */}
        <button onClick={()=>window.__nihon_go({name:'saved'})} title="Saved"
          style={{...iconBtn(p), flexShrink:0}}>
          <BookmarkIcon filled={savedCount>0} color={p.ink}/>
          {savedCount>0 && <span style={badgeStyle(p)}>{savedCount}</span>}
        </button>

        {/* Notifications (logged in only) */}
        {currentUser && (
          <div style={{position:'relative', flexShrink:0}}>
            <button onClick={()=>{ setNotifOpen(v=>!v); setMenuOpen(false); if(!notifOpen) onReadNotifs && onReadNotifs(); }}
              title="Notifications" style={iconBtn(p)}>
              <BellIcon color={p.ink}/>
              {unread>0 && <span style={badgeStyle(p)}>{unread}</span>}
            </button>
            {notifOpen && <NotifPanel p={p} lang={lang} notifs={notifs} onClose={()=>setNotifOpen(false)}/>}
          </div>
        )}

        {/* Lang — locked while composing (can't flip site lang mid-write) */}
        {(() => { const langLocked = route.name === 'compose'; return (
        <button onClick={()=>{ if(!langLocked) onLang(lang==='en'?'jp':'en'); }} disabled={langLocked}
          title={langLocked ? (lang==='jp'?'記事を保存してから言語を切り替えてください':'Save your post to switch language') : undefined}
          style={{
          appearance:'none', border:`1px solid ${p.line}`, background:p.surface,
          padding:'7px 10px', borderRadius:999, cursor: langLocked?'not-allowed':'pointer',
          fontFamily:'var(--fontBody)', fontSize:12, fontWeight:600, color:p.ink,
          letterSpacing:'0.04em', whiteSpace:'nowrap', flexShrink:0, opacity: langLocked?0.45:1,
        }}>
          {lang==='en' ? 'EN / 日本語' : '日本語 / EN'}
        </button>
        ); })()}

        {currentUser ? (
          <>
            <button onClick={()=>window.__nihon_go({name:'compose'})} style={{...gradStyle(p), padding:'9px 16px', fontSize:13, flexShrink:0}}>
              <PencilIcon color="#fff"/> {lang==='jp' ? '書く' : 'Write'}
            </button>
            <div style={{position:'relative', flexShrink:0}}>
              <button onClick={()=>{ setMenuOpen(v=>!v); setNotifOpen(false); }}
                style={{appearance:'none', border:'none', background:'transparent', cursor:'pointer', padding:0, borderRadius:'50%'}}>
                <Avatar user={currentUser} p={p} size={38} ring/>
              </button>
              {menuOpen && (
                <AvatarMenu p={p} lang={lang} user={currentUser}
                  onClose={()=>setMenuOpen(false)} onLogout={onLogout}/>
              )}
            </div>
          </>
        ) : (
          <button onClick={onLogin} style={{...gradStyle(p), padding:'10px 20px', fontSize:13, flexShrink:0}}>
            {lang==='jp' ? 'ログイン' : 'Sign in'}
          </button>
        )}
      </div>
    </header>
  );
}

function badgeStyle(p) {
  return {
    position:'absolute', top:-4, right:-4, minWidth:17, height:17, padding:'0 4px',
    borderRadius:9, background:p.stamp, color:'#fff', fontSize:10, fontWeight:700,
    display:'inline-flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--fontBody)',
    border:`2px solid ${p.bg}`,
  };
}

// ------- Notifications dropdown -------
function NotifPanel({ p, lang, notifs, onClose }) {
  const list = notifs || [];
  return (
    <>
      <div onClick={onClose} style={{position:'fixed', inset:0, zIndex:40}}></div>
      <div style={{
        position:'absolute', top:'calc(100% + 12px)', right:0, width:360, zIndex:41,
        background:p.surface, border:`1px solid ${p.line}`, borderRadius:18,
        boxShadow:`0 30px 60px -24px color-mix(in oklab, ${p.ink} 40%, transparent)`,
        overflow:'hidden',
      }}>
        <div style={{padding:'16px 18px', borderBottom:`1px solid ${p.line}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <span style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:17, color:p.ink}}>
            {lang==='jp'?'お知らせ':'Notifications'}
          </span>
          <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint}}>{list.length}</span>
        </div>
        <div style={{maxHeight:380, overflowY:'auto'}}>
          {list.length===0 ? (
            <div style={{padding:'40px 20px', textAlign:'center', color:p.inkFaint, fontFamily:'var(--fontBody)', fontSize:14}}>
              {lang==='jp'?'まだお知らせはありません。':'Nothing yet — go write something!'}
            </div>
          ) : list.map((n,i)=>(
            <div key={i} onClick={()=>{ if(n.route) window.__nihon_go(n.route); onClose(); }}
              style={{
                display:'flex', gap:12, padding:'14px 18px', cursor:'pointer',
                borderBottom:`1px solid ${p.line}`,
                background: n.read ? 'transparent' : `color-mix(in oklab, ${p.accent} 10%, ${p.surface})`,
              }}>
              <div style={{flexShrink:0, marginTop:2}}>
                {n.kind==='like' ? <HeartIcon color={p.stamp} filled size={18}/>
                 : n.kind==='comment' ? <CommentIcon color={p.accentDeep} size={18}/>
                 : n.kind==='follow' ? <span style={{fontFamily:'var(--fontDisplay)', color:p.accentDeep, fontWeight:700, fontSize:16}}>+</span>
                 : <BellIcon color={p.accentDeep} size={18}/>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontFamily:'var(--fontBody)', fontSize:14, color:p.ink, lineHeight:1.4}}>
                  <strong style={{fontWeight:600}}>{lang==='jp'?(n.who_jp||n.who):n.who}</strong> {lang==='jp'?n.text_jp:n.text_en}
                </div>
                <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, marginTop:3}}>{n.when}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ------- Avatar dropdown menu -------
function AvatarMenu({ p, lang, user, onClose, onLogout }) {
  const item = (label, fn) => (
    <button onClick={()=>{ fn(); onClose(); }} style={{
      appearance:'none', border:'none', background:'transparent', width:'100%', textAlign:'left',
      padding:'11px 16px', cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:14, color:p.ink,
      display:'flex', alignItems:'center', gap:10,
    }}
    onMouseEnter={(e)=>e.currentTarget.style.background=p.surface2}
    onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
      {label}
    </button>
  );
  return (
    <>
      <div onClick={onClose} style={{position:'fixed', inset:0, zIndex:40}}></div>
      <div style={{
        position:'absolute', top:'calc(100% + 12px)', right:0, width:240, zIndex:41,
        background:p.surface, border:`1px solid ${p.line}`, borderRadius:16,
        boxShadow:`0 30px 60px -24px color-mix(in oklab, ${p.ink} 40%, transparent)`,
        overflow:'hidden', paddingBottom:6,
      }}>
        <div style={{padding:'16px', borderBottom:`1px solid ${p.line}`, display:'flex', gap:12, alignItems:'center'}}>
          <Avatar user={user} p={p} size={42}/>
          <div style={{minWidth:0}}>
            <div style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:15, color:p.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
              {lang==='jp'?user.jp:user.en}
            </div>
            <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint}}>@{user.slug}</div>
          </div>
        </div>
        <div style={{paddingTop:6}}>
          {item(<><span style={{display:'inline-flex',width:18}}>👤</span>{lang==='jp'?'プロフィール':'My profile'}</>, ()=>window.__nihon_go({name:'profile'}))}
          {item(<><span style={{display:'inline-flex',width:18}}><PencilIcon color={p.inkSoft}/></span>{lang==='jp'?'記事を書く':'Write a story'}</>, ()=>window.__nihon_go({name:'compose'}))}
          {item(<><span style={{display:'inline-flex',width:18}}><BookmarkIcon color={p.inkSoft} size={15}/></span>{lang==='jp'?'保存した記事':'Saved'}</>, ()=>window.__nihon_go({name:'saved'}))}
        </div>
        <div style={{borderTop:`1px solid ${p.line}`, marginTop:6, paddingTop:6}}>
          {item(<span style={{color:p.stamp}}>{lang==='jp'?'ログアウト':'Sign out'}</span>, onLogout)}
        </div>
      </div>
    </>
  );
}

function iconBtn(p) {
  return {
    appearance:'none', border:`1px solid ${p.line}`, background:p.surface,
    width:38, height:38, borderRadius:999, cursor:'pointer',
    display:'inline-flex', alignItems:'center', justifyContent:'center',
    color: p.ink, position:'relative',
  };
}

// API origin for the live search fetches: same-origin in dev (Vite proxies
// /search → :8787), the API host in prod. Mirrors api.jsx's API_BASE.
const SEARCH_API = (typeof location !== 'undefined' && location.hostname === 'localhost')
  ? '' : 'https://api.nihon101.com';

// Live search box with a grouped autocomplete dropdown. Debounced
// /search/autocomplete calls fill four groups, rendered in order: posts →
// categories → tags → authors. Arrow keys move a highlight across every row,
// Enter selects (or runs a full search when nothing is highlighted), Escape
// closes. Styled entirely in the prototype's `p.*` tokens. Shared by the SSR
// home header island and the SPA, so both get the dropdown.
function SearchBar({p, onSearch, lang}) {
  const loc = lang === 'jp' ? 'ja' : 'en';
  const EMPTY = { posts: [], categories: [], tags: [], authors: [] };
  const [v, setV] = React.useState('');
  const [data, setData] = React.useState(EMPTY);
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(-1);
  const wrapRef = React.useRef(null);
  const inputRef = React.useRef(null);

  const title = (o) => (lang==='jp' ? (o.titleJa || o.titleEn) : (o.titleEn || o.titleJa)) || '—';
  const catLabel = (o) => (lang==='jp' ? (o.labelJa || o.labelEn) : (o.labelEn || o.labelJa)) || o.id;
  const authorName = (a) => (lang==='jp' ? (a.displayNameJa || a.displayName) : (a.displayName || a.displayNameJa)) || a.handle;
  const initialsOf = (n) => ((n||'').trim().split(/\s+/).map((w)=>w[0]).join('').slice(0,3) || '?').toUpperCase();

  const go = (href) => { window.location.href = href; };
  const goSearch = (query) => {
    const term = (query||'').trim();
    go(`/${loc}/search${term ? `?q=${encodeURIComponent(term)}` : ''}`);
  };

  // Debounced autocomplete. Empty query clears the panel.
  React.useEffect(() => {
    const term = v.trim();
    if (!term) { setData(EMPTY); return; }
    const t = setTimeout(() => {
      fetch(`${SEARCH_API}/search/autocomplete?q=${encodeURIComponent(term)}&loc=${loc}`)
        .then((r) => r.json()).then((d) => { setData(d || EMPTY); setHi(-1); }).catch(() => {});
    }, 160);
    return () => clearTimeout(t);
  }, [v, loc]);

  // Close on outside click.
  React.useEffect(() => {
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Flatten the four groups into one ordered list for arrow-key navigation.
  const rows = React.useMemo(() => {
    const r = [];
    for (const o of data.posts || []) r.push({ kind:'post', key:'p'+o.id, label:title(o), go:()=>go(`/${loc}/app#/article/${o.slug}`) });
    for (const c of data.categories || []) r.push({ kind:'category', key:'c'+c.id, label:catLabel(c), kanji:c.kanji, go:()=>go(`/${loc}/c/${c.id}`) });
    for (const t of data.tags || []) r.push({ kind:'tag', key:'t'+t.id, label:t.label, count:t.postCount, go:()=>go(`/${loc}/t/${t.id}`) });
    for (const a of data.authors || []) r.push({ kind:'author', key:'a'+a.handle, label:authorName(a), handle:a.handle, img:a.avatarUrl, go:()=>go(`/${loc}/u/${a.handle}`) });
    return r;
  }, [data, loc, lang]);

  const showPanel = open && v.trim().length > 0;

  const onKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((i)=>Math.min(rows.length-1, i+1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i)=>Math.max(-1, i-1)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (hi >= 0 && rows[hi]) rows[hi].go(); else goSearch(v);
    }
  };

  const groupHead = (txt) => (
    <div style={{fontFamily:'var(--fontMono)', fontSize:9, letterSpacing:'0.16em', textTransform:'uppercase', color:p.inkFaint, padding:'8px 12px 4px'}}>{txt}</div>
  );
  const rowStyle = (idx) => ({
    display:'flex', alignItems:'center', gap:10, width:'100%', textAlign:'left',
    padding:'8px 12px', border:'none', borderRadius:10, cursor:'pointer',
    background: hi===idx ? p.surface2 : 'transparent',
    fontFamily:'var(--fontBody)', fontSize:13.5, color:p.ink,
  });

  // Render a group (header + its rows) with the right global offset so the
  // highlight lines up with the flattened `rows` list.
  let cursor = 0;
  const renderGroup = (kind, label, render) => {
    const items = rows.filter((r) => r.kind === kind);
    if (!items.length) return null;
    const start = cursor; cursor += items.length;
    return (
      <div style={{borderTop: start>0 ? `1px solid ${p.line}` : 'none'}}>
        {groupHead(label)}
        {items.map((row, i) => {
          const gi = start + i;
          return (
            <button key={row.key} type="button" style={rowStyle(gi)}
              onMouseEnter={()=>setHi(gi)}
              onMouseDown={(e)=>{e.preventDefault(); row.go();}}>
              {render(row)}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div ref={wrapRef} style={{position:'relative', flexShrink:1, minWidth:0}}>
      <form className="nihon-search" onSubmit={(e)=>{e.preventDefault(); goSearch(v);}} style={{
        display:'flex', alignItems:'center', gap:8,
        background:p.surface, border:`1px solid ${showPanel ? p.accent : p.line}`, borderRadius:999,
        padding:'7px 14px', minWidth:160,
      }}>
        <SearchIcon color={p.inkFaint}/>
        <input ref={inputRef} value={v}
          onChange={(e)=>{setV(e.target.value); setOpen(true);}}
          onFocus={()=>setOpen(true)} onKeyDown={onKey}
          placeholder={lang==='jp'?'記事を探す…':'Search nihon101…'}
          aria-label="Search"
          style={{
            border:'none', outline:'none', background:'transparent',
            fontFamily:'var(--fontBody)', fontSize:13, color:p.ink,
            flex:1, minWidth:0,
          }}/>
        {v ? (
          <button type="button" aria-label="Clear"
            onMouseDown={(e)=>{e.preventDefault(); setV(''); inputRef.current?.focus();}}
            style={{appearance:'none', border:'none', background:'transparent', cursor:'pointer', color:p.inkFaint, fontFamily:'var(--fontMono)', fontSize:11, padding:0}}>✕</button>
        ) : (
          <span style={{
            fontFamily:'var(--fontMono)', fontSize:10, color:p.inkFaint,
            border:`1px solid ${p.line}`, padding:'1px 5px', borderRadius:4,
          }}>⌘ K</span>
        )}
      </form>

      {showPanel && (
        <div style={{
          position:'absolute', top:'calc(100% + 8px)', right:0, width:360, maxWidth:'80vw',
          background:p.surface, border:`1px solid ${p.line}`, borderRadius:16,
          boxShadow:`0 24px 48px -24px color-mix(in oklab, ${p.ink} 40%, transparent)`,
          zIndex:80, overflow:'hidden',
        }}>
          {rows.length ? (
            <div style={{maxHeight:'62vh', overflowY:'auto', padding:6}}>
              {renderGroup('post', lang==='jp'?'記事':'Posts', (r)=>(
                <>
                  <span style={{color:p.inkFaint, flex:'none', fontSize:12}}>✎</span>
                  <span style={{flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.label}</span>
                </>
              ))}
              {renderGroup('category', lang==='jp'?'カテゴリー':'Categories', (r)=>(
                <>
                  <span style={{fontFamily:'var(--fontDisplay)', color:p.stamp, flex:'none', width:16, textAlign:'center'}}>{r.kanji||'·'}</span>
                  <span style={{flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.label}</span>
                </>
              ))}
              {renderGroup('tag', lang==='jp'?'タグ':'Tags', (r)=>(
                <>
                  <span style={{color:p.accent, fontWeight:800, width:16, textAlign:'center', flex:'none'}}>#</span>
                  <span style={{flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.label}</span>
                  <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, flex:'none'}}>{r.count}</span>
                </>
              ))}
              {renderGroup('author', lang==='jp'?'書き手':'Authors', (r)=>(
                <>
                  <span style={{width:22, height:22, borderRadius:'50%', flex:'none', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--fontDisplay)', fontSize:10, color:'#3a2e28', background:`linear-gradient(135deg, ${p.accent}, ${p.surface2})`}}>
                    {r.img ? <img src={r.img} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}}/> : initialsOf(r.label)}
                  </span>
                  <span style={{flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                    <b>{r.label}</b> <span style={{color:p.inkFaint}}>@{r.handle}</span>
                  </span>
                </>
              ))}
            </div>
          ) : (
            <div style={{padding:'22px 16px', textAlign:'center', color:p.inkFaint, fontFamily:'var(--fontBody)', fontSize:13}}>
              {lang==='jp'?`「${v.trim()}」に一致なし`:`No matches for “${v.trim()}”`}
            </div>
          )}
          <div style={{padding:10, borderTop:`1px solid ${p.line}`, background:p.surface2, display:'flex', justifyContent:'flex-end'}}>
            <button type="button" onMouseDown={(e)=>{e.preventDefault(); goSearch(v);}}
              style={{appearance:'none', border:'none', cursor:'pointer', borderRadius:999, padding:'8px 16px', fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, color:'#fff', background:`linear-gradient(135deg, ${p.accent}, ${p.accentDeep})`}}>
              {lang==='jp'?'すべて検索':'Search all'} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Small wavy mark used as a section accent (replaces solid dashes)
function WaveMark({color, w=28, h=8}) {
  return (
    <svg width={w} height={h} viewBox="0 0 28 8" style={{display:'inline-block'}}>
      <path d="M1 4 Q 5 0, 9 4 T 17 4 T 27 4" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

Object.assign(window, { WaveMark });

// Vibrant gradient pill style for primary CTAs
function gradStyle(p, extra={}) {
  return {
    appearance:'none', border:'none', cursor:'pointer',
    background:`linear-gradient(135deg, ${p.accent} 0%, ${p.accentDeep} 100%)`,
    color:'#fff', padding:'14px 22px', borderRadius:999,
    fontFamily:'var(--fontBody)', fontSize:14, fontWeight:600,
    letterSpacing:'0.01em', whiteSpace:'nowrap',
    boxShadow:`0 12px 24px -10px ${p.accentDeep}, 0 2px 4px -2px ${p.accent}`,
    transition:'transform .15s ease, box-shadow .15s ease',
    display:'inline-flex', alignItems:'center', gap:8,
    ...extra,
  };
}

// Soft pink wavy background — used behind hero / newsletter
function WavyBG({p, opacity=0.5}) {
  return (
    <svg style={{position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', opacity}} viewBox="0 0 1400 800" preserveAspectRatio="none">
      <defs>
        <linearGradient id="wavy1" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={p.accent} stopOpacity="0.35"/>
          <stop offset="1" stopColor={p.accent} stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="wavy2" x1="1" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={p.accentDeep} stopOpacity="0.18"/>
          <stop offset="1" stopColor={p.accentDeep} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d="M0,150 C 350,40 700,260 1050,140 C 1250,80 1400,170 1400,170 L1400,0 L0,0 Z" fill="url(#wavy1)"/>
      <path d="M0,620 C 300,720 700,500 1050,640 C 1250,720 1400,560 1400,560 L1400,800 L0,800 Z" fill="url(#wavy2)"/>
    </svg>
  );
}

Object.assign(window, { gradStyle, WavyBG });

// ------- Photo placeholder (saturated, with kanji subject) -------
function Photo({ hue, label, p, h='100%', aspect, radius=14, accent, subject }) {
  const [c1, c2] = tintGradient(hue);
  const glyph = subject || subjectGlyph(hue);
  return (
    <div style={{
      position:'relative', width:'100%', height: h, aspectRatio: aspect,
      borderRadius:radius, overflow:'hidden',
      background:`linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
      boxShadow:`0 30px 60px -40px color-mix(in oklab, ${c2} 70%, ${p.ink} 30%)`,
    }}>
      {/* soft light blob */}
      <div style={{
        position:'absolute', right:'-12%', top:'-18%', width:'70%', aspectRatio:1, borderRadius:'50%',
        background:`radial-gradient(circle, color-mix(in oklab, ${p.surface} 60%, transparent) 0%, transparent 70%)`,
      }}></div>
      {/* bottom vignette */}
      <div style={{
        position:'absolute', inset:0,
        background:`linear-gradient(180deg, transparent 55%, color-mix(in oklab, ${c2} 65%, #000 35%) 115%)`,
        opacity:0.22, pointerEvents:'none',
      }}></div>
      {/* subject kanji */}
      <div style={{
        position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'var(--fontDisplay)', fontWeight:600,
        fontSize:'clamp(120px, 30%, 280px)', color:'rgba(255,255,255,0.6)',
        textShadow:`0 4px 30px ${c2}`,
        lineHeight:1, userSelect:'none', pointerEvents:'none',
        letterSpacing:'-0.04em',
      }}>{glyph}</div>
      {/* caption */}
      <div style={{
        position:'absolute', left:14, bottom:12, display:'flex', alignItems:'center', gap:8,
        background:`color-mix(in oklab, ${p.surface} 92%, transparent)`, backdropFilter:'blur(6px)',
        padding:'5px 10px', borderRadius:999, fontFamily:'var(--fontMono)',
        fontSize:10, letterSpacing:'0.08em', color:p.inkSoft, textTransform:'uppercase',
      }}>
        <span style={{width:6, height:6, borderRadius:3, background:p.stamp, display:'inline-block'}}></span>
        photo: {label}
      </div>
      {accent ? <Hanko p={p} text={accent} size={64} top={14} right={14} /> : null}
    </div>
  );
}

// ------- Hanko stamp (small kanji seal) -------
function Hanko({p, text, size=58, top=12, right=12, rotate=-6}) {
  return (
    <div style={{
      position:'absolute', top, right,
      width:size, height:size, borderRadius:'14%',
      border:`2.5px solid ${p.stamp}`,
      color:p.stamp, background:'transparent',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'var(--fontDisplay)', fontWeight:700,
      fontSize: size*0.45, lineHeight:1,
      transform:`rotate(${rotate}deg)`,
      letterSpacing:'-0.04em',
      writingMode: text.length>1?'vertical-rl':'horizontal-tb',
    }}>
      {text}
    </div>
  );
}

// ------- Category chip -------
function CategoryChip({ slug, p, lang, size='md' }) {
  const cat = window.NIHON_DATA.CATEGORIES.find(c=>c.slug===slug);
  if (!cat) return null;
  const c = tintBg(cat.tint, p);
  const padY = size==='sm' ? 3 : 4;
  const padX = size==='sm' ? 8 : 10;
  const fs   = size==='sm' ? 10 : 11;
  return (
    <a href={`#/category/${slug}`} onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'category', slug});}}
       style={{
        display:'inline-flex', alignItems:'center', gap:6, textDecoration:'none',
        padding:`${padY}px ${padX}px`, borderRadius:999,
        background:`color-mix(in oklab, ${c} 35%, ${p.surface})`,
        border:`1px solid color-mix(in oklab, ${c} 50%, ${p.line})`,
        color: p.ink, fontFamily:'var(--fontBody)',
        fontSize: fs, fontWeight:600, letterSpacing:'0.04em', textTransform:'uppercase',
      }}>
      <span style={{fontFamily:'var(--fontDisplay)', color:p.stamp, textTransform:'none', letterSpacing:0}}>{cat.kanji}</span>
      {lang==='jp' ? cat.jp : cat.en}
    </a>
  );
}

// ------- Author chip -------
function AuthorChip({ slug, p, lang, size='md', date }) {
  const a = getAuthor(slug);
  if (!a) return null;
  const c = tintBg(a.tint, p);
  const dim = size==='lg' ? 44 : (size==='sm' ? 26 : 32);
  return (
    <a href={`#/author/${slug}`} onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'author', slug});}}
       style={{
        display:'inline-flex', alignItems:'center', gap:10, textDecoration:'none',
      }}>
      <div style={{
        width:dim, height:dim, borderRadius:'50%',
        background:`linear-gradient(135deg, ${c}, color-mix(in oklab, ${c} 50%, ${p.surface2}))`,
        color: p.ink, display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize: dim*0.42,
        border:`1px solid ${p.line}`,
      }}>
        {a.initials}
      </div>
      <div style={{display:'flex', flexDirection:'column'}}>
        <span style={{fontFamily:'var(--fontBody)', fontSize: size==='lg'?14:13, color:p.ink, fontWeight:600}}>
          {lang==='jp' ? a.jp : a.en}
        </span>
        {date ? <span style={{fontFamily:'var(--fontBody)', fontSize:11, color:p.inkFaint}}>{date} · {a.city}</span> : null}
      </div>
    </a>
  );
}

// ------- Icons -------
function SearchIcon({color='currentColor', size=14}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
  </svg>);
}
function BookmarkIcon({color='currentColor', size=16, filled=false}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill={filled?color:'none'} stroke={color} strokeWidth="2" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>);
}
function ClapIcon({color='currentColor', size=18, filled=false}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill={filled?color:'none'} stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
    <path d="M12 3v6"/><path d="M8 5l1.5 4"/><path d="M16 5l-1.5 4"/>
    <path d="M5 10c-1 .5-1.5 2 0 4l3 5c1.5 2.5 3.5 3 6 3s5-1 5.5-3.5L21 12c.5-2-1-3-2-2l-2.5 2.5"/>
  </svg>);
}
function ArrowRight({color='currentColor', size=16}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>);
}
function ArrowLeft({color='currentColor', size=16}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 5l-7 7 7 7"/></svg>);
}
function SunIcon({color='currentColor', size=18}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>);
}
function MoonIcon({color='currentColor', size=18}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z"/></svg>);
}
function BellIcon({color='currentColor', size=18}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>);
}
function HeartIcon({color='currentColor', size=18, filled=false}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill={filled?color:'none'} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>);
}
function CommentIcon({color='currentColor', size=18}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 20l1.3-3.8A8.3 8.3 0 0 1 3.5 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8.5 8.4z"/></svg>);
}
function PencilIcon({color='currentColor', size=16}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>);
}
function TrendIcon({color='currentColor', size=16}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 7-7"/><path d="M17 5h4v4"/></svg>);
}

// ------- Avatar (initials chip) -------
function Avatar({ user, p, size=36, ring=false }) {
  if (!user) return null;
  const c = tintBg(user.tint, p);
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background:`linear-gradient(135deg, ${c}, color-mix(in oklab, ${c} 50%, ${p.surface2}))`,
      color:'#3a2e28', display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:size*0.4,
      border: ring ? `2px solid ${p.surface}` : `1px solid ${p.line}`,
      boxShadow: ring ? `0 0 0 2px ${p.accent}` : 'none',
      overflow:'hidden',
    }}>{user.avatarUrl
      ? <img src={user.avatarUrl} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}}/>
      : user.initials}</div>
  );
}

// ------- Brushy underline (display SVG) -------
function BrushUnderline({color, width='100%', h=10}) {
  return (
    <svg width={width} height={h} viewBox="0 0 200 10" preserveAspectRatio="none"
         style={{display:'block', marginTop:-4}}>
      <path d="M2 6 Q 50 2, 100 5 T 198 4" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.85"/>
    </svg>
  );
}

// ------- Footer -------
function Footer({p, lang}) {
  return (
    <footer style={{
      borderTop:`1px solid ${p.line}`, background:p.surface, marginTop:80,
    }}>
      <div style={{maxWidth:1320, margin:'0 auto', padding:'48px 32px 36px',
        display:'grid', gridTemplateColumns:'1.4fr 1fr 1fr 1fr', gap:48,
      }}>
        <div>
          <Logo p={p} jp={lang==='jp'} size={32}/>
          <p style={{marginTop:14, fontFamily:'var(--fontBody)', fontSize:14, color:p.inkSoft, lineHeight:1.6, maxWidth:280}}>
            {lang==='jp'
              ? '日本の今、昨日、いつかについて書く小さな雑誌。'
              : 'A small magazine about Japan today, yesterday, and someday. Read slowly.'}
          </p>
        </div>
        <FooterCol p={p} title={lang==='jp'?'読む':'Read'}
          items={[
            {label:'Today', route:{name:'home'}},
            {label:'Explore', route:{name:'search'}},
            {label:'Writers', route:{name:'authors'}},
            {label:'Saved', route:{name:'saved'}},
          ]} lang={lang} />
        <FooterCol p={p} title={lang==='jp'?'雑誌について':'Magazine'}
          items={[
            {label:'About', route:{name:'about'}},
            {label:'Contact', route:{name:'contact'}},
            {label:'Privacy', route:{name:'privacy'}},
            {label:'Submit', route:{name:'compose'}},
          ]} lang={lang} />
        <div>
          <div style={{fontFamily:'var(--fontBody)', fontSize:11, color:p.inkFaint, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:14}}>
            {lang==='jp'?'おたより':'Newsletter'}
          </div>
          <NewsletterMini p={p} lang={lang}/>
        </div>
      </div>
      <div style={{borderTop:`1px solid ${p.line}`, padding:'18px 32px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap',
        fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.06em',
      }}>
        <span>© 2026 nihon101 — {lang==='jp'?'丁寧に作りました':'made with care in Tokyo'}</span>
        <span style={{display:'inline-flex', gap:16}}>
          <a href="#/privacy" onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'privacy'});}} style={{color:p.inkFaint, textDecoration:'none'}}>{lang==='jp'?'プライバシー':'Privacy'}</a>
          <a href="#/contact" onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'contact'});}} style={{color:p.inkFaint, textDecoration:'none'}}>{lang==='jp'?'お問い合わせ':'Contact'}</a>
          <span>vol. 02 · issue 14</span>
        </span>
      </div>
    </footer>
  );
}
function FooterCol({p, title, items, lang}) {
  return (
    <div>
      <div style={{fontFamily:'var(--fontBody)', fontSize:11, color:p.inkFaint, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:14}}>{title}</div>
      <ul style={{listStyle:'none', display:'flex', flexDirection:'column', gap:8}}>
        {items.map((it,i)=>(
          <li key={i}>
            <a href="#" onClick={(e)=>{e.preventDefault(); window.__nihon_go(it.route);}}
              style={{textDecoration:'none', color:p.ink, fontFamily:'var(--fontBody)', fontSize:14}}>
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
function NewsletterMini({p, lang}) {
  const [v, setV] = React.useState('');
  const [done, setDone] = React.useState(false);
  return (
    <form onSubmit={(e)=>{e.preventDefault(); if(v.includes('@')) setDone(true);}} style={{
      display:'flex', gap:0,
      border:`1px solid ${p.line}`, borderRadius:999, background:p.bg, overflow:'hidden',
    }}>
      <input value={v} onChange={(e)=>setV(e.target.value)} placeholder={lang==='jp'?'メールアドレス':'you@example.com'}
        style={{flex:1, minWidth:0, border:'none', outline:'none', background:'transparent',
          padding:'10px 14px', fontFamily:'var(--fontBody)', fontSize:13, color:p.ink}}/>
      <button style={{
        border:'none', background:p.ink, color:p.surface, padding:'10px 16px',
        fontFamily:'var(--fontBody)', fontSize:12, fontWeight:600, cursor:'pointer',
      }}>{done ? '✓' : (lang==='jp'?'登録':'Send')}</button>
    </form>
  );
}

Object.assign(window, {
  PALETTES, FONT_PAIRINGS, tintBg,
  Logo, Nav, Photo, Hanko, CategoryChip, AuthorChip, Avatar,
  SearchIcon, BookmarkIcon, ClapIcon, ArrowRight, ArrowLeft,
  SunIcon, MoonIcon, BellIcon, HeartIcon, CommentIcon, PencilIcon, TrendIcon,
  BrushUnderline, Footer, gradStyle,
});
