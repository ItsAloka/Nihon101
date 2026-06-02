// @ts-nocheck
// ui.tsx — shared chrome (Nav, Footer, Logo, Placeholders, cards) + helpers
import React from 'react';
import { CATEGORIES, AUTHORS, POSTS } from './data';
import { tintBg, tintGradient, subjectGlyph } from './theme';
import { useAuth } from '../stores/auth';

export function maxWrap() { return { maxWidth: 1320, margin: '0 auto', padding: '0 32px' } as const; }

// ------- Logo -------
export function Logo({ p, jp, size = 28 }) {
  return (
    <a href="#/" onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'home'});}}
       style={{display:'inline-flex', alignItems:'center', gap:10, textDecoration:'none', color:p.ink}}>
      <div style={{
        position:'relative', width: size, height: size,
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <div style={{
          width: size, height: size, borderRadius: '50%',
          background:`radial-gradient(circle at 35% 30%, ${p.surface}, ${p.stamp} 70%)`,
          boxShadow:`0 0 0 1px ${p.line}`,
        }}></div>
      </div>
      <span style={{
        fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize: size*0.85, letterSpacing:'-0.02em',
        lineHeight:1,
      }}>
        nihon<span style={{color:p.stamp}}>101</span>
      </span>
      {jp ? <span style={{fontFamily:'var(--fontDisplay)', color:p.inkFaint, fontSize:13, marginLeft:4, letterSpacing:'0.1em'}}>日本</span> : null}
    </a>
  );
}

// ------- Top nav -------
export function Nav({ p, route, lang, onLang, onSearch, savedCount, dark, onToggleDark }) {
  const items = [
    { label: lang==='jp' ? '今日のこと' : 'Today',     route: {name:'home'} },
    { label: lang==='jp' ? '探す' : 'Explore',         route: {name:'search'} },
    { label: lang==='jp' ? '書く人' : 'Writers',        route: {name:'authors'} },
    { label: lang==='jp' ? 'はじめに' : 'About',        route: {name:'about'} },
  ];
  return (
    <header style={{
      position:'sticky', top:0, zIndex:30,
      background:`color-mix(in oklab, ${p.bg} 88%, transparent)`,
      backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)',
      borderBottom:`1px solid ${p.line}`,
    }}>
      <div style={{
        maxWidth:1320, margin:'0 auto', padding:'14px 32px',
        display:'flex', alignItems:'center', gap:24,
      }}>
        <Logo p={p} jp={lang==='jp'} />
        <nav className="nihon-mainnav" style={{display:'flex', gap:4, marginLeft:16}}>
          {items.map((it, i) => {
            const active = (route.name === it.route.name);
            return (
              <button key={i} onClick={()=>window.__nihon_go(it.route)}
                style={{
                  appearance:'none', border:'none', background:'transparent',
                  padding:'8px 14px', borderRadius:999, cursor:'pointer',
                  fontFamily:'var(--fontBody)', fontSize:14, fontWeight: active?600:500,
                  color: active ? p.ink : p.inkSoft, position:'relative',
                  whiteSpace:'nowrap', flexShrink:0,
                }}>
                {it.label}
                {active && <span style={{
                  position:'absolute', left:14, right:14, bottom:2,
                  height:6, background: p.accent, borderRadius:6, zIndex:-1, opacity:0.55,
                }}></span>}
              </button>
            );
          })}
        </nav>
        <SearchBar p={p} onSearch={onSearch} lang={lang} />
        <button onClick={()=>window.__nihon_go({name:'saved'})} title="Saved"
          style={{...iconBtn(p), flexShrink:0, marginLeft:'auto'}}>
          <BookmarkIcon filled={savedCount>0} color={p.ink}/>
          {savedCount>0 && <span style={{
            position:'absolute', top:-3, right:-3, minWidth:16, height:16, padding:'0 4px',
            borderRadius:8, background:p.stamp, color:'#fff', fontSize:10, fontWeight:600,
            display:'inline-flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--fontBody)',
          }}>{savedCount}</span>}
        </button>
        <button onClick={()=>onLang(lang==='en'?'jp':'en')} style={{
          appearance:'none', border:`1px solid ${p.line}`, background:p.surface,
          padding:'6px 10px', borderRadius:999, cursor:'pointer',
          fontFamily:'var(--fontBody)', fontSize:12, fontWeight:600, color:p.ink,
          letterSpacing:'0.06em', whiteSpace:'nowrap', flexShrink:0,
        }}>
          {lang==='en' ? 'EN / 日本語' : '日本語 / EN'}
        </button>
        <button onClick={()=>window.__nihon_go({name:'write'})} style={{
          appearance:'none', border:'none', background:p.ink, color:p.surface,
          padding:'10px 18px', borderRadius:999, cursor:'pointer',
          fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, letterSpacing:'0.01em',
          whiteSpace:'nowrap', flexShrink:0,
        }}>
          {lang==='jp' ? '書く' : 'Write'}
        </button>
        <AuthControl p={p} lang={lang} />
      </div>
    </header>
  );
}

// ------- Auth control (real backend-wired) -------
export function AuthControl({ p, lang }) {
  const { user, status, init, logout } = useAuth();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const locale = lang === 'jp' ? 'ja' : 'en';

  React.useEffect(() => { void init(); }, [init]);
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (status === 'loading') {
    return <div style={{...iconBtn(p), flexShrink:0, borderColor:p.line, opacity:0.5}} />;
  }
  if (status === 'authed' && user) {
    return (
      <div ref={ref} style={{position:'relative', flexShrink:0}}>
        <button onClick={()=>setOpen(o=>!o)} title={user.displayName}
          style={{...iconBtn(p), background:p.stamp, borderColor:p.stamp, color:'#fff', fontFamily:'var(--fontBody)', fontSize:14, fontWeight:700}}>
          {user.displayName.charAt(0).toUpperCase()}
        </button>
        {open && (
          <div style={{
            position:'absolute', right:0, top:46, width:200, zIndex:40,
            background:p.surface, border:`1px solid ${p.line}`, borderRadius:14,
            boxShadow:'0 8px 30px rgba(0,0,0,.10)', overflow:'hidden', padding:'4px 0',
          }}>
            <div style={{padding:'10px 14px', fontFamily:'var(--fontBody)', fontSize:12, color:p.inkFaint, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{user.email}</div>
            <div style={{height:1, background:p.line, margin:'2px 0'}} />
            <a href={`/${locale}/settings`}
              style={{display:'block', textDecoration:'none', padding:'10px 14px', fontFamily:'var(--fontBody)', fontSize:14, color:p.ink}}>
              {lang==='jp' ? '設定' : 'Settings'}
            </a>
            <button onClick={()=>{ void logout(); setOpen(false); }}
              style={{display:'block', width:'100%', textAlign:'left', appearance:'none', border:'none', background:'transparent', cursor:'pointer', padding:'10px 14px', fontFamily:'var(--fontBody)', fontSize:14, color:p.ink}}>
              {lang==='jp' ? 'ログアウト' : 'Log out'}
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <a href={`/${locale}/login`} title={lang==='jp' ? 'ログイン' : 'Log in'}
      style={{...iconBtn(p), flexShrink:0, textDecoration:'none'}}>
      <UserIcon color={p.ink} />
    </a>
  );
}

export function UserIcon({color='currentColor', size=18}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>
  </svg>);
}

export function iconBtn(p) {
  return {
    appearance:'none', border:`1px solid ${p.line}`, background:p.surface,
    width:38, height:38, borderRadius:999, cursor:'pointer',
    display:'inline-flex', alignItems:'center', justifyContent:'center',
    color: p.ink, position:'relative',
  };
}

export function SearchBar({p, onSearch, lang}) {
  const [v, setV] = React.useState('');
  return (
    <form className="nihon-search" onSubmit={(e)=>{e.preventDefault(); onSearch(v);}} style={{
      display:'flex', alignItems:'center', gap:8,
      background:p.surface, border:`1px solid ${p.line}`, borderRadius:999,
      padding:'7px 14px', minWidth:160, flexShrink:1,
    }}>
      <SearchIcon color={p.inkFaint}/>
      <input value={v} onChange={(e)=>setV(e.target.value)}
        placeholder={lang==='jp'?'記事を探す…':'Search nihon101…'}
        style={{
          border:'none', outline:'none', background:'transparent',
          fontFamily:'var(--fontBody)', fontSize:13, color:p.ink,
          flex:1, minWidth:0,
        }}/>
      <span style={{
        fontFamily:'var(--fontMono)', fontSize:10, color:p.inkFaint,
        border:`1px solid ${p.line}`, padding:'1px 5px', borderRadius:4,
      }}>⌘ K</span>
    </form>
  );
}

// Small wavy mark used as a section accent (replaces solid dashes)
export function WaveMark({color, w=28, h=8}) {
  return (
    <svg width={w} height={h} viewBox="0 0 28 8" style={{display:'inline-block'}}>
      <path d="M1 4 Q 5 0, 9 4 T 17 4 T 27 4" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// Vibrant gradient pill style for primary CTAs
export function gradStyle(p, extra={}) {
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
export function WavyBG({p, opacity=0.5}) {
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

// ------- Photo placeholder (saturated, with kanji subject) -------
export function Photo({ hue, label, p, h='100%', aspect, radius=14, accent, subject }) {
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
export function Hanko({p, text, size=58, top=12, right=12, rotate=-6}) {
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
export function CategoryChip({ slug, p, lang, size='md' }) {
  const cat = CATEGORIES.find(c=>c.slug===slug);
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
export function AuthorChip({ slug, p, lang, size='md', date }) {
  const a = AUTHORS.find(x=>x.slug===slug);
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
export function SearchIcon({color='currentColor', size=14}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
  </svg>);
}
export function BookmarkIcon({color='currentColor', size=16, filled=false}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill={filled?color:'none'} stroke={color} strokeWidth="2" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>);
}
export function ClapIcon({color='currentColor', size=18, filled=false}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill={filled?color:'none'} stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
    <path d="M12 3v6"/><path d="M8 5l1.5 4"/><path d="M16 5l-1.5 4"/>
    <path d="M5 10c-1 .5-1.5 2 0 4l3 5c1.5 2.5 3.5 3 6 3s5-1 5.5-3.5L21 12c.5-2-1-3-2-2l-2.5 2.5"/>
  </svg>);
}
export function ArrowRight({color='currentColor', size=16}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>);
}
export function ArrowLeft({color='currentColor', size=16}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 5l-7 7 7 7"/></svg>);
}
export function ShareIcon({color='currentColor', size=14}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/>
  </svg>);
}

// ------- Brushy underline (display SVG) -------
export function BrushUnderline({color, width='100%', h=10}) {
  return (
    <svg width={width} height={h} viewBox="0 0 200 10" preserveAspectRatio="none"
         style={{display:'block', marginTop:-4}}>
      <path d="M2 6 Q 50 2, 100 5 T 198 4" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.85"/>
    </svg>
  );
}

// ------- Section header (shared) -------
export function SectionHeader({p, lang, en, jp, kicker_en, kicker_jp, right}) {
  return (
    <div style={{
      marginTop:80, marginBottom:28, display:'flex', alignItems:'end', justifyContent:'space-between', gap:24,
    }}>
      <div>
        <div style={{fontFamily:'var(--fontMono)', fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:p.inkFaint, marginBottom:10, display:'flex', alignItems:'center', gap:8}}>
          <WaveMark color={p.stamp}/>
          {lang==='jp'?kicker_jp:kicker_en}
        </div>
        <h2 style={{
          fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(28px, 2.8vw, 40px)', letterSpacing:'-0.02em',
          color:p.ink, lineHeight:1.1, display:'inline-flex', alignItems:'baseline', gap:14,
        }}>
          {lang==='jp'?jp:en}
          <span style={{fontFamily:'var(--fontDisplay)', fontSize:'0.45em', color:p.inkFaint, letterSpacing:'0.1em'}}>
            {lang==='jp'?en:jp}
          </span>
        </h2>
      </div>
      {right}
    </div>
  );
}

// ------- Article card (used in grids) -------
export function ArticleCard({p, lang, post, t, saved, onSave, compact=false}) {
  const title = lang==='jp'?post.title_jp:post.title_en;
  const excerpt = lang==='jp'?post.excerpt_jp:post.excerpt_en;
  const card = t.cardStyle;
  return (
    <article style={{
      background: card==='textured' ? p.surface : (card==='outlined' ? 'transparent' : 'transparent'),
      border: card==='outlined' ? `1px solid ${p.line}` : 'none',
      padding: (card==='textured' || card==='outlined') ? 18 : 0,
      borderRadius: 16,
      display:'flex', flexDirection:'column', gap:12,
      position:'relative',
      transition:'transform .25s ease',
    }}
    onMouseEnter={(e)=>e.currentTarget.style.transform='translateY(-4px)'}
    onMouseLeave={(e)=>e.currentTarget.style.transform='translateY(0)'}>
      <a href={`#/article/${post.slug}`} onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'article', slug:post.slug});}}
        style={{textDecoration:'none', color:'inherit'}}>
        <Photo p={p} hue={post.cover.hue} label={post.cover.label} h={compact?200:240} radius={12}/>
      </a>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <CategoryChip slug={post.category} p={p} lang={lang} size="sm"/>
        <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.06em'}}>{post.readMins} min</span>
      </div>
      <a href={`#/article/${post.slug}`} onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'article', slug:post.slug});}}
         style={{textDecoration:'none', color:p.ink}}>
        <h3 style={{
          fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:22, lineHeight:1.15, letterSpacing:'-0.015em', color:p.ink, textWrap:'pretty',
        }}>
          {title}
        </h3>
      </a>
      {!compact && <p style={{fontFamily:'var(--fontBody)', fontSize:14, lineHeight:1.55, color:p.inkSoft}}>
        {excerpt?.slice(0,110)}…
      </p>}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4}}>
        <AuthorChip slug={post.author} p={p} lang={lang} size="sm" date={post.date}/>
        <button onClick={(e)=>{e.preventDefault(); e.stopPropagation(); onSave(post.slug);}}
          style={{appearance:'none', border:'none', background:'transparent', cursor:'pointer', color:saved?p.stamp:p.inkFaint, padding:4}}>
          <BookmarkIcon color={saved?p.stamp:p.inkFaint} filled={saved}/>
        </button>
      </div>
    </article>
  );
}

// ------- Author grid -------
export function AuthorGrid({p, lang}) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:18}}>
      {AUTHORS.map(a=>(
        <a key={a.slug} href={`#/author/${a.slug}`} onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'author', slug:a.slug});}}
          style={{
            display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:10,
            padding:22, background:p.surface, border:`1px solid ${p.line}`, borderRadius:16,
            textDecoration:'none', color:p.ink, transition:'transform .25s',
          }}
          onMouseEnter={(e)=>e.currentTarget.style.transform='translateY(-3px)'}
          onMouseLeave={(e)=>e.currentTarget.style.transform='translateY(0)'}>
          <div style={{
            width:64, height:64, borderRadius:'50%',
            background:`linear-gradient(135deg, ${tintBg(a.tint, p)}, color-mix(in oklab, ${tintBg(a.tint, p)} 50%, ${p.surface2}))`,
            color: p.ink, display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:24,
            border:`1px solid ${p.line}`,
          }}>{a.initials}</div>
          <div>
            <div style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:16, color:p.ink, lineHeight:1.2, marginBottom:2}}>
              {lang==='jp'?a.jp:a.en}
            </div>
            <div style={{fontFamily:'var(--fontBody)', fontSize:11, color:p.inkFaint, letterSpacing:'0.08em', textTransform:'uppercase'}}>
              {a.role} · {a.city}
            </div>
          </div>
          <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkSoft, marginTop:2}}>
            {String(a.posts).padStart(2,'0')} {lang==='jp'?'記事':'pieces'}
          </div>
        </a>
      ))}
    </div>
  );
}

// ------- Footer -------
export function Footer({p, lang}) {
  return (
    <footer style={{
      borderTop:`1px solid ${p.line}`, background:p.surface, marginTop:80,
    }}>
      <div style={{maxWidth:1320, margin:'0 auto', padding:'48px 32px 36px',
        display:'grid', gridTemplateColumns:'1.4fr 1fr 1fr 1fr', gap:48,
      }}>
        <div>
          <Logo p={p} jp={true} size={32}/>
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
            {label:'Submit', route:{name:'about'}},
            {label:'Style guide', route:{name:'about'}},
            {label:'Contact', route:{name:'about'}},
          ]} lang={lang} />
        <div>
          <div style={{fontFamily:'var(--fontBody)', fontSize:11, color:p.inkFaint, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:14}}>
            {lang==='jp'?'おたより':'Newsletter'}
          </div>
          <NewsletterMini p={p} lang={lang}/>
        </div>
      </div>
      <div style={{borderTop:`1px solid ${p.line}`, padding:'18px 32px', display:'flex', justifyContent:'space-between',
        fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.06em',
      }}>
        <span>© 2026 nihon101 — {lang==='jp'?'丁寧に作りました':'made with care in Tokyo'}</span>
        <span>vol. 02 · issue 14</span>
      </div>
    </footer>
  );
}
export function FooterCol({p, title, items, lang}) {
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
export function NewsletterMini({p, lang}) {
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
