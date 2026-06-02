// @ts-nocheck
// screens.tsx — Article, Category, Search, Author, About, Saved screens
import React from 'react';
import { CATEGORIES, AUTHORS, POSTS } from './data';
import { tintBg } from './theme';
import {
  maxWrap, Photo, Hanko, CategoryChip, AuthorChip, WaveMark,
  SearchIcon, ArrowLeft, ArrowRight, ShareIcon, BookmarkIcon, ClapIcon,
  SectionHeader, ArticleCard, AuthorGrid,
} from './ui';

// ====== ARTICLE ======
export function ArticlePage({ p, lang, post, t, savedSet, claps, onClap, onSave }) {
  const [progress, setProgress] = React.useState(0);
  const containerRef = React.useRef(null);
  React.useEffect(()=>{
    const onScroll = ()=>{
      const el = containerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const h = el.scrollHeight - window.innerHeight;
      const scrolled = Math.max(0, -top);
      setProgress(Math.min(100, (scrolled / Math.max(1, h)) * 100));
    };
    window.addEventListener('scroll', onScroll);
    onScroll();
    return ()=>window.removeEventListener('scroll', onScroll);
  }, [post.slug]);

  const title = lang==='jp'?post.title_jp:post.title_en;
  const kicker = lang==='jp'?post.kicker_jp:post.kicker_en;
  const body = post.body_en && post.body_en.length ? post.body_en : [
    post.excerpt_en,
    'This essay is a draft — the writer is still in the kissaten. A longer version will appear in the next issue, once the second coffee has been ordered.',
    'For now, here is the photograph. Look at it for a moment. There is no rush.',
    'When the writer returns, you will be the first to know.',
  ];
  const clapped = claps[post.slug] || 0;
  const saved = savedSet.has(post.slug);
  const cat = CATEGORIES.find(c=>c.slug===post.category);
  const related = POSTS.filter(x=>x.category===post.category && x.slug!==post.slug).slice(0,3);

  return (
    <div ref={containerRef}>
      {/* Progress bar */}
      <div style={{
        position:'sticky', top:0, height:3, background:p.line, zIndex:25,
      }}>
        <div style={{height:'100%', width:`${progress}%`, background:p.stamp, transition:'width 80ms linear'}}></div>
      </div>

      {/* Article header */}
      <div style={{...maxWrap(), paddingTop:48}}>
        <button onClick={()=>window.history.length>1?window.__nihon_back():window.__nihon_go({name:'home'})}
          style={{appearance:'none', border:'none', background:'transparent', color:p.inkSoft, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, display:'inline-flex', alignItems:'center', gap:6, marginBottom:24}}>
          <ArrowLeft color={p.inkSoft}/> {lang==='jp'?'戻る':'Back'}
        </button>

        <div style={{maxWidth:780, margin:'0 auto'}}>
          <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:18}}>
            <CategoryChip slug={post.category} p={p} lang={lang}/>
            <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.1em', textTransform:'uppercase'}}>
              {kicker} · {post.readMins} min read
            </span>
          </div>
          <h1 style={{
            fontFamily:'var(--fontDisplay)', fontWeight:600,
            fontSize:'clamp(40px, 4.5vw, 64px)', lineHeight:1.05, letterSpacing:'-0.025em',
            color:p.ink, marginBottom:18, textWrap:'pretty',
          }}>{title}</h1>
          <p style={{fontFamily:'var(--fontDisplay)', fontWeight:400, fontStyle:'italic', fontSize:22, lineHeight:1.4, color:p.inkSoft, marginBottom:32, textWrap:'pretty'}}>
            {lang==='jp'?post.excerpt_jp:post.excerpt_en}
          </p>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:`1px solid ${p.line}`, borderBottom:`1px solid ${p.line}`, padding:'18px 0', marginBottom:48}}>
            <AuthorChip slug={post.author} p={p} lang={lang} date={post.date} size="lg"/>
            <div style={{display:'flex', gap:10}}>
              <button onClick={()=>onSave(post.slug)} style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, width:40, height:40, borderRadius:999, cursor:'pointer', color:saved?p.stamp:p.ink, display:'inline-flex', alignItems:'center', justifyContent:'center'}}>
                <BookmarkIcon filled={saved} color={saved?p.stamp:p.ink}/>
              </button>
              <button style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, padding:'0 14px', height:40, borderRadius:999, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--fontBody)', fontSize:13, color:p.ink}}>
                <ShareIcon color={p.ink}/> {lang==='jp'?'共有':'Share'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cover */}
      <div style={{...maxWrap(), marginBottom:48}}>
        <div style={{maxWidth:1080, margin:'0 auto'}}>
          <Photo p={p} hue={post.cover.hue} label={post.cover.label} h={520} radius={20} accent={cat?.kanji || '読'}/>
          <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.08em', textAlign:'center', marginTop:12}}>
            photograph by the {lang==='jp'?'編集部':'editors'} · {post.date}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{...maxWrap()}}>
        <div style={{maxWidth:680, margin:'0 auto'}}>
          {body.map((para, i)=>{
            return (
              <p key={i} style={{
                fontFamily:'var(--fontDisplay)', fontSize:20, lineHeight:1.65, color:p.ink,
                marginBottom:28, textWrap:'pretty',
              }}>
                {i===0 ? (
                  <>
                    <span style={{
                      float:'left', fontFamily:'var(--fontDisplay)', fontSize:96, lineHeight:0.8,
                      color:p.stamp, marginRight:14, marginTop:8, fontWeight:600,
                    }}>{para[0]}</span>
                    {para.slice(1)}
                  </>
                ) : para}
              </p>
            );
          })}
          {/* Pull quote */}
          <blockquote style={{
            borderLeft:`3px solid ${p.stamp}`, paddingLeft:28, margin:'40px 0',
            fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:26, lineHeight:1.4,
            color:p.ink, textWrap:'pretty',
          }}>
            “{lang==='jp'?'急がない場所が、いちばん都会的なのかもしれない。':'The least efficient room may be the most quietly radical one in the city.'}”
          </blockquote>
          <p style={{fontFamily:'var(--fontDisplay)', fontSize:20, lineHeight:1.65, color:p.ink, marginBottom:48, textWrap:'pretty'}}>
            {lang==='jp'?'もし、いつかこの店に行くことがあれば、長い時間そこに座って、何もしないでください。':'If you ever go, please sit a long time and do nothing.'}
          </p>

          {/* End-of-article actions */}
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'24px 0', borderTop:`1px solid ${p.line}`, borderBottom:`1px solid ${p.line}`, marginBottom:48, flexWrap:'wrap', gap:16}}>
            <button onClick={()=>onClap(post.slug)} style={{
              appearance:'none', border:`1px solid ${p.line}`, background:p.surface,
              padding:'12px 18px', borderRadius:999, cursor:'pointer',
              display:'inline-flex', alignItems:'center', gap:10,
              fontFamily:'var(--fontBody)', fontSize:14, fontWeight:600, color:p.ink,
            }}>
              <ClapIcon color={p.stamp} filled={clapped>0}/>
              <span>{(post.likes + clapped).toLocaleString()}</span>
              <span style={{color:p.inkFaint, fontSize:12, fontWeight:500}}>{lang==='jp'?'拍手':'claps'}</span>
              {clapped>0 && <span style={{color:p.stamp, fontWeight:700, fontSize:12}}>+{clapped}</span>}
            </button>
            <div style={{display:'flex', gap:10}}>
              <button onClick={()=>onSave(post.slug)} style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, padding:'10px 16px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, color:p.ink, display:'inline-flex', alignItems:'center', gap:8}}>
                <BookmarkIcon filled={saved} color={saved?p.stamp:p.ink}/> {saved ? (lang==='jp'?'保存済み':'Saved') : (lang==='jp'?'保存':'Save')}
              </button>
              <button style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, padding:'10px 16px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, color:p.ink, display:'inline-flex', alignItems:'center', gap:8}}>
                <ShareIcon color={p.ink}/> {lang==='jp'?'共有':'Share'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Author card */}
      <div style={{...maxWrap()}}>
        <div style={{maxWidth:780, margin:'0 auto'}}>
          <AuthorCard p={p} lang={lang} slug={post.author}/>
        </div>
      </div>

      {/* Related */}
      <div style={{...maxWrap()}}>
        <SectionHeader p={p} lang={lang}
          en={`More in ${cat?.en || ''}`} jp={`もっと ${cat?.jp || ''}`}
          kicker_en="related reading" kicker_jp="関連する記事"/>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:32}}>
          {related.map(po=>(<ArticleCard key={po.slug} p={p} lang={lang} post={po} t={t} saved={savedSet.has(po.slug)} onSave={onSave}/>))}
        </div>
      </div>
    </div>
  );
}

function AuthorCard({p, lang, slug}) {
  const a = AUTHORS.find(x=>x.slug===slug);
  if (!a) return null;
  const c = tintBg(a.tint, p);
  return (
    <div style={{
      display:'flex', gap:20, padding:24, background:p.surface, border:`1px solid ${p.line}`, borderRadius:18,
      alignItems:'center',
    }}>
      <div style={{
        width:80, height:80, borderRadius:'50%',
        background:`linear-gradient(135deg, ${c}, color-mix(in oklab, ${c} 50%, ${p.surface2}))`,
        color:p.ink, display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:30, flexShrink:0, border:`1px solid ${p.line}`,
      }}>{a.initials}</div>
      <div style={{flex:1}}>
        <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:4}}>
          {lang==='jp'?'書いた人':'written by'}
        </div>
        <div style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:22, color:p.ink}}>
          {lang==='jp'?a.jp:a.en}
        </div>
        <div style={{fontFamily:'var(--fontBody)', fontSize:14, color:p.inkSoft, marginTop:6, lineHeight:1.5}}>
          {lang==='jp'?a.bio_jp:a.bio_en}
        </div>
      </div>
      <button onClick={()=>window.__nihon_go({name:'author', slug:a.slug})} style={{appearance:'none', border:`1px solid ${p.ink}`, background:'transparent', color:p.ink, padding:'10px 18px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600}}>
        {lang==='jp'?'プロフィール':'Follow'}
      </button>
    </div>
  );
}

// ====== CATEGORY ======
export function CategoryPage({p, lang, slug, t, savedSet, onSave}) {
  const cat = CATEGORIES.find(c=>c.slug===slug);
  const posts = POSTS.filter(x=>x.category===slug);
  if (!cat) return <div style={{...maxWrap(), padding:'80px 32px'}}>Not found.</div>;
  const c = tintBg(cat.tint, p);
  return (
    <div>
      {/* Category banner */}
      <div style={{
        background:`linear-gradient(135deg, color-mix(in oklab, ${c} 50%, ${p.bg}), ${p.bg})`,
        borderBottom:`1px solid ${p.line}`, position:'relative', overflow:'hidden',
      }}>
        <div style={{...maxWrap(), padding:'72px 32px 56px', display:'grid', gridTemplateColumns:'1fr auto', alignItems:'end', gap:32}}>
          <div>
            <div style={{fontFamily:'var(--fontMono)', fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:p.inkSoft, marginBottom:14}}>
              {lang==='jp'?'カテゴリー':'Topic'} / {String(CATEGORIES.findIndex(x=>x.slug===slug)+1).padStart(2,'0')}
            </div>
            <h1 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(56px, 6.5vw, 104px)', lineHeight:1, letterSpacing:'-0.03em', color:p.ink}}>
              {lang==='jp'?cat.jp:cat.en}
              <span style={{color:p.stamp, fontSize:'0.4em', marginLeft:16, letterSpacing:'0.1em'}}>{lang==='jp'?cat.en:cat.jp}</span>
            </h1>
            <p style={{fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:20, color:p.inkSoft, marginTop:18, maxWidth:560}}>
              {categoryBlurb(cat, lang)}
            </p>
            <div style={{marginTop:24, display:'flex', gap:14, fontFamily:'var(--fontMono)', fontSize:11, color:p.inkSoft, letterSpacing:'0.06em'}}>
              <span>{String(posts.length).padStart(2,'0')} {lang==='jp'?'記事':'pieces'}</span>
              <span>·</span>
              <span>{new Set(posts.map(x=>x.author)).size} {lang==='jp'?'人の書き手':'writers'}</span>
            </div>
          </div>
          <Hanko p={p} text={cat.kanji} size={140} top={'auto'} right={48} rotate={-6}/>
        </div>
      </div>

      <div style={{...maxWrap(), paddingTop:48}}>
        {/* Filter strip */}
        <CategoryStrip p={p} lang={lang} active={slug}/>

        {posts.length===0 ? (
          <div style={{padding:'80px 0', textAlign:'center', color:p.inkSoft, fontFamily:'var(--fontDisplay)', fontSize:22}}>
            {lang==='jp'?'まだ記事がありません。最初の書き手になりませんか？':'No pieces yet. Want to be the first writer here?'}
          </div>
        ) : (
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:32, marginTop:32}}>
            {posts.map(post=>(<ArticleCard key={post.slug} p={p} lang={lang} post={post} t={t} saved={savedSet.has(post.slug)} onSave={onSave}/>))}
          </div>
        )}
      </div>
    </div>
  );
}

function categoryBlurb(cat, lang) {
  const map = {
    culture:    {en:'Small rooms, slow afternoons, and the long shape of an ordinary Japanese day.', jp:'小さな部屋と、ゆっくりした午後と、ふつうの日本の一日のかたち。'},
    food:       {en:'From kissaten to konbini — what people actually eat, and why.', jp:'喫茶店からコンビニまで。人々が実際に食べているもの、その理由。'},
    travel:     {en:'Slow trains, cold platforms, and the towns between the famous ones.', jp:'鈍行列車と寒いホーム、有名でない町のあいだ。'},
    language:   {en:'A column for words that English refuses to translate.', jp:'英語が訳すことを拒んだ言葉のコラム。'},
    animation:  {en:'Frames, light, and what animation knows that we forgot.', jp:'絵と光と、アニメが知っていて私たちが忘れたこと。'},
    philosophy: {en:'Ideas with chipped edges. Wabi-sabi, mottainai, ma — and what they ask of us.', jp:'欠けた縁のある思想。侘寂、もったいない、間、そしてそれらが私たちに問うこと。'},
    history:    {en:'The past, but only the parts that still matter on a Tuesday.', jp:'過去、ただし今も火曜日に意味のある部分だけ。'},
    fashion:    {en:'Clothes that are not costumes — what people in Japan actually wear.', jp:'衣装ではない服。日本の人々が本当に着ているもの。'},
    news:       {en:'What happened this week, written slowly enough to mean something.', jp:'今週の出来事を、意味を持つほどゆっくり書く。'},
  };
  const v = map[cat.slug] || {en:'', jp:''};
  return lang==='jp' ? v.jp : v.en;
}

function CategoryStrip({p, lang, active, onPick}) {
  const cats = CATEGORIES;
  return (
    <div style={{
      display:'flex', gap:8, overflowX:'auto', paddingBottom:8, borderBottom:`1px solid ${p.line}`, marginBottom:8,
    }}>
      <button onClick={()=>onPick ? onPick(null) : window.__nihon_go({name:'home'})} style={pillStyle(p, active===null && !active===undefined ? false : !active)}>
        {lang==='jp'?'すべて':'All'}
      </button>
      {cats.map(c=>(
        <button key={c.slug}
          onClick={()=>onPick ? onPick(c.slug) : window.__nihon_go({name:'category', slug:c.slug})}
          style={pillStyle(p, c.slug===active)}>
          <span style={{color:p.stamp, fontFamily:'var(--fontDisplay)'}}>{c.kanji}</span>
          <span>{lang==='jp'?c.jp:c.en}</span>
        </button>
      ))}
    </div>
  );
}
function pillStyle(p, active) {
  return {
    appearance:'none', whiteSpace:'nowrap', border:`1px solid ${active?p.ink:p.line}`,
    background: active?p.ink:p.surface, color: active?p.surface:p.ink,
    padding:'8px 14px', borderRadius:999, cursor:'pointer',
    fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600,
    display:'inline-flex', alignItems:'center', gap:6,
  };
}

// ====== SEARCH / EXPLORE ======
export function SearchPage({p, lang, initialQuery, t, savedSet, onSave}) {
  const [q, setQ] = React.useState(initialQuery || '');
  const [cat, setCat] = React.useState(null);
  const all = POSTS;
  const results = all.filter(po=>{
    if (cat && po.category !== cat) return false;
    if (!q) return true;
    const hay = [po.title_en, po.title_jp, po.excerpt_en, po.excerpt_jp, po.category, po.author].join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  return (
    <div>
      <div style={{...maxWrap(), paddingTop:48}}>
        <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:14, display:'flex', alignItems:'center', gap:8}}>
          <WaveMark color={p.stamp}/>
          {lang==='jp'?'探す':'Explore'}
        </div>
        <h1 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(40px, 5vw, 72px)', letterSpacing:'-0.025em', lineHeight:1.05, color:p.ink, marginBottom:8}}>
          {lang==='jp'?'すべての記事を、ゆっくり。':'Everything we’ve published, slowly.'}
        </h1>
        <p style={{fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:20, color:p.inkSoft, marginBottom:32}}>
          {lang==='jp'?'タイトル、書き手、カテゴリーで探せます。':'Search by title, writer, or topic. Or just scroll.'}
        </p>
        <div style={{
          display:'flex', alignItems:'center', gap:12, background:p.surface, border:`1px solid ${p.line}`,
          borderRadius:999, padding:'14px 22px', marginBottom:20,
        }}>
          <SearchIcon color={p.ink} size={18}/>
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder={lang==='jp'?'木漏れ日、喫茶店、雪国…':'kissaten, komorebi, snow…'}
            style={{flex:1, border:'none', outline:'none', background:'transparent', fontFamily:'var(--fontDisplay)', fontSize:22, color:p.ink}}/>
          {q && <button onClick={()=>setQ('')} style={{appearance:'none', border:'none', background:'transparent', cursor:'pointer', color:p.inkFaint, fontFamily:'var(--fontMono)', fontSize:12}}>clear</button>}
        </div>
        <CategoryStrip p={p} lang={lang} active={cat} onPick={setCat}/>
        <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.1em', textTransform:'uppercase', margin:'24px 0 16px'}}>
          {String(results.length).padStart(2,'0')} {lang==='jp'?'件の記事':'results'} {q && `· “${q}”`}
        </div>
        {results.length===0 ? (
          <div style={{padding:'80px 0', textAlign:'center'}}>
            <div style={{fontFamily:'var(--fontDisplay)', fontSize:48, color:p.stamp, marginBottom:8}}>無</div>
            <div style={{fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:22, color:p.inkSoft}}>
              {lang==='jp'?'何もみつかりません。違う言葉でどうぞ。':'Nothing here. Try another word.'}
            </div>
          </div>
        ) : (
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:32}}>
            {results.map(post=>(<ArticleCard key={post.slug} p={p} lang={lang} post={post} t={t} saved={savedSet.has(post.slug)} onSave={onSave}/>))}
          </div>
        )}
      </div>
    </div>
  );
}

// ====== AUTHOR PROFILE ======
export function AuthorPage({p, lang, slug, t, savedSet, onSave}) {
  const a = AUTHORS.find(x=>x.slug===slug);
  if (!a) return <div style={{...maxWrap(), padding:80}}>Not found.</div>;
  const c = tintBg(a.tint, p);
  const posts = POSTS.filter(po=>po.author===slug);
  const [following, setFollowing] = React.useState(false);
  return (
    <div>
      <div style={{
        background:`linear-gradient(135deg, color-mix(in oklab, ${c} 40%, ${p.bg}), ${p.bg})`,
        borderBottom:`1px solid ${p.line}`,
      }}>
        <div style={{...maxWrap(), padding:'72px 32px 56px', display:'grid', gridTemplateColumns:'auto 1fr auto', gap:32, alignItems:'center'}}>
          <div style={{
            width:160, height:160, borderRadius:'50%',
            background:`linear-gradient(135deg, ${c}, color-mix(in oklab, ${c} 50%, ${p.surface2}))`,
            color:p.ink, display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:60, border:`1px solid ${p.line}`,
            boxShadow:`0 30px 60px -30px color-mix(in oklab, ${p.ink} 30%, transparent)`,
          }}>{a.initials}</div>
          <div>
            <div style={{fontFamily:'var(--fontMono)', fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:p.inkSoft, marginBottom:12}}>
              {a.role} · {a.city}
            </div>
            <h1 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(40px, 5vw, 72px)', letterSpacing:'-0.025em', lineHeight:1, color:p.ink}}>
              {lang==='jp'?a.jp:a.en}
              <span style={{color:p.stamp, fontSize:'0.45em', marginLeft:14, letterSpacing:'0.05em'}}>
                {lang==='jp'?a.en:a.jp}
              </span>
            </h1>
            <p style={{fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:20, color:p.inkSoft, marginTop:14, maxWidth:600, lineHeight:1.5}}>
              {lang==='jp'?a.bio_jp:a.bio_en}
            </p>
            <div style={{marginTop:18, display:'flex', gap:18, fontFamily:'var(--fontMono)', fontSize:11, color:p.inkSoft, letterSpacing:'0.06em', textTransform:'uppercase'}}>
              <span>{String(a.posts).padStart(2,'0')} {lang==='jp'?'記事':'pieces'}</span>
              <span>·</span>
              <span>{(a.posts * 412).toLocaleString()} {lang==='jp'?'読者':'readers'}</span>
            </div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            <button onClick={()=>setFollowing(v=>!v)} style={{
              appearance:'none', background: following ? p.surface : p.ink, color: following ? p.ink : p.surface,
              padding:'12px 28px', borderRadius:999, cursor:'pointer',
              fontFamily:'var(--fontBody)', fontSize:14, fontWeight:600,
              border: following ? `1px solid ${p.ink}` : 'none',
            }}>
              {following ? (lang==='jp'?'フォロー中':'Following') : (lang==='jp'?'フォロー':'Follow')}
            </button>
            <button style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, padding:'10px 28px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, color:p.ink}}>
              {lang==='jp'?'メッセージ':'Message'}
            </button>
          </div>
        </div>
      </div>

      <div style={{...maxWrap()}}>
        <SectionHeader p={p} lang={lang}
          en={`Pieces by ${a.en}`}
          jp={`${a.jp}の記事`}
          kicker_en={`${posts.length} stories`}
          kicker_jp={`${posts.length}本の記事`}
        />
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:32}}>
          {posts.map(po=>(<ArticleCard key={po.slug} p={p} lang={lang} post={po} t={t} saved={savedSet.has(po.slug)} onSave={onSave}/>))}
        </div>
      </div>
    </div>
  );
}

// ====== AUTHORS INDEX ======
export function AuthorsPage({p, lang}) {
  return (
    <div>
      <div style={{...maxWrap(), paddingTop:48}}>
        <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:14}}>
          {lang==='jp'?'書く人たち':'Writers'}
        </div>
        <h1 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(40px, 5vw, 72px)', letterSpacing:'-0.025em', lineHeight:1.05, color:p.ink, marginBottom:16, textWrap:'pretty'}}>
          {lang==='jp'?'ここに書いている人たち。':'The people writing here.'}
        </h1>
        <p style={{fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:20, color:p.inkSoft, marginBottom:40, maxWidth:680}}>
          {lang==='jp'?'小さな編集部です。誰でも書けます。書きたい主題があれば、メッセージをください。':'A small editorial team. Anyone can write here — pitch us a topic and start a column.'}
        </p>
        <AuthorGrid p={p} lang={lang}/>
      </div>
    </div>
  );
}

// ====== ABOUT ======
export function AboutPage({p, lang}) {
  return (
    <div>
      <div style={{...maxWrap(), paddingTop:64, paddingBottom:32}}>
        <div style={{maxWidth:780, margin:'0 auto'}}>
          <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:14, display:'flex', alignItems:'center', gap:8}}>
            <WaveMark color={p.stamp}/>
            {lang==='jp'?'はじめに':'A short manifesto'}
          </div>
          <h1 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(40px, 5.5vw, 80px)', letterSpacing:'-0.025em', lineHeight:1.02, color:p.ink, marginBottom:24, textWrap:'pretty'}}>
            {lang==='jp'?'日本について、ゆっくり書く場所。':'A place to write about Japan, slowly.'}
          </h1>
          <p style={{fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:24, color:p.inkSoft, marginBottom:48, lineHeight:1.45}}>
            {lang==='jp'?'記事は短くてもいい。長くてもいい。役に立たなくてもいい。ただ、ほんとうのことを書いてください。':'A piece can be short. A piece can be long. A piece does not have to be useful. We only ask that it be true.'}
          </p>

          <Manifesto p={p} lang={lang} num="一" en="Anyone can write here." jp="誰でも書いていい。"
            body_en="If you have something honest to say about Japan — a kissaten you love, a word you cannot translate, a town nobody knows — there is a place for it on nihon101. Pitch us through the Submit page; we read everything."
            body_jp="日本について、正直に書きたいことがあれば、ここに場所があります。喫茶店、訳せない言葉、誰も知らない町。Submitページから送ってください。すべて読みます。"/>
          <Manifesto p={p} lang={lang} num="二" en="Both languages, equally." jp="二つの言葉、同じだけ。"
            body_en="Every piece runs in English and Japanese, side by side. The translation is not a translation. It is a second writing of the same thing."
            body_jp="すべての記事は日本語と英語で出ます。翻訳は翻訳ではありません。同じことを、もう一度書くことです。"/>
          <Manifesto p={p} lang={lang} num="三" en="No urgency." jp="急がない。"
            body_en="We publish when a piece is ready. We never publish to fill a slot. There is no schedule. There is no SEO."
            body_jp="記事は、できたときに出します。穴を埋めるためには出しません。締切はなく、SEOもありません。"/>
          <Manifesto p={p} lang={lang} num="四" en="The reader is doing us a favor." jp="読んでくれる人は、優しい人。"
            body_en="We do not chase clicks. We do not push notifications. We send one quiet letter every Sunday. That is the whole business model."
            body_jp="クリックは追いません。通知は送りません。日曜日に、静かな手紙を一通だけ送ります。それが全てです。"/>

          <div style={{
            marginTop:64, padding:36, background:p.tint, borderRadius:20, border:`1px solid ${p.line}`, position:'relative', overflow:'hidden',
          }}>
            <Hanko p={p} text="募" size={80} top={20} right={24} rotate={-8}/>
            <div style={{maxWidth:520}}>
              <h3 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:28, letterSpacing:'-0.02em', color:p.ink, marginBottom:8}}>
                {lang==='jp'?'書いてみませんか？':'Want to write here?'}
              </h3>
              <p style={{fontFamily:'var(--fontBody)', fontSize:15, lineHeight:1.6, color:p.inkSoft, marginBottom:20}}>
                {lang==='jp'?'カテゴリーがなければ、作ってください。題材があれば、教えてください。':'If a topic doesn’t exist yet, propose one. If you have a piece, send it. We pay for accepted essays.'}
              </p>
              <button style={{appearance:'none', border:'none', background:p.ink, color:p.surface, padding:'13px 22px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:14, fontWeight:600, display:'inline-flex', alignItems:'center', gap:8}}>
                {lang==='jp'?'寄稿について':'Pitch us a story'} <ArrowRight color={p.surface}/>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Manifesto({p, lang, num, en, jp, body_en, body_jp}) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'80px 1fr', gap:24, marginBottom:36, paddingBottom:36, borderBottom:`1px solid ${p.line}`}}>
      <div style={{fontFamily:'var(--fontDisplay)', fontSize:48, color:p.stamp, lineHeight:1, fontWeight:600}}>
        {num}
      </div>
      <div>
        <h3 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:28, lineHeight:1.15, letterSpacing:'-0.015em', color:p.ink, marginBottom:10, textWrap:'pretty'}}>
          {lang==='jp'?jp:en}
        </h3>
        <p style={{fontFamily:'var(--fontBody)', fontSize:16, lineHeight:1.65, color:p.inkSoft, textWrap:'pretty'}}>
          {lang==='jp'?body_jp:body_en}
        </p>
      </div>
    </div>
  );
}

// ====== SAVED ======
export function SavedPage({p, lang, savedSet, t, onSave}) {
  const posts = POSTS.filter(po=>savedSet.has(po.slug));
  return (
    <div style={{...maxWrap(), paddingTop:48}}>
      <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:14}}>
        {lang==='jp'?'保存した記事':'Saved'}
      </div>
      <h1 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(40px, 5vw, 72px)', letterSpacing:'-0.025em', color:p.ink, marginBottom:32, textWrap:'pretty'}}>
        {lang==='jp'?'あとで読む。':'For later.'}
      </h1>
      {posts.length===0 ? (
        <div style={{padding:'80px 0', textAlign:'center'}}>
          <Hanko p={p} text="空" size={72} top={'auto'} right={'auto'} rotate={0}/>
          <div style={{marginTop:24, fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:22, color:p.inkSoft}}>
            {lang==='jp'?'まだ何も保存していません。記事の「保存」を押してみてください。':'Nothing saved yet. Bookmark a piece to read it later.'}
          </div>
        </div>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:32}}>
          {posts.map(po=>(<ArticleCard key={po.slug} p={p} lang={lang} post={po} t={t} saved={true} onSave={onSave}/>))}
        </div>
      )}
    </div>
  );
}
