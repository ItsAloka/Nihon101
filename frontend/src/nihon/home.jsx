// home.jsx — landing page
import React from "react";
import "./ui.jsx";
const { WavyBG, CategoryChip, AuthorChip, Photo, Hanko, WaveMark, gradStyle, ArrowRight, BookmarkIcon, HeartIcon, CommentIcon, tintBg } = (typeof window !== 'undefined' ? window : {});

function HomePage({ p, lang, posts, t, savedSet, likedMap, onLike, onSave }) {
  const D = window.NIHON_DATA;
  const featured = posts.filter(x=>x.featured);
  const hero = featured[0];
  const sub  = featured[1];
  const recent = posts.filter(x=>x!==hero && x!==sub).slice(0, 8);
  const editorPicks = posts.filter(x=>['untranslatable-komorebi','wabi-sabi-beyond-aesthetic','ghibli-taught-me-about-light'].includes(x.slug));
  const dense = t.density;
  const gap = dense==='cozy' ? 24 : dense==='airy' ? 44 : 32;

  return (
    <div>
      <IssueRibbon p={p} lang={lang}/>
      {t.heroLayout === 'stack' ? <HeroStack p={p} lang={lang} post={hero} t={t} onSave={onSave} saved={savedSet.has(hero.slug)}/>
       : t.heroLayout === 'magazine' ? <HeroMagazine p={p} lang={lang} post={hero} t={t} onSave={onSave} saved={savedSet.has(hero.slug)}/>
       : <HeroSplit p={p} lang={lang} post={hero} t={t} onSave={onSave} saved={savedSet.has(hero.slug)}/> }

      <div style={maxWrap()}>
        {/* Secondary featured + categories rail */}
        <section className="spa-split" style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:48, marginTop:64, alignItems:'start'}}>
          <SecondaryFeature p={p} lang={lang} post={sub} t={t}/>
          <CategoryRail p={p} lang={lang} categories={D.CATEGORIES}/>
        </section>

        {/* Editor's picks — numbered list */}
        <SectionHeader p={p} lang={lang}
          en="The editor’s reading list" jp="編集者の読みもの"
          kicker_en="picked this week" kicker_jp="今週のえらびもの"
        />
        <EditorList p={p} lang={lang} posts={editorPicks} t={t}/>

        {/* Recent — grid of cards */}
        <SectionHeader p={p} lang={lang}
          en="Recently published" jp="あたらしい記事"
          kicker_en="all writers · all topics" kicker_jp="すべての書き手から"
          right={
            <a href="#/search" onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'search'});}}
               style={{textDecoration:'none', color:p.ink, fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6}}>
              {lang==='jp'?'すべて見る':'See all'} <ArrowRight color={p.ink}/>
            </a>
          }
        />
        <div className="spa-g3" style={{
          display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap,
        }}>
          {recent.map(post=>(
            <ArticleCard key={post.slug} p={p} lang={lang} post={post} t={t}
              saved={savedSet.has(post.slug)} onSave={onSave}/>
          ))}
        </div>

        {/* Author spotlight */}
        <SectionHeader p={p} lang={lang} en="Writers in residence" jp="書く人たち" kicker_en="meet the people" kicker_jp="ここに書いている人"/>
        <AuthorGrid p={p} lang={lang}/>

        {/* Newsletter section */}
        <NewsletterBlock p={p} lang={lang}/>
      </div>
    </div>
  );
}

function maxWrap() { return {maxWidth:1320, margin:'0 auto', padding:'0 32px'}; }

// ------- Issue ribbon -------
function IssueRibbon({p, lang}) {
  const d = new Date();
  const months_jp = ['睦月','如月','弥生','卯月','皐月','水無月','文月','葉月','長月','神無月','霜月','師走'];
  const months_en = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const wd_jp = ['日','月','火','水','木','金','土'];
  const wd_en = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const kanji = ['〇','一','二','三','四','五','六','七','八','九'];
  const toKanji = (n) => String(n).split('').map(c => kanji[+c]).join('');
  const masthead = lang==='jp'
    ? `${toKanji(d.getFullYear())}年 ${months_jp[d.getMonth()]} ${toKanji(d.getDate())}日 ${wd_jp[d.getDay()]}曜日`
    : `${wd_en[d.getDay()]}, ${d.getDate()} ${months_en[d.getMonth()]} ${d.getFullYear()}`;
  // Live weather (Open-Meteo via /weather, KV-cached) — one city, rotating.
  const [cities, setCities] = React.useState([]);
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    fetch('/weather').then(r => r.ok ? r.json() : {cities:[]})
      .then(j => { if (alive) setCities(j.cities || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  React.useEffect(() => {
    if (cities.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % cities.length), 6000);
    return () => clearInterval(t);
  }, [cities]);
  const wx = cities[idx];
  const right = wx
    ? `${wx.glyph} ${lang==='jp'?wx.ja:wx.en} ${wx.temp}° · ${lang==='jp'?wx.condJa:wx.condEn}`
    : (lang==='jp' ? '今週も、ゆっくり読もう' : 'read slowly this week');
  return (
    <div style={{
      borderBottom:`1px solid ${p.line}`, background:p.surface,
    }}>
      <div style={{...maxWrap(), padding:'10px 32px', display:'flex', justifyContent:'space-between',
        fontFamily:'var(--fontMono)', fontSize:11, color:p.inkSoft, letterSpacing:'0.1em', textTransform:'uppercase',
      }}>
        <span>{masthead}</span>
        <span style={{display:'inline-flex', alignItems:'center', gap:10, textTransform:'none'}}>
          <span style={{width:6, height:6, borderRadius:3, background:p.stamp, display:'inline-block'}}></span>
          {right}
        </span>
      </div>
    </div>
  );
}

// ------- Hero: Split layout (default) -------
function HeroSplit({p, lang, post, t, saved, onSave}) {
  const title = lang==='jp'?post.title_jp:post.title_en;
  const excerpt = lang==='jp'?post.excerpt_jp:post.excerpt_en;
  return (
    <section style={{...maxWrap(), paddingTop:48, paddingBottom:16, position:'relative'}}>
      <WavyBG p={p}/>
      <div className="spa-split" style={{display:'grid', gridTemplateColumns:'1.05fr 1fr', gap:56, alignItems:'center', position:'relative'}}>
        <div>
          <div style={{display:'flex', alignItems:'center', gap:14, marginBottom:24}}>
            <CategoryChip slug={post.category} p={p} lang={lang}/>
            <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.1em', textTransform:'uppercase'}}>
              {lang==='jp'?'特集':'cover story'} · {post.readMins} min
            </span>
          </div>
          <h1 style={{
            fontFamily:'var(--fontDisplay)', fontWeight:600,
            fontSize: 'clamp(48px, 5.5vw, 88px)',
            lineHeight: 1.02, letterSpacing:'-0.025em', color:p.ink,
            marginBottom: 24, textWrap:'pretty',
          }}>
            <span style={{
              backgroundImage:`linear-gradient(transparent 70%, ${p.accent} 70%, ${p.accent} 92%, transparent 92%)`,
              backgroundRepeat:'no-repeat',
              paddingRight:'0.1em',
            }}>{title.split(' ').slice(0,2).join(' ')}</span>
            {' ' + title.split(' ').slice(2).join(' ')}
          </h1>
          <p style={{
            fontFamily:'var(--fontBody)', fontSize:18, lineHeight:1.55, color:p.inkSoft,
            marginBottom:32, maxWidth:560,
          }}>
            {excerpt}
          </p>
          <div style={{display:'flex', alignItems:'center', gap:24, flexWrap:'wrap'}}>
            <AuthorChip slug={post.author} p={p} lang={lang} date={post.date} size="lg"/>
            <button onClick={()=>window.__nihon_go({name:'article', slug:post.slug})}
              style={gradStyle(p)}
              onMouseEnter={(e)=>{e.currentTarget.style.transform='translateY(-1px)'}}
              onMouseLeave={(e)=>{e.currentTarget.style.transform='translateY(0)'}}>
              {lang==='jp'?'読む':'Read the story'} <ArrowRight color={'#fff'}/>
            </button>
            <button onClick={()=>onSave(post.slug)} title="Save"
              style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, width:46, height:46, borderRadius:999, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center'}}>
              <BookmarkIcon color={p.ink} filled={saved}/>
            </button>
          </div>
        </div>
        <div style={{position:'relative'}}>
          <Photo p={p} hue={post.cover.hue} label={post.cover.label} h={560} radius={22} accent={'文化'}/>
          {/* Vertical tategaki label */}
          <div style={{
            position:'absolute', left:-32, top:48,
            writingMode:'vertical-rl', textOrientation:'mixed',
            fontFamily:'var(--fontDisplay)', fontSize:13, letterSpacing:'0.4em',
            color:p.inkFaint,
          }}>
            日本の物語 · stories from japan
          </div>
        </div>
      </div>
    </section>
  );
}

// ------- Hero: Stack -------
function HeroStack({p, lang, post, t, saved, onSave}) {
  const title = lang==='jp'?post.title_jp:post.title_en;
  const excerpt = lang==='jp'?post.excerpt_jp:post.excerpt_en;
  return (
    <section style={{...maxWrap(), paddingTop:32, paddingBottom:16}}>
      <Photo p={p} hue={post.cover.hue} label={post.cover.label} h={460} radius={20} accent={'文化'}/>
      <div className="spa-split" style={{marginTop:28, display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:48, alignItems:'end'}}>
        <div>
          <div style={{display:'flex', gap:14, marginBottom:18}}>
            <CategoryChip slug={post.category} p={p} lang={lang}/>
            <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.1em', textTransform:'uppercase'}}>
              cover story · {post.readMins} min
            </span>
          </div>
          <h1 style={{
            fontFamily:'var(--fontDisplay)', fontWeight:600,
            fontSize: 'clamp(40px, 4.5vw, 72px)', lineHeight:1.02, letterSpacing:'-0.025em',
            color:p.ink, marginBottom:18, textWrap:'pretty',
          }}>{title}</h1>
        </div>
        <div>
          <p style={{fontFamily:'var(--fontBody)', fontSize:17, lineHeight:1.55, color:p.inkSoft, marginBottom:20}}>{excerpt}</p>
          <div style={{display:'flex', gap:14, alignItems:'center'}}>
            <AuthorChip slug={post.author} p={p} lang={lang} date={post.date}/>
            <button onClick={()=>window.__nihon_go({name:'article', slug:post.slug})} style={{...gradStyle(p), padding:'12px 20px', fontSize:13}}>
              {lang==='jp'?'読む':'Read'} <ArrowRight color={'#fff'}/>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------- Hero: Magazine (overlapping cards) -------
function HeroMagazine({p, lang, post, t, saved, onSave}) {
  const title = lang==='jp'?post.title_jp:post.title_en;
  const excerpt = lang==='jp'?post.excerpt_jp:post.excerpt_en;
  return (
    <section style={{...maxWrap(), paddingTop:48, paddingBottom:16, position:'relative'}}>
      <div style={{position:'relative', minHeight:560}}>
        <Photo p={p} hue={post.cover.hue} label={post.cover.label} h={560} radius={22} accent={'特集'}/>
        <div style={{
          position:'absolute', left:32, bottom:40, maxWidth:640,
          background:p.surface, padding:32, borderRadius:18,
          border:`1px solid ${p.line}`,
          boxShadow:`0 30px 60px -30px color-mix(in oklab, ${p.ink} 30%, transparent)`,
        }}>
          <div style={{display:'flex', alignItems:'center', gap:14, marginBottom:14}}>
            <CategoryChip slug={post.category} p={p} lang={lang}/>
            <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.1em', textTransform:'uppercase'}}>
              {post.readMins} min read
            </span>
          </div>
          <h1 style={{
            fontFamily:'var(--fontDisplay)', fontWeight:600,
            fontSize:'clamp(34px, 3.8vw, 56px)', lineHeight:1.05, letterSpacing:'-0.02em',
            color:p.ink, marginBottom:14, textWrap:'pretty',
          }}>{title}</h1>
          <p style={{fontFamily:'var(--fontBody)', fontSize:15, lineHeight:1.55, color:p.inkSoft, marginBottom:18}}>{excerpt}</p>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:18}}>
            <AuthorChip slug={post.author} p={p} lang={lang} date={post.date}/>
            <button onClick={()=>window.__nihon_go({name:'article', slug:post.slug})} style={{...gradStyle(p), padding:'11px 18px', fontSize:13}}>
              {lang==='jp'?'読む':'Read'} <ArrowRight color={'#fff'}/>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------- Section header -------
function SectionHeader({p, lang, en, jp, kicker_en, kicker_jp, right}) {
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

// ------- Secondary feature -------
function SecondaryFeature({p, lang, post, t}) {
  const title = lang==='jp'?post.title_jp:post.title_en;
  const excerpt = lang==='jp'?post.excerpt_jp:post.excerpt_en;
  return (
    <div onClick={()=>window.__nihon_go({name:'article', slug:post.slug})} className="spa-g2"
      style={{
       display:'grid', gridTemplateColumns:'1fr 1fr', gap:28,
       background: p.surface,
       border: `1.5px solid ${p.line}`,
       padding: 24,
       borderRadius:22, textDecoration:'none', color:p.ink,
       alignItems:'stretch', cursor:'pointer',
       transition:'transform .25s, border-color .25s, box-shadow .25s',
     }}
     onMouseEnter={(e)=>{ e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.borderColor=`color-mix(in oklab, ${p.accent} 55%, ${p.line})`; e.currentTarget.style.boxShadow=`0 18px 30px -22px color-mix(in oklab, ${p.accentDeep} 45%, transparent)`; }}
     onMouseLeave={(e)=>{ e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.borderColor=p.line; e.currentTarget.style.boxShadow='none'; }}
    >
      <Photo p={p} hue={post.cover.hue} label={post.cover.label} h={340} radius={14}/>
      <div style={{display:'flex', flexDirection:'column', justifyContent:'center', gap:14}}>
        <div style={{display:'flex', alignItems:'center', gap:10}} onClick={(e)=>e.stopPropagation()}>
          <CategoryChip slug={post.category} p={p} lang={lang} size="sm"/>
          <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.08em', textTransform:'uppercase'}}>also featured</span>
        </div>
        <h3 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:32, lineHeight:1.1, letterSpacing:'-0.02em', color:p.ink, textWrap:'pretty'}}>
          {title}
        </h3>
        <p style={{fontFamily:'var(--fontBody)', fontSize:15, lineHeight:1.55, color:p.inkSoft}}>{excerpt}</p>
        <div style={{marginTop:6}} onClick={(e)=>e.stopPropagation()}><AuthorChip slug={post.author} p={p} lang={lang} date={post.date}/></div>
      </div>
    </div>
  );
}

// ------- Category rail -------
function CategoryRail({p, lang, categories}) {
  return (
    <aside style={{
      padding:24, background:p.surface, border:`1px solid ${p.line}`, borderRadius:18,
    }}>
      <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:18, display:'flex', alignItems:'center', gap:8}}>
        <WaveMark color={p.stamp}/>
        {lang==='jp'?'カテゴリー':'Topics'}
      </div>
      <ul style={{listStyle:'none', display:'flex', flexDirection:'column', gap:2, marginBottom:18}}>
        {categories.map(c=>(
          <li key={c.slug}>
            <a href={`#/category/${c.slug}`} onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'category', slug:c.slug});}}
              style={{
                display:'flex', alignItems:'baseline', justifyContent:'space-between', padding:'10px 4px',
                textDecoration:'none', color:p.ink, borderBottom:`1px solid ${p.line}`,
                fontFamily:'var(--fontDisplay)', fontSize:20, fontWeight:600, letterSpacing:'-0.01em',
              }}>
              <span style={{display:'inline-flex', alignItems:'baseline', gap:10}}>
                <span style={{color:p.stamp, fontSize:18}}>{c.kanji}</span>
                <span>{lang==='jp'?c.jp:c.en}</span>
              </span>
              <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.06em'}}>
                {String(window.NIHON_DATA.POSTS.filter(po=>po.category===c.slug).length).padStart(2,'0')}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <div style={{
        padding:16, background:p.tint, borderRadius:12, display:'flex', alignItems:'center', gap:12,
      }}>
        <Hanko p={p} text={'新'} size={42} top={0} right={0} rotate={-8}/>
        <div style={{flex:1, marginLeft:50}}>
          <div style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:15, color:p.ink, marginBottom:2}}>
            {lang==='jp'?'カテゴリーを作る':'Make a topic'}
          </div>
          <div style={{fontFamily:'var(--fontBody)', fontSize:12, color:p.inkSoft, lineHeight:1.4}}>
            {lang==='jp'?'あなたの主題で書き始める。':'Start writing under a topic of your own.'}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ------- Editor's list (numbered, magazine-style) -------
function EditorList({p, lang, posts, t}) {
  return (
    <ol className="spa-g3" style={{
      listStyle:'none', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:32,
    }}>
      {posts.map((post, i)=>(
        <li key={post.slug}>
          <div onClick={()=>window.__nihon_go({name:'article', slug:post.slug})}
            style={{
              display:'flex', gap:16, color:p.ink, alignItems:'flex-start', cursor:'pointer',
              padding:22, background:p.surface,
              border:`1.5px solid ${p.line}`, borderRadius:22,
              transition:'transform .22s ease, border-color .22s ease, box-shadow .22s ease',
            }}
            onMouseEnter={(e)=>{ e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.borderColor=`color-mix(in oklab, ${p.accent} 55%, ${p.line})`; e.currentTarget.style.boxShadow=`0 18px 30px -22px color-mix(in oklab, ${p.accentDeep} 45%, transparent)`; }}
            onMouseLeave={(e)=>{ e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.borderColor=p.line; e.currentTarget.style.boxShadow='none'; }}>
            <div style={{
              fontFamily:'var(--fontDisplay)', fontSize:48, fontWeight:600, color:p.stamp,
              lineHeight:0.9, minWidth:54, letterSpacing:'-0.04em',
            }}>
              {String(i+1).padStart(2,'0')}
            </div>
            <div style={{flex:1}}>
              <div style={{fontFamily:'var(--fontMono)', fontSize:10, color:p.inkFaint, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6}}>
                {window.NIHON_DATA.CATEGORIES.find(c=>c.slug===post.category)[lang==='jp'?'jp':'en']} · {post.readMins} min
              </div>
              <h3 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:22, lineHeight:1.15, letterSpacing:'-0.015em', color:p.ink, marginBottom:8, textWrap:'pretty'}}>
                {lang==='jp'?post.title_jp:post.title_en}
              </h3>
              <p style={{fontFamily:'var(--fontBody)', fontSize:14, lineHeight:1.55, color:p.inkSoft, marginBottom:10}}>
                {(lang==='jp'?post.excerpt_jp:post.excerpt_en)?.slice(0,120)}…
              </p>
              <AuthorChip slug={post.author} p={p} lang={lang} size="sm"/>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ------- Article card (used in grids) -------
function ArticleCard({p, lang, post, t, saved, onSave, compact=false}) {
  const title = lang==='jp'?post.title_jp:post.title_en;
  const excerpt = lang==='jp'?post.excerpt_jp:post.excerpt_en;
  const card = t.cardStyle;
  return (
    <article style={{
      background: p.surface,
      border: `1.5px solid ${p.line}`,
      padding: 14,
      borderRadius: 22,
      display:'flex', flexDirection:'column', gap:12,
      position:'relative',
      transition:'transform .25s ease, border-color .25s ease, box-shadow .25s ease',
    }}
    onMouseEnter={(e)=>{ e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.borderColor=`color-mix(in oklab, ${p.accent} 55%, ${p.line})`; e.currentTarget.style.boxShadow=`0 18px 30px -22px color-mix(in oklab, ${p.accentDeep} 45%, transparent)`; }}
    onMouseLeave={(e)=>{ e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.borderColor=p.line; e.currentTarget.style.boxShadow='none'; }}>
      <a href={`/${lang==='jp'?'ja':'en'}/p/${post.slug}`} onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'article', slug:post.slug});}}
        style={{textDecoration:'none', color:'inherit'}}>
        <Photo p={p} hue={post.cover.hue} label={post.cover.label} src={post.cover.src} h={compact?200:240} radius={12}/>
      </a>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <CategoryChip slug={post.category} p={p} lang={lang} size="sm"/>
        <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.06em'}}>{post.readMins} min</span>
      </div>
      <a href={`/${lang==='jp'?'ja':'en'}/p/${post.slug}`} onClick={(e)=>{e.preventDefault(); window.__nihon_go({name:'article', slug:post.slug});}}
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
      {!compact && Array.isArray(post.tags) && post.tags.filter(Boolean).length>0 && (
        <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
          {post.tags.filter(Boolean).slice(0,3).map(tg=>(
            <a key={tg} href={`/${lang==='jp'?'ja':'en'}/t/${window.tagSlug ? window.tagSlug(tg) : tg}`}
               onClick={(e)=>e.stopPropagation()}
               style={{display:'inline-flex', alignItems:'center', gap:1, padding:'3px 9px', borderRadius:999, border:`1px solid ${p.line}`, background:p.surface, fontSize:11, fontWeight:500, color:p.inkSoft, textDecoration:'none'}}>
              <span style={{color:p.accent, fontWeight:800}}>#</span>{tg}
            </a>
          ))}
        </div>
      )}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginTop:'auto', paddingTop:12, borderTop:`1px solid ${p.line}`}}>
        <AuthorChip name={post.author} nameJp={post.author_jp} handle={post.authorHandle} avatarUrl={post.authorAvatarUrl} p={p} lang={lang} size="sm" date={post.date}/>
        <div style={{display:'flex', alignItems:'center', gap:14, flexShrink:0}}>
          <span style={{display:'inline-flex', alignItems:'center', gap:5, fontFamily:'var(--fontMono)', fontSize:12.5, fontWeight:600, color:p.inkSoft}}>
            <HeartIcon color={p.stamp} filled size={15}/> {(post.likes||0).toLocaleString()}
          </span>
          <span style={{display:'inline-flex', alignItems:'center', gap:5, fontFamily:'var(--fontMono)', fontSize:12.5, fontWeight:600, color:p.inkSoft}}>
            <CommentIcon color={p.inkFaint} size={15}/> {(post.commentCount ?? post.comments ?? 0).toLocaleString()}
          </span>
        </div>
      </div>
    </article>
  );
}

// ------- Author grid -------
function AuthorGrid({p, lang}) {
  return (
    <div className="spa-g5" style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:18}}>
      {window.NIHON_DATA.AUTHORS.map(a=>(
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

// ------- Newsletter block -------
function NewsletterBlock({p, lang}) {
  const [v, setV] = React.useState('');
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (busy || done || !v.includes('@')) return;
    setBusy(true);
    try { await window.N101_CONTENT.newsletterApi.subscribe(v.trim(), lang==='jp'?'ja':'en'); setDone(true); }
    catch { setDone(true); /* dedupe/already-subscribed still reads as success to the user */ }
    finally { setBusy(false); }
  };
  return (
    <section style={{
      marginTop:96, padding:'56px 56px', borderRadius:24,
      background:`linear-gradient(135deg, ${p.tint}, color-mix(in oklab, ${p.tint} 60%, ${p.surface}))`,
      border:`1px solid ${p.line}`, position:'relative', overflow:'hidden',
    }}>
      <Hanko p={p} text="便" size={88} top={26} right={32} rotate={-8}/>
      <div style={{maxWidth:600, position:'relative', zIndex:1}}>
        <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkSoft, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:14}}>
          {lang==='jp'?'毎週、おたより':'a slow weekly letter'}
        </div>
        <h2 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(32px,3.4vw,48px)', lineHeight:1.05, letterSpacing:'-0.02em', color:p.ink, marginBottom:14}}>
          {lang==='jp'?'日曜の朝に、一通だけ。':'One letter, every Sunday morning.'}
        </h2>
        <p style={{fontFamily:'var(--fontBody)', fontSize:16, lineHeight:1.6, color:p.inkSoft, marginBottom:24}}>
          {lang==='jp'?'急がず、押し付けず。今週の三つの記事と、ひとつの小さな日本語の言葉を、お届けします。':'No urgency, no push. Three pieces from the week, and one small Japanese word we’ve been thinking about.'}
        </p>
        {done ? (
          <div style={{padding:'14px 18px', borderRadius:14, background:p.surface, border:`1px solid ${p.line}`, maxWidth:520,
            fontFamily:'var(--fontBody)', fontSize:15, color:p.ink, lineHeight:1.5}}>
            {lang==='jp'?'リストに登録しました。日曜のおたよりは準備中です。':"You're on the list — the Sunday letter is coming soon."}
          </div>
        ) : (
          <form onSubmit={submit} style={{display:'flex', gap:10, maxWidth:520}}>
            <input type="email" value={v} onChange={(e)=>setV(e.target.value)} placeholder={lang==='jp'?'メールアドレス':'you@somewhere.jp'}
              style={{flex:1, padding:'14px 18px', borderRadius:999, border:`1px solid ${p.line}`,
                background:p.surface, fontFamily:'var(--fontBody)', fontSize:15, color:p.ink, outline:'none'}}/>
            <button disabled={busy} style={gradStyle(p)}>{busy ? '…' : (lang==='jp'?'登録する':'Subscribe')}</button>
          </form>
        )}
        <div style={{marginTop:14, fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.06em'}}>
          {lang==='jp'?'近日公開・スパムは送りません。':'Coming soon · no spam, ever.'}
        </div>
      </div>
    </section>
  );
}

// Placeholder card shown while a feed is loading — matches ArticleCard's frame.
function CardSkeleton({p, compact=false}) {
  return (
    <div style={{ background:p.surface, border:`1.5px solid ${p.line}`, padding:14, borderRadius:22, display:'flex', flexDirection:'column', gap:12 }}>
      <div className="skel" style={{ width:'100%', height:compact?200:240, borderRadius:12 }}/>
      <div style={{display:'flex', gap:10}}>
        <div className="skel" style={{ width:64, height:18, borderRadius:999 }}/>
        <div className="skel" style={{ width:40, height:18 }}/>
      </div>
      <div className="skel" style={{ width:'90%', height:22 }}/>
      <div className="skel" style={{ width:'70%', height:22 }}/>
      {!compact && <><div className="skel" style={{ width:'100%', height:13 }}/><div className="skel" style={{ width:'85%', height:13 }}/></>}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'auto', paddingTop:12, borderTop:`1px solid ${p.line}`}}>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <div className="skel" style={{ width:24, height:24, borderRadius:'50%' }}/>
          <div className="skel" style={{ width:80, height:12 }}/>
        </div>
        <div className="skel" style={{ width:50, height:12 }}/>
      </div>
    </div>
  );
}

if (typeof window !== 'undefined') Object.assign(window, {
  HomePage, ArticleCard, CardSkeleton, SectionHeader, AuthorGrid, NewsletterBlock, maxWrap,
});
