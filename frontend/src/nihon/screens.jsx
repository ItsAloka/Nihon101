// screens.jsx — Article, Category, Search, Author, About, Saved screens
import React from "react";
import "./ui.jsx";
import "./home.jsx";
const { maxWrap, SectionHeader, ArticleCard, CategoryChip, AuthorChip, Avatar, Photo, Hanko,
        gradStyle, WaveMark, tintBg, ArrowLeft, ArrowRight, BookmarkIcon, HeartIcon,
        CommentIcon, PencilIcon, TrendIcon, SearchIcon } = (typeof window !== 'undefined' ? window : {});

// ====== ARTICLE ======
// Reading-progress bar in its own component: it updates the bar width via a DOM
// ref inside requestAnimationFrame, so scrolling NEVER triggers a React render of
// the article subtree (which would thrash the main thread and flicker the
// out-of-process YouTube iframe).
function ReadingProgress({ p, targetRef }) {
  const barRef = React.useRef(null);
  React.useEffect(()=>{
    let raf = 0;
    const update = ()=>{
      raf = 0;
      const el = targetRef.current, bar = barRef.current;
      if (!el || !bar) return;
      const h = el.scrollHeight - window.innerHeight;
      const scrolled = Math.max(0, -el.getBoundingClientRect().top);
      bar.style.width = Math.min(100, (scrolled / Math.max(1, h)) * 100) + '%';
    };
    const onScroll = ()=>{ if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return ()=>{ window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [targetRef]);
  return (
    <div style={{ position:'sticky', top:0, height:3, background:p.line, zIndex:25 }}>
      <div ref={barRef} style={{ height:'100%', width:'0%', background:p.stamp }}/>
    </div>
  );
}

// "PHOTO: <label>" pill overlaid on a real cover image (mirrors the seed Photo
// component's caption so authored covers read the same as the prototype).
function PhotoTag({ p, label }) {
  return (
    <div style={{
      position:'absolute', left:14, bottom:12, display:'flex', alignItems:'center', gap:8,
      background:`color-mix(in oklab, ${p.surface} 92%, transparent)`, backdropFilter:'blur(6px)',
      padding:'5px 10px', borderRadius:999, fontFamily:'var(--fontMono)',
      fontSize:10, letterSpacing:'0.08em', color:p.inkSoft, textTransform:'uppercase',
    }}>
      <span style={{width:6, height:6, borderRadius:3, background:p.stamp, display:'inline-block'}}/>
      photo: {label}
    </div>
  );
}

// Centered credit line under the cover ("<credit> · <date>"). Real posts use the
// author-entered credit; seed posts fall back to the editorial caption.
function CoverCredit({ p, lang, credit, date }) {
  const text = credit && credit.trim()
    ? credit.trim()
    : (lang==='jp' ? '撮影：編集部' : 'photograph by the editors');
  return (
    <div style={{
      fontFamily:'var(--fontMono)', fontSize:12, color:p.inkFaint,
      letterSpacing:'0.04em', textAlign:'center', marginTop:14,
    }}>{text} · {date}</div>
  );
}

// Initials from a display name (e.g. "Kage Loom" → "KL").
function nameInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}
function avatarCircle(p, name, size) {
  const c = tintBg('rose', p);
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background:`linear-gradient(135deg, ${c}, color-mix(in oklab, ${c} 50%, ${p.surface2}))`,
      color:p.ink, display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:size*0.4, border:`1px solid ${p.line}`,
    }}>{nameInitials(name)}</div>
  );
}
// Byline for a real (backend) post: avatar + name + date.
// Link to the SSR public profile when the author has a handle.
const profileHref = (lang, handle) => handle ? `/${lang==='jp'?'ja':'en'}/u/${handle}` : null;

function RealByline({ p, lang, name, date, handle }) {
  const href = profileHref(lang, handle);
  const inner = (
    <div style={{display:'flex', alignItems:'center', gap:14}}>
      {avatarCircle(p, name, 48)}
      <div>
        <div style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:18, color:p.ink}}>{name}</div>
        <div style={{fontFamily:'var(--fontMono)', fontSize:12, color:p.inkFaint, marginTop:2}}>{date}</div>
      </div>
    </div>
  );
  return href ? <a href={href} style={{textDecoration:'none'}}>{inner}</a> : inner;
}
// "Written by" card for a real post — same shape as the seed AuthorCard, but
// built from the post's author name (full bio lives on the public profile).
function RealAuthorCard({ p, lang, name, handle }) {
  const href = profileHref(lang, handle);
  return (
    <div style={{display:'flex', gap:20, padding:24, background:p.surface, border:`1px solid ${p.line}`, borderRadius:18, alignItems:'center'}}>
      {avatarCircle(p, name, 80)}
      <div style={{flex:1}}>
        <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:4}}>
          {lang==='jp'?'書いた人':'written by'}
        </div>
        <div style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:22, color:p.ink}}>{name}</div>
        <div style={{fontFamily:'var(--fontBody)', fontSize:14, color:p.inkSoft, marginTop:6, lineHeight:1.5}}>
          {lang==='jp'?'nihon101の書き手。':'Writer at nihon101.'}
        </div>
      </div>
      {href && (
        <a href={href} style={{flexShrink:0, fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, color:p.ink, textDecoration:'none', border:`1px solid ${p.line}`, borderRadius:999, padding:'9px 18px'}}>
          {lang==='jp'?'プロフィール':'View profile'}
        </a>
      )}
    </div>
  );
}

function ArticlePage({ p, lang, post, t, savedSet, claps, onClap, onSave, comments, onAddComment, onLikeComment, onDeleteComment, canModerate, currentUser, onRequireLogin }) {
  const containerRef = React.useRef(null);

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
  const cat = window.NIHON_DATA.CATEGORIES.find(c=>c.slug===post.category);
  const real = !!post._real;
  const isOwner = real && currentUser && currentUser.id===post._authorId;
  const realBody = real ? (lang==='jp' ? post._bodyJa : post._bodyEn) : '';
  const related = real ? [] : window.getAllPosts().filter(x=>x.category===post.category && x.slug!==post.slug).slice(0,3);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [delBusy, setDelBusy] = React.useState(false);
  const doDelete = async ()=>{
    setDelBusy(true);
    try { await window.N101_CONTENT.postApi.remove(post._id); window.__nihon_go({name:'profile'}); }
    catch { setDelBusy(false); }
  };
  const ownerActions = (
    <div style={{display:'flex', gap:10}}>
      <button onClick={()=>window.__nihon_go({name:'compose', editId:post._id})} style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, padding:'0 16px', height:40, borderRadius:999, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8, fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, color:p.ink}}>
        <PencilIcon color={p.ink} size={15}/> {lang==='jp'?'編集':'Edit'}
      </button>
      <button onClick={()=>setConfirmDel(true)} style={{appearance:'none', border:'none', background:p.stamp, padding:'0 16px', height:40, borderRadius:999, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8, fontFamily:'var(--fontBody)', fontSize:13, fontWeight:700, color:'#fff'}}>
        🗑 {lang==='jp'?'削除':'Delete'}
      </button>
    </div>
  );

  return (
    <div ref={containerRef}>
      {/* Progress bar — isolated so scrolling never re-renders the article
          (a per-scroll re-render thrashes the main thread and makes the
          out-of-process YouTube iframe flicker on scroll). */}
      <ReadingProgress p={p} targetRef={containerRef}/>

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
            {real
              ? <RealByline p={p} lang={lang} name={lang==='jp'?post.author_jp:post.author} date={post.date} handle={post.authorHandle}/>
              : <AuthorChip slug={post.author} p={p} lang={lang} date={post.date} size="lg"/>}
            {isOwner ? ownerActions : (
            <div style={{display:'flex', gap:10}}>
              <button onClick={()=>onSave(post.slug)} style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, width:40, height:40, borderRadius:999, cursor:'pointer', color:saved?p.stamp:p.ink, display:'inline-flex', alignItems:'center', justifyContent:'center'}}>
                <BookmarkIcon filled={saved} color={saved?p.stamp:p.ink}/>
              </button>
              <button style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, padding:'0 14px', height:40, borderRadius:999, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--fontBody)', fontSize:13, color:p.ink}}>
                <ShareIcon color={p.ink}/> {lang==='jp'?'共有':'Share'}
              </button>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Cover */}
      <div style={{...maxWrap(), marginBottom:48}}>
        <div style={{maxWidth:1080, margin:'0 auto'}}>
          {real
            ? (post._cover
                ? <div style={{position:'relative'}}>
                    <img src={post._cover} alt="" style={{width:'100%', height:520, objectFit:'cover', borderRadius:20, display:'block'}}/>
                    {post._coverLabel && <PhotoTag p={p} label={post._coverLabel}/>}
                  </div>
                : <div style={{height:320, borderRadius:20, background:`linear-gradient(135deg, ${tintBg(cat?.tint||'rose', p)}, ${p.bg})`}}/>)
            : <Photo p={p} hue={post.cover.hue} label={post.cover.label} h={520} radius={20} accent={cat?.kanji || '読'}/>}
          {/* credit line — authored posts show it only when a credit was entered;
              seed posts keep the prototype's editorial caption. */}
          {(!real || (post._coverCredit && post._coverCredit.trim())) &&
            <CoverCredit p={p} lang={lang}
              credit={real ? post._coverCredit : ''} date={post.date}/>}
        </div>
      </div>

      {/* Body */}
      <div style={{...maxWrap()}}>
        <div style={{maxWidth:680, margin:'0 auto'}}>
          {real && <ArticleHtml p={p} html={realBody} density={post._density}/>}
          {!real && body.map((para, i)=>{
            const firstLetter = i===0 && para.length;
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
          {/* Pull quote (seed decoration only) */}
          {!real && <blockquote style={{
            borderLeft:`3px solid ${p.stamp}`, paddingLeft:28, margin:'40px 0',
            fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:26, lineHeight:1.4,
            color:p.ink, textWrap:'pretty',
          }}>
            “{lang==='jp'?'急がない場所が、いちばん都会的なのかもしれない。':'The least efficient room may be the most quietly radical one in the city.'}”
          </blockquote>}
          {!real && <p style={{fontFamily:'var(--fontDisplay)', fontSize:20, lineHeight:1.65, color:p.ink, marginBottom:48, textWrap:'pretty'}}>
            {lang==='jp'?'もし、いつかこの店に行くことがあれば、長い時間そこに座って、何もしないでください。':'If you ever go, please sit a long time and do nothing.'}
          </p>}

          {/* Tags — clickable hashtags that open the SSR tag page (/{loc}/t/<slug>). */}
          {(post.tags && post.tags.length > 0) && (
            <div style={{display:'flex', flexWrap:'wrap', gap:8, marginBottom:44}}>
              {post.tags.map((tg, i)=>(
                <a key={i} href={`/${lang==='jp'?'ja':'en'}/t/${window.tagSlug(tg)}`}
                  style={{display:'inline-flex', alignItems:'center', gap:2, padding:'6px 13px', borderRadius:999, border:`1px solid ${p.line}`, background:p.surface, fontFamily:'var(--fontBody)', fontSize:13, fontWeight:500, color:p.inkSoft, textDecoration:'none'}}>
                  <span style={{color:p.accent, fontWeight:800}}>#</span>{tg}
                </a>
              ))}
            </div>
          )}

          {/* End-of-article reader actions — hidden for the post's owner */}
          {!isOwner && <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'24px 0', borderTop:`1px solid ${p.line}`, borderBottom:`1px solid ${p.line}`, marginBottom:48, flexWrap:'wrap', gap:16}}>
            <div style={{display:'flex', gap:10}}>
              <button onClick={()=> currentUser ? onClap(post.slug) : onRequireLogin()} style={{
                appearance:'none', border:`1px solid ${clapped>0?p.stamp:p.line}`,
                background: clapped>0 ? `color-mix(in oklab, ${p.stamp} 12%, ${p.surface})` : p.surface,
                padding:'12px 18px', borderRadius:999, cursor:'pointer',
                display:'inline-flex', alignItems:'center', gap:10,
                fontFamily:'var(--fontBody)', fontSize:14, fontWeight:600, color:p.ink,
                transition:'transform .12s',
              }}
              onMouseDown={(e)=>e.currentTarget.style.transform='scale(0.94)'}
              onMouseUp={(e)=>e.currentTarget.style.transform='scale(1)'}
              onMouseLeave={(e)=>e.currentTarget.style.transform='scale(1)'}>
                <HeartIcon color={p.stamp} filled={clapped>0}/>
                <span>{(post.likes + clapped).toLocaleString()}</span>
                <span style={{color:p.inkFaint, fontSize:12, fontWeight:500}}>{lang==='jp'?'いいね':'likes'}</span>
              </button>
              <a href="#comments" onClick={(e)=>{e.preventDefault(); const el=document.getElementById('comments'); if(el) window.scrollTo({top: el.getBoundingClientRect().top + window.scrollY - 80, behavior:'smooth'});}}
                style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, padding:'12px 18px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:14, fontWeight:600, color:p.ink, display:'inline-flex', alignItems:'center', gap:8, textDecoration:'none'}}>
                <CommentIcon color={p.ink}/> {(comments||[]).length}
                <span style={{color:p.inkFaint, fontSize:12, fontWeight:500}}>{lang==='jp'?'コメント':'comments'}</span>
              </a>
            </div>
            <div style={{display:'flex', gap:10}}>
              <button onClick={()=>onSave(post.slug)} style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, padding:'10px 16px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, color:p.ink, display:'inline-flex', alignItems:'center', gap:8}}>
                <BookmarkIcon filled={saved} color={saved?p.stamp:p.ink}/> {saved ? (lang==='jp'?'保存済み':'Saved') : (lang==='jp'?'保存':'Save')}
              </button>
              <button style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, padding:'10px 16px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, color:p.ink, display:'inline-flex', alignItems:'center', gap:8}}>
                <ShareIcon color={p.ink}/> {lang==='jp'?'共有':'Share'}
              </button>
            </div>
          </div>}
        </div>
      </div>

      {/* Author card — seed authors get the rich card; real posts get a card
          built from the post's author name (no bio yet). */}
      <div style={{...maxWrap()}}>
        <div style={{maxWidth:780, margin:'0 auto'}}>
          {real
            ? <RealAuthorCard p={p} lang={lang} name={lang==='jp'?post.author_jp:post.author} handle={post.authorHandle}/>
            : <AuthorCard p={p} lang={lang} slug={post.author}/>}
        </div>
      </div>

      {/* Comments */}
      <div style={{...maxWrap()}} id="comments">
        <div style={{maxWidth:780, margin:'0 auto'}}>
          <CommentSection p={p} lang={lang} slug={post.slug}
            comments={comments||[]} onAdd={onAddComment} onLike={onLikeComment}
            onDelete={onDeleteComment} canModerate={canModerate}
            currentUser={currentUser} onRequireLogin={onRequireLogin}/>
        </div>
      </div>

      {/* Related (seed only) */}
      {!real && <div style={{...maxWrap()}}>
        <SectionHeader p={p} lang={lang}
          en={`More in ${cat?.en || ''}`} jp={`もっと ${cat?.jp || ''}`}
          kicker_en="related reading" kicker_jp="関連する記事"/>
        <div className="spa-g3" style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24}}>
          {related.map(po=>(<ArticleCard key={po.slug} p={p} lang={lang} post={po} t={t} saved={savedSet.has(po.slug)} onSave={onSave}/>))}
        </div>
      </div>}

      {confirmDel && (
        <div onClick={()=>!delBusy&&setConfirmDel(false)} style={{position:'fixed', inset:0, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60}}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:p.surface, borderRadius:18, padding:28, maxWidth:420, border:`1px solid ${p.line}`}}>
            <h3 style={{fontFamily:'var(--fontDisplay)', fontSize:20, fontWeight:700, color:p.ink}}>{lang==='jp'?'この記事を削除しますか？':'Delete this post?'}</h3>
            <p style={{color:p.inkSoft, fontSize:14.5, lineHeight:1.6, marginTop:10, fontFamily:'var(--fontBody)'}}>
              {lang==='jp'?'この操作は取り消せません。記事と翻訳版の両方が完全に削除されます。':"This can't be undone. Both language versions will be permanently removed."}
            </p>
            <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:22}}>
              <button disabled={delBusy} onClick={()=>setConfirmDel(false)} style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, padding:'10px 18px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, color:p.ink}}>{lang==='jp'?'キャンセル':'Cancel'}</button>
              <button disabled={delBusy} onClick={doDelete} style={{appearance:'none', border:'none', background:p.stamp, color:'#fff', padding:'10px 18px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, fontWeight:700}}>{lang==='jp'?'削除する':'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Renders stored post HTML in the reading view, with the magazine prose styling.
// Stored YouTube embeds render as plain live iframes (same as the reference) —
// no GPU layer promotion, so they don't shake under the backdrop-filter nav.
function ArticleHtml({ p, html, density }) {
  // Density → paragraph rhythm (line-height + gap between paragraphs).
  const d = density === 'normal' ? 'normal' : density === 'relaxed' ? 'relaxed' : 'compact';
  const line = d === 'compact' ? 1.65 : d === 'normal' ? 1.75 : 1.9;
  const gap = d === 'compact' ? 18 : d === 'normal' ? 24 : 34;
  const css = `
  .art-html { font-family:var(--fontDisplay); font-size:20px; line-height:${line}; color:${p.ink}; }
  .art-html p { margin:0 0 ${gap}px; }
  .art-html h1 { font-size:34px; font-weight:600; letter-spacing:-0.02em; margin:32px 0 12px; }
  .art-html h2 { font-size:26px; font-weight:600; margin:28px 0 10px; }
  .art-html blockquote { border-left:3px solid ${p.stamp}; padding-left:24px; margin:28px 0; font-style:italic; color:${p.inkSoft}; }
  .art-html ul { padding-left:28px; margin:0 0 24px; list-style:disc outside; }
  .art-html ol { padding-left:28px; margin:0 0 24px; list-style:decimal outside; }
  .art-html li { margin:6px 0; }
  .art-html li::marker { color:${p.stamp}; }
  .art-html a { color:${p.stamp}; text-decoration:underline; }
  .art-html mark { background:color-mix(in oklab, ${p.stamp} 32%, transparent); color:inherit; padding:.05em .1em; border-radius:3px; }
  .art-html hr { border:none; border-top:1px solid ${p.line}; margin:32px 0; }
  .art-html pre { background:${p.ink}; color:${p.surface}; padding:16px; border-radius:12px; overflow:auto; font-family:var(--fontMono); font-size:14px; margin:0 0 24px; }
  .art-html img { max-width:100%; height:auto; border-radius:12px; }
  .art-html figure { margin:24px 0; }
  .art-html figcaption { font-family:var(--fontMono); font-size:12px; color:${p.inkFaint}; text-align:center; margin-top:8px; }
  .art-html table { border-collapse:collapse; width:100%; margin:24px 0; }
  .art-html td,.art-html th { border:1px solid ${p.line}; padding:8px 10px; }
  .art-html th { background:${p.bg}; font-weight:700; }
  .art-html > p:first-of-type::first-letter { float:left; font-family:var(--fontDisplay); font-weight:600; font-size:96px; line-height:0.8; color:${p.stamp}; margin:8px 14px 0 0; }
  .art-html [data-youtube-video], .art-html iframe { max-width:100%; }
  .art-html [data-youtube-video] iframe, .art-html iframe { width:100%; aspect-ratio:16/9; height:auto; border:0; border-radius:12px; margin:24px 0; display:block; }
  .art-html::after { content:""; display:table; clear:both; }
  `;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="art-html" dangerouslySetInnerHTML={{ __html: html || `<p style="color:${p.inkFaint}">${''}</p>` }} />
    </>
  );
}

// Resolves an article by slug: seed post if present, else a real backend post.
function ArticleLoader(props) {
  const { slug } = props;
  const seed = window.getPost(slug);
  const [real, setReal] = React.useState(null);
  const [missing, setMissing] = React.useState(false);
  React.useEffect(()=>{
    if (seed) return;
    let live = true;
    window.N101_CONTENT.postApi.getBySlug(slug)
      .then(po=>{ if(live) setReal(window.N101_CONTENT.hydrateReal(po)); })
      .catch(()=>{ if(live) setMissing(true); });
    return ()=>{ live=false; };
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  // Seed posts keep the localStorage mock engagement passed down from app.jsx.
  // Real backend posts get live likes + comments wired straight to the Worker.
  if (seed) return <ArticlePage {...props} post={seed}/>;
  if (real) return <RealArticle {...props} post={real}/>;
  if (missing) return <div style={{maxWidth:1320, margin:'0 auto', padding:'120px 32px', textAlign:'center', fontFamily:'var(--fontDisplay)', fontSize:24, color:props.p.inkSoft}}>{props.lang==='jp'?'記事が見つかりません。':'Article not found.'}</div>;
  return <div style={{padding:'120px 32px', textAlign:'center', fontFamily:'var(--fontMono)', fontSize:13, color:props.p.inkFaint}}>…</div>;
}

// Backend-wired engagement for a real post, adapted onto ArticlePage's existing
// prop contract (claps map + comment list). Likes are a server-side toggle;
// comments are flat with per-comment likes. Optimistic, with rollback on error.
const initials = (name)=> (name||'?').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase() || '?';
const toCommentView = (c)=> ({
  id: c.id, parentId: c.parentId || null,
  author: {
    slug:c.userId, handle:c.authorHandle||null, avatarUrl:c.authorAvatarUrl||null,
    en:c.authorName||'Reader', jp:c.authorNameJa||c.authorName||'読者',
    initials:initials(c.authorName), tint:'rose',
  },
  text: c.body, ts: c.createdAt, likes: c.likes, liked: c.liked, _real:true, userId:c.userId,
});

// Render a comment body, coloring any run of ● (profanity-masked by the backend) red.
function CommentText({ text, p }) {
  if (!text || text.indexOf('●') === -1) return text;
  const parts = text.split(/(●+)/);
  return parts.map((s, i) => s[0] === '●'
    ? <span key={i} style={{color:'#e0245e'}}>{s}</span>
    : <React.Fragment key={i}>{s}</React.Fragment>);
}
function RealArticle(props) {
  const { post, currentUser } = props;
  const id = post._id;
  const [liked, setLiked] = React.useState(!!post.liked);
  const [likeCount, setLikeCount] = React.useState(post.likes || 0);
  const [comments, setComments] = React.useState([]);

  React.useEffect(()=>{
    let live = true;
    window.N101_CONTENT.postApi.listComments(id)
      .then(rows=>{ if(live) setComments(rows.map(toCommentView)); })
      .catch(()=>{});
    return ()=>{ live=false; };
  }, [id]);

  // Record the read — the For You affinity signal (no-op when logged out).
  React.useEffect(()=>{ if (currentUser) window.N101_CONTENT.feedApi.recordRead(id); }, [id, currentUser]);

  const onClap = React.useCallback(async ()=>{
    setLiked(v=>!v); setLikeCount(n=> n + (liked?-1:1));   // optimistic
    try { const r = await window.N101_CONTENT.postApi.toggleLike(id); setLiked(r.liked); setLikeCount(r.likes); }
    catch { setLiked(v=>!v); setLikeCount(n=> n + (liked?1:-1)); }   // rollback
  }, [id, liked]);

  const onAddComment = React.useCallback(async (_slug, text, parentId)=>{
    // Optimistic: show immediately, reconcile on success, drop on failure.
    const tmpId = "tmp_"+Math.random().toString(36).slice(2);
    const u = currentUser;
    const optimistic = { id:tmpId, parentId:parentId||null,
      author:{ slug:u.slug, handle:u.slug, avatarUrl:u.avatarUrl||null, en:u.en, jp:u.jp, initials:u.initials, tint:u.tint },
      text, ts:Date.now(), likes:0, liked:false, _real:false, userId:u.id, _pending:true };
    setComments(prev=>[...prev, optimistic]);
    try { const c = await window.N101_CONTENT.postApi.addComment(id, text, parentId); setComments(prev=>prev.map(x=> x.id===tmpId ? toCommentView(c) : x)); }
    catch { setComments(prev=>prev.filter(x=> x.id!==tmpId)); }
  }, [id, currentUser]);

  const onDeleteComment = React.useCallback(async (cid)=>{
    setComments(prev=>prev.filter(c=> c.id!==cid && c.parentId!==cid));   // optimistic (drop replies too)
    try { await window.N101_CONTENT.postApi.removeComment(id, cid); } catch {}
  }, [id]);

  const onLikeComment = React.useCallback(async (_slug, cid)=>{
    setComments(prev=>prev.map(c=> c.id===cid ? {...c, liked:!c.liked, likes:c.likes+(c.liked?-1:1)} : c));
    try { const r = await window.N101_CONTENT.postApi.toggleCommentLike(id, cid); setComments(prev=>prev.map(c=> c.id===cid ? {...c, liked:r.liked, likes:r.likes} : c)); }
    catch { setComments(prev=>prev.map(c=> c.id===cid ? {...c, liked:!c.liked, likes:c.likes+(c.liked?1:-1)} : c)); }
  }, [id]);

  // ArticlePage renders `post.likes + claps[slug]`; feed it a base that lands on
  // the true total once the viewer's own like (0/1) is added back.
  const postAdj = { ...post, likes: Math.max(0, likeCount - (liked?1:0)) };
  return (
    <ArticlePage {...props} post={postAdj}
      claps={{ [post.slug]: liked ? 1 : 0 }} onClap={onClap}
      comments={comments} onAddComment={onAddComment} onLikeComment={onLikeComment}
      onDeleteComment={onDeleteComment} canModerate={currentUser && currentUser.id===post._authorId}/>
  );
}

function AuthorCard({p, lang, slug}) {
  const a = window.getAuthor(slug);
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

function ShareIcon({color='currentColor', size=14}) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/>
  </svg>);
}

// ====== COMMENTS (level-1 threads: top-level comments + one reply level) ======
const MAX_COMMENT = 4000; // mirrors the backend cap in routes/posts.ts

function CommentComposer({ p, lang, currentUser, onSubmit, onCancel, autoFocus, compact, placeholder }) {
  const [text, setText] = React.useState('');
  const submit = ()=>{ if(!text.trim()) return; onSubmit(text.trim()); setText(''); };
  const near = text.length > MAX_COMMENT * 0.9;
  return (
    <div style={{display:'flex', gap:compact?10:14, marginBottom:compact?0:36}}>
      <Avatar user={currentUser} p={p} size={compact?34:44}/>
      <div style={{flex:1}}>
        <textarea value={text} autoFocus={autoFocus} maxLength={MAX_COMMENT}
          onChange={(e)=>setText(e.target.value.slice(0, MAX_COMMENT))}
          placeholder={placeholder || (lang==='jp'?'感想を書く…':'Add to the conversation…')}
          style={{
            width:'100%', minHeight:compact?56:80, resize:'vertical', border:`1px solid ${p.line}`,
            borderRadius:14, padding:'12px 16px', background:p.surface,
            fontFamily:'var(--fontBody)', fontSize:compact?14:15, color:p.ink, outline:'none', lineHeight:1.5,
          }}/>
        <div style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8, marginTop:10}}>
          <span style={{marginRight:'auto', fontFamily:'var(--fontMono)', fontSize:12, color: near ? p.stamp : p.inkFaint}}>
            {text.length}/{MAX_COMMENT}
          </span>
          {onCancel && <button onClick={onCancel} style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, padding:'8px 16px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, color:p.inkSoft}}>{lang==='jp'?'キャンセル':'Cancel'}</button>}
          <button disabled={!text.trim()} onClick={submit}
            style={{...gradStyle(p), padding:compact?'8px 16px':'10px 20px', fontSize:13, opacity: text.trim()?1:0.5, cursor: text.trim()?'pointer':'default'}}>
            {compact ? (lang==='jp'?'返信する':'Reply') : (lang==='jp'?'投稿する':'Post comment')}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({ p, lang, slug, c, isReply, currentUser, onLike, onReply, onDelete, onReport, onRequireLogin }) {
  const [replying, setReplying] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const mine = currentUser && (c.userId===currentUser.id || c.author?.slug===currentUser.slug);
  // Only the comment's own author can delete it from the public reader. Removing
  // anyone else's comment goes through Report → admin panel (Hide/Delete).
  const canDelete = !!onDelete && mine;
  const canReport = !!onReport && !mine;
  const href = profileHref(lang, c.author?.handle);
  const nameEl = (
    <span style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:15, color:p.ink}}>
      {lang==='jp'?c.author.jp:c.author.en}
    </span>
  );
  return (
    <div id={`comment-${c.id}`} style={{display:'flex', gap:14, scrollMarginTop:96, borderRadius:14, transition:'background 0.6s ease'}}>
      {href
        ? <a href={href} style={{display:'block', textDecoration:'none'}}><Avatar user={c.author} p={p} size={isReply?34:44}/></a>
        : <Avatar user={c.author} p={p} size={isReply?34:44}/>}
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'baseline', gap:10, marginBottom:4}}>
          {href ? <a href={href} style={{textDecoration:'none'}}>{nameEl}</a> : nameEl}
          <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint}}>{relTime(c.ts, lang)}</span>
        </div>
        <p style={{fontFamily:'var(--fontBody)', fontSize:15, lineHeight:1.6, color:p.ink, marginBottom:8, textWrap:'pretty'}}><CommentText text={c.text} p={p}/></p>
        <div style={{display:'flex', alignItems:'center', gap:18}}>
          <button onClick={()=> currentUser ? onLike(slug, c.id) : onRequireLogin()}
            style={{appearance:'none', border:'none', background:'transparent', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, color: c.liked?p.stamp:p.inkFaint, fontFamily:'var(--fontBody)', fontSize:13, padding:0}}>
            <HeartIcon color={c.liked?p.stamp:p.inkFaint} filled={c.liked} size={15}/> {c.likes>0?c.likes:''} {lang==='jp'?'いいね':'Like'}
          </button>
          {!isReply && (
            <button onClick={()=> currentUser ? setReplying(v=>!v) : onRequireLogin()}
              style={{appearance:'none', border:'none', background:'transparent', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, color:p.inkFaint, fontFamily:'var(--fontBody)', fontSize:13, padding:0, fontWeight:600}}>
              {lang==='jp'?'返信':'Reply'}
            </button>
          )}
          {canReport && (
            <button onClick={()=> currentUser ? onReport(c.id) : onRequireLogin()}
              style={{appearance:'none', border:'none', background:'transparent', cursor:'pointer', color:p.inkFaint, fontFamily:'var(--fontBody)', fontSize:13, padding:0}}>
              {lang==='jp'?'通報':'Report'}
            </button>
          )}
          {canDelete && (
            <button onClick={()=>setConfirmDel(true)}
              style={{appearance:'none', border:'none', background:'transparent', cursor:'pointer', color:p.inkFaint, fontFamily:'var(--fontBody)', fontSize:13, padding:0}}>
              {lang==='jp'?'削除':'Delete'}
            </button>
          )}
        </div>
        {replying && (
          <div style={{marginTop:14}}>
            <CommentComposer p={p} lang={lang} currentUser={currentUser} compact autoFocus
              placeholder={lang==='jp'?'返信を書く…':'Write a reply…'}
              onCancel={()=>setReplying(false)}
              onSubmit={(text)=>{ onReply(slug, text, c.id); setReplying(false); }}/>
          </div>
        )}
      </div>
      {confirmDel && (
        <div onClick={()=>setConfirmDel(false)} style={{position:'fixed', inset:0, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60}}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:p.surface, borderRadius:18, padding:28, maxWidth:420, border:`1px solid ${p.line}`}}>
            <h3 style={{fontFamily:'var(--fontDisplay)', fontSize:20, fontWeight:700, color:p.ink}}>{lang==='jp'?'このコメントを削除しますか？':'Delete this comment?'}</h3>
            <p style={{color:p.inkSoft, fontSize:14.5, lineHeight:1.6, marginTop:10, fontFamily:'var(--fontBody)'}}>
              {lang==='jp'?'この操作は取り消せません。コメントと返信が完全に削除されます。':"This can't be undone. The comment and its replies will be permanently removed."}
            </p>
            <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:22}}>
              <button onClick={()=>setConfirmDel(false)} style={{appearance:'none', border:`1px solid ${p.line}`, background:p.surface, padding:'10px 18px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, color:p.ink}}>{lang==='jp'?'キャンセル':'Cancel'}</button>
              <button onClick={()=>{ setConfirmDel(false); onDelete(c.id); }} style={{appearance:'none', border:'none', background:p.stamp, color:'#fff', padding:'10px 18px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, fontWeight:700}}>{lang==='jp'?'削除する':'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// A top-level comment + its replies behind a collapsible "View N replies" dropdown.
function Thread({ p, lang, slug, c, replies, currentUser, onLike, onReply, onDelete, onReport, onRequireLogin }) {
  const [open, setOpen] = React.useState(false);
  const n = replies.length;
  const item = (cm, isReply) => (
    <CommentItem key={cm.id} p={p} lang={lang} slug={slug} c={cm} isReply={isReply} currentUser={currentUser}
      onLike={onLike} onReply={onReply} onDelete={onDelete} onReport={onReport} onRequireLogin={onRequireLogin}/>
  );
  return (
    <div>
      {item(c, false)}
      {n > 0 && (
        <div style={{marginLeft:58, marginTop:12}}>
          <button onClick={()=>setOpen(v=>!v)} style={{
            appearance:'none', border:'none', background:'transparent', cursor:'pointer', padding:0,
            display:'inline-flex', alignItems:'center', gap:7, color:p.stamp,
            fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600,
          }}>
            <span style={{display:'inline-block', transform:`rotate(${open?90:0}deg)`, transition:'transform .18s ease', fontSize:11}}>▶</span>
            {open
              ? (lang==='jp' ? '返信を隠す' : 'Hide replies')
              : (lang==='jp' ? `${n}件の返信を表示` : `View ${n} ${n===1?'reply':'replies'}`)}
          </button>
          {open && (
            <div style={{marginTop:16, paddingLeft:22, borderLeft:`2px solid ${p.line}`, display:'flex', flexDirection:'column', gap:20}}>
              {replies.map(r=>item(r, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CommentSection({ p, lang, slug, comments, onAdd, onLike, onDelete, onReport, canModerate, currentUser, onRequireLogin }) {
  // Tag onDelete with moderation capability so CommentItem can show Delete for
  // the post owner on any comment (not just their own).
  const del = React.useMemo(()=>{ if(!onDelete) return undefined; const f=(id)=>onDelete(id); f.canModerate=!!canModerate; return f; }, [onDelete, canModerate]);
  const [sort, setSort] = React.useState('top'); // 'top' (most liked) | 'recent'

  const cmp = sort==='top'
    ? (a,b)=> (b.likes||0)-(a.likes||0) || b.ts - a.ts   // most liked, ties broken by newest
    : (a,b)=> b.ts - a.ts;                                // newest first
  const topLevel = comments.filter(c=>!c.parentId).sort(cmp);
  const repliesByParent = {};
  comments.filter(c=>c.parentId).forEach(c=>{ (repliesByParent[c.parentId] ||= []).push(c); });
  Object.values(repliesByParent).forEach(arr=>arr.sort((a,b)=> a.ts - b.ts)); // replies always chronological

  const sortBtn = (key, label)=>(
    <button onClick={()=>setSort(key)} style={{
      appearance:'none', cursor:'pointer', border:'none', background: sort===key?p.surface:'transparent',
      color: sort===key?p.ink:p.inkFaint, fontWeight: sort===key?600:500,
      fontFamily:'var(--fontBody)', fontSize:13, padding:'6px 14px', borderRadius:999,
      boxShadow: sort===key?`0 1px 2px color-mix(in oklab, ${p.ink} 12%, transparent)`:'none',
    }}>{label}</button>
  );

  return (
    <section style={{marginTop:56, paddingTop:8}}>
      <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:24, justifyContent:'space-between', flexWrap:'wrap'}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <CommentIcon color={p.ink} size={22}/>
          <h2 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:28, letterSpacing:'-0.02em', color:p.ink}}>
            {lang==='jp'?`コメント ${comments.length}`:`${comments.length} ${comments.length===1?'comment':'comments'}`}
          </h2>
        </div>
        {topLevel.length>1 && (
          <div style={{display:'inline-flex', gap:2, padding:3, background:p.surface2, border:`1px solid ${p.line}`, borderRadius:999}}>
            {sortBtn('top', lang==='jp'?'人気':'Top')}
            {sortBtn('recent', lang==='jp'?'新着':'Recent')}
          </div>
        )}
      </div>

      {/* Top-level composer */}
      {currentUser ? (
        <CommentComposer p={p} lang={lang} currentUser={currentUser} onSubmit={(text)=>onAdd(slug, text)}/>
      ) : (
        <div onClick={onRequireLogin} style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:16,
          padding:'18px 22px', background:p.tint, borderRadius:16, marginBottom:36, cursor:'pointer',
          border:`1px solid ${p.line}`,
        }}>
          <span style={{fontFamily:'var(--fontBody)', fontSize:15, color:p.ink}}>
            {lang==='jp'?'コメントするにはログインしてください。':'Sign in to join the conversation.'}
          </span>
          <button onClick={onRequireLogin} style={{...gradStyle(p), padding:'9px 18px', fontSize:13}}>
            {lang==='jp'?'ログイン':'Sign in'}
          </button>
        </div>
      )}

      {/* Threads */}
      <div style={{display:'flex', flexDirection:'column', gap:28}}>
        {topLevel.length===0 ? (
          <div style={{textAlign:'center', padding:'40px 0', color:p.inkFaint, fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:18}}>
            {lang==='jp'?'最初のコメントを書いてみませんか？':'Be the first to comment.'}
          </div>
        ) : topLevel.map((c)=>{
          const replies = repliesByParent[c.id] || [];
          return (
            <Thread key={c.id} p={p} lang={lang} slug={slug} c={c} replies={replies} currentUser={currentUser}
              onLike={onLike} onReply={onAdd} onDelete={del} onReport={onReport} onRequireLogin={onRequireLogin}/>
          );
        })}
      </div>
    </section>
  );
}

function relTime(ts, lang) {
  const s = Math.floor((Date.now()-ts)/1000);
  if (s<60) return lang==='jp'?'たった今':'just now';
  const m = Math.floor(s/60); if (m<60) return lang==='jp'?`${m}分前`:`${m}m ago`;
  const h = Math.floor(m/60); if (h<24) return lang==='jp'?`${h}時間前`:`${h}h ago`;
  const d = Math.floor(h/24); return lang==='jp'?`${d}日前`:`${d}d ago`;
}

// ====== CATEGORY ======
function CategoryPage({p, lang, slug, t, savedSet, onSave}) {
  const cat = window.NIHON_DATA.CATEGORIES.find(c=>c.slug===slug);
  const posts = window.getAllPosts().filter(x=>x.category===slug);
  if (!cat) return <div style={{...maxWrap(), padding:'80px 32px'}}>Not found.</div>;
  const c = tintBg(cat.tint, p);
  return (
    <div>
      {/* Category banner */}
      <div style={{
        background:`linear-gradient(135deg, color-mix(in oklab, ${c} 50%, ${p.bg}), ${p.bg})`,
        borderBottom:`1px solid ${p.line}`, position:'relative', overflow:'hidden',
      }}>
        <div className="spa-split spa-pad" style={{...maxWrap(), padding:'72px 32px 56px', display:'grid', gridTemplateColumns:'1fr auto', alignItems:'end', gap:32}}>
          <div>
            <div style={{fontFamily:'var(--fontMono)', fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:p.inkSoft, marginBottom:14}}>
              {lang==='jp'?'カテゴリー':'Topic'} / {String(window.NIHON_DATA.CATEGORIES.findIndex(x=>x.slug===slug)+1).padStart(2,'0')}
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
          <div className="spa-g3" style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24, marginTop:32}}>
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
  const cats = window.NIHON_DATA.CATEGORIES;
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
function SearchPage({p, lang, initialQuery, t, savedSet, onSave}) {
  const [q, setQ] = React.useState(initialQuery || '');
  const [cat, setCat] = React.useState(null);
  const all = window.NIHON_DATA.POSTS;
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
          <div className="spa-g3" style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24}}>
            {results.map(post=>(<ArticleCard key={post.slug} p={p} lang={lang} post={post} t={t} saved={savedSet.has(post.slug)} onSave={onSave}/>))}
          </div>
        )}
      </div>
    </div>
  );
}

// ====== AUTHOR PROFILE ======
function AuthorPage({p, lang, slug, t, savedSet, onSave, follows, onToggleFollow}) {
  const a = window.getAuthor(slug);
  if (!a) return <div style={{...maxWrap(), padding:80}}>Not found.</div>;
  const c = tintBg(a.tint, p);
  const posts = window.getAllPosts().filter(po=>po.author===slug);
  const following = !!(follows && follows.has(slug));
  return (
    <div>
      <div style={{
        background:`linear-gradient(135deg, color-mix(in oklab, ${c} 40%, ${p.bg}), ${p.bg})`,
        borderBottom:`1px solid ${p.line}`,
      }}>
        <div className="spa-split spa-pad" style={{...maxWrap(), padding:'72px 32px 56px', display:'grid', gridTemplateColumns:'auto 1fr auto', gap:32, alignItems:'center'}}>
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
            <button onClick={()=>onToggleFollow && onToggleFollow(slug)} style={{
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
        <div className="spa-g3" style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24}}>
          {posts.map(po=>(<ArticleCard key={po.slug} p={p} lang={lang} post={po} t={t} saved={savedSet.has(po.slug)} onSave={onSave}/>))}
        </div>
      </div>
    </div>
  );
}


// ====== ABOUT ======
function AboutPage({p, lang}) {
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

// Resolve a set/array of saved slugs → real, card-ready posts (hydrated + the
// gradient cover the prototype card expects). Skips slugs that 404 (e.g. a post
// that was deleted). Shared by Saved + the profile's saved tab.
function useResolvedPosts(slugs) {
  const key = [...slugs].sort().join(',');
  const [posts, setPosts] = React.useState(null);
  React.useEffect(()=>{
    let live = true;
    const list = key ? key.split(',') : [];
    if (!list.length) { setPosts([]); return; }
    const { postApi, hydrateReal } = window.N101_CONTENT;
    Promise.all(list.map(s=>postApi.getBySlug(s).then(hydrateReal).catch(()=>null)))
      .then(rows=>{ if(live) setPosts(rows.filter(Boolean).map(po=>({ ...po, cover: { hue: (window.N101_CATS?.byId(po.category)?.tint) || 'cream', label: po._coverLabel || '', src: po._cover || null } }))); });
    return ()=>{ live=false; };
  }, [key]);
  return posts; // null = loading
}

// ====== SAVED ======
function SavedPage({p, lang, savedSet, t, onSave}) {
  const posts = useResolvedPosts(savedSet) || [];
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
        <div className="spa-g3" style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24}}>
          {posts.map(po=>(<ArticleCard key={po.slug} p={p} lang={lang} post={po} t={t} saved={true} onSave={onSave}/>))}
        </div>
      )}
    </div>
  );
}

// ====== LEGAL / CONTACT shared bits ======
function PageHero({p, lang, kicker, en, jp, sub}) {
  return (
    <div style={{...maxWrap(), paddingTop:56}}>
      <div style={{maxWidth:780, margin:'0 auto'}}>
        <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:14, display:'flex', alignItems:'center', gap:8}}>
          <WaveMark color={p.stamp}/> {kicker}
        </div>
        <h1 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(38px,5vw,68px)', letterSpacing:'-0.025em', lineHeight:1.04, color:p.ink, marginBottom:16, textWrap:'pretty'}}>
          {lang==='jp'?jp:en}
        </h1>
        {sub ? <p style={{fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:21, color:p.inkSoft, lineHeight:1.45}}>{sub}</p> : null}
      </div>
    </div>
  );
}

function LegalBlock({p, lang, num, en, jp, body_en, body_jp}) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'56px 1fr', gap:22, marginBottom:30, paddingBottom:30, borderBottom:`1px solid ${p.line}`}}>
      <div style={{fontFamily:'var(--fontDisplay)', fontSize:32, color:p.stamp, lineHeight:1, fontWeight:600}}>{num}</div>
      <div>
        <h3 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:23, lineHeight:1.2, letterSpacing:'-0.015em', color:p.ink, marginBottom:10, textWrap:'pretty'}}>{lang==='jp'?jp:en}</h3>
        <p style={{fontFamily:'var(--fontBody)', fontSize:16, lineHeight:1.65, color:p.inkSoft, textWrap:'pretty'}}>{lang==='jp'?body_jp:body_en}</p>
      </div>
    </div>
  );
}

// ====== PRIVACY POLICY ======
function PrivacyPage({p, lang}) {
  return (
    <div style={{paddingBottom:32}}>
      <PageHero p={p} lang={lang}
        kicker={lang==='jp'?'プライバシー':'Privacy'}
        en="Privacy policy" jp="プライバシーポリシー"
        sub={lang==='jp'?'短く、正直に。私たちが集めるもの、集めないもの。':'Short and honest — what we collect, what we don’t, and why.'}/>
      <div style={{...maxWrap(), marginTop:40}}>
        <div style={{maxWidth:780, margin:'0 auto'}}>
          <p style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.08em', marginBottom:32}}>
            {lang==='jp'?'最終更新：2026年3月':'Last updated: March 2026'}
          </p>
          <LegalBlock p={p} lang={lang} num="一" en="What we collect" jp="集めるもの"
            body_en="If you create an account, we store the name and bio you give us, and the stories, likes, comments, and follows you create. We keep basic, anonymous analytics (page views, which articles are read) to understand what people enjoy."
            body_jp="アカウントを作成すると、入力したお名前・自己紹介、そして書いた記事・いいね・コメント・フォローを保存します。どの記事が読まれているかを知るため、匿名の基本的なアクセス解析も行います。"/>
          <LegalBlock p={p} lang={lang} num="二" en="What we don’t do" jp="しないこと"
            body_en="We don’t sell your personal data. We don’t track you across other websites. We don’t require your real name to read — only to write."
            body_jp="個人データを販売しません。他サイトをまたいだ追跡もしません。読むだけなら本名は不要です（書くときだけ必要）。"/>
          <LegalBlock p={p} lang={lang} num="三" en="Cookies & local storage" jp="クッキーとローカル保存"
            body_en="We use your browser’s local storage to remember your language, light/dark theme, saved articles, and sign-in — so the site works the way you left it. These stay on your device."
            body_jp="言語設定、ライト／ダーク、保存した記事、ログイン状態を、ブラウザのローカル保存に記憶します。これらはあなたの端末内に留まります。"/>
          <LegalBlock p={p} lang={lang} num="四" en="Advertising" jp="広告について"
            body_en="If we ever show ads, we’ll say so clearly here first, label them, and link the ad provider’s own privacy terms. We will never disguise an ad as an article."
            body_jp="広告を掲載する場合は、まずここで明記し、広告として表示し、広告提供者のプライバシー規約へのリンクを示します。広告を記事に見せかけることはしません。"/>
          <LegalBlock p={p} lang={lang} num="五" en="Your choices" jp="あなたの選択"
            body_en="You can edit or delete your profile and stories at any time, and clearing your browser data removes everything stored locally. Questions? Use the contact page below."
            body_jp="プロフィールや記事はいつでも編集・削除できます。ブラウザのデータを消去すれば、ローカルに保存された情報もすべて消えます。ご質問は下記のお問い合わせから。"/>
          <button onClick={()=>window.__nihon_go({name:'contact'})} style={{...window.gradStyle(p), marginTop:8}}>
            {lang==='jp'?'お問い合わせ':'Contact us'} <ArrowRight color="#fff"/>
          </button>
        </div>
      </div>
    </div>
  );
}

// ====== CONTACT ======
function ContactPage({p, lang}) {
  const [form, setForm] = React.useState({name:'', email:'', topic:'general', message:''});
  const [sent, setSent] = React.useState(false);
  const set = (k,v)=>setForm(f=>({...f, [k]:v}));
  const valid = form.name.trim() && form.email.includes('@') && form.message.trim();
  const topics = [
    ['general', lang==='jp'?'ふつうの用件':'General'],
    ['pitch',   lang==='jp'?'寄稿したい':'Pitch a story'],
    ['bug',     lang==='jp'?'不具合の報告':'Report a bug'],
    ['press',   lang==='jp'?'取材・お仕事':'Press / business'],
  ];
  return (
    <div style={{paddingBottom:32}}>
      <PageHero p={p} lang={lang}
        kicker={lang==='jp'?'お問い合わせ':'Contact'}
        en="Say hello." jp="こんにちは。"
        sub={lang==='jp'?'寄稿のご相談、誤りのご指摘、ただのご挨拶も歓迎です。':'Pitches, corrections, or just a hello — we read everything.'}/>
      <div style={{...maxWrap(), marginTop:40}}>
        <div className="spa-split" style={{maxWidth:980, margin:'0 auto', display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:48, alignItems:'start'}}>
          {/* form */}
          <div style={{background:p.surface, border:`1px solid ${p.line}`, borderRadius:20, padding:32}}>
            {sent ? (
              <div style={{textAlign:'center', padding:'48px 12px'}}>
                <Hanko p={p} text="届" size={72} top={'auto'} right={'auto'} rotate={-6}/>
                <h3 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:28, color:p.ink, marginTop:24, marginBottom:10}}>
                  {lang==='jp'?'届きました。':'Message sent.'}
                </h3>
                <p style={{fontFamily:'var(--fontBody)', fontSize:15, color:p.inkSoft, marginBottom:20}}>
                  {lang==='jp'?'数日以内にお返事します。':'We’ll get back to you within a few days.'}
                </p>
                <button onClick={()=>{ setSent(false); setForm({name:'',email:'',topic:'general',message:''}); }} style={{appearance:'none', border:`1px solid ${p.line}`, background:p.bg, color:p.ink, padding:'10px 20px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600}}>
                  {lang==='jp'?'もう一通送る':'Send another'}
                </button>
              </div>
            ) : (
              <>
                <div className="spa-g2" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14}}>
                  <Field p={p} label={lang==='jp'?'お名前':'Your name'}>
                    <input value={form.name} onChange={(e)=>set('name', e.target.value)} placeholder={lang==='jp'?'山田 太郎':'Jane Doe'} style={cInput(p)}/>
                  </Field>
                  <Field p={p} label={lang==='jp'?'メール':'Email'}>
                    <input value={form.email} onChange={(e)=>set('email', e.target.value)} placeholder="you@example.com" style={cInput(p)}/>
                  </Field>
                </div>
                <Field p={p} label={lang==='jp'?'ご用件':'Topic'}>
                  <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                    {topics.map(([k,label])=>(
                      <button key={k} onClick={()=>set('topic', k)} style={{
                        appearance:'none', cursor:'pointer', padding:'8px 14px', borderRadius:999,
                        border:`1px solid ${form.topic===k?p.ink:p.line}`, background: form.topic===k?p.ink:p.bg,
                        color: form.topic===k?p.surface:p.ink, fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600,
                      }}>{label}</button>
                    ))}
                  </div>
                </Field>
                <Field p={p} label={lang==='jp'?'メッセージ':'Message'}>
                  <textarea value={form.message} onChange={(e)=>set('message', e.target.value)} rows={6}
                    placeholder={lang==='jp'?'ご自由にどうぞ…':'Tell us what’s on your mind…'}
                    style={{...cInput(p), resize:'vertical', lineHeight:1.5}}/>
                </Field>
                <button disabled={!valid} onClick={()=>valid && setSent(true)}
                  style={{...window.gradStyle(p), width:'100%', justifyContent:'center', marginTop:8, opacity:valid?1:0.5}}>
                  {lang==='jp'?'送信する':'Send message'}
                </button>
              </>
            )}
          </div>

          {/* side info */}
          <div style={{display:'flex', flexDirection:'column', gap:24}}>
            <ContactItem p={p} lang={lang} k="一" en="Write for us" jp="寄稿する"
              body_en="Anyone can publish on nihon101. The fastest way in is to just start writing." 
              body_jp="nihon101は誰でも公開できます。いちばん早いのは、まず書きはじめること。"
              action={{label: lang==='jp'?'記事を書く':'Start a draft', route:{name:'compose'}}}/>
            <ContactItem p={p} lang={lang} k="二" en="Email" jp="メール"
              body_en="hello@nihon101.jp — for pitches, partnerships, and corrections."
              body_jp="hello@nihon101.jp — 寄稿・提携・訂正のご連絡はこちらへ。"/>
            <ContactItem p={p} lang={lang} k="三" en="Where we are" jp="所在地"
              body_en="A small desk in Tokyo, and writers scattered from Sapporo to Okinawa."
              body_jp="東京の小さな机と、札幌から沖縄まで散らばる書き手たち。"/>
            <div style={{padding:'18px 20px', borderRadius:16, background:p.tint, border:`1px solid ${p.line}`, fontFamily:'var(--fontBody)', fontSize:13, color:p.inkSoft, lineHeight:1.5}}>
              {lang==='jp'?'お返事まで数日いただくことがあります。急がず、ていねいに。':'Replies can take a few days. No rush, all care.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function Field({p, label, children}) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:'block', fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:7}}>{label}</label>
      {children}
    </div>
  );
}
function cInput(p) { return {width:'100%', border:`1px solid ${p.line}`, borderRadius:12, padding:'12px 14px', background:p.bg, fontFamily:'var(--fontBody)', fontSize:15, color:p.ink, outline:'none'}; }
function ContactItem({p, lang, k, en, jp, body_en, body_jp, action}) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'40px 1fr', gap:16}}>
      <div style={{fontFamily:'var(--fontDisplay)', fontSize:26, color:p.stamp, lineHeight:1, fontWeight:600}}>{k}</div>
      <div>
        <h4 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:18, color:p.ink, marginBottom:5}}>{lang==='jp'?jp:en}</h4>
        <p style={{fontFamily:'var(--fontBody)', fontSize:14, color:p.inkSoft, lineHeight:1.55, marginBottom:action?10:0}}>{lang==='jp'?body_jp:body_en}</p>
        {action && <button onClick={()=>window.__nihon_go(action.route)} style={{appearance:'none', border:`1px solid ${p.ink}`, background:'transparent', color:p.ink, padding:'8px 16px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600}}>{action.label}</button>}
      </div>
    </div>
  );
}

if (typeof window !== 'undefined') Object.assign(window, {
  ArticlePage, ArticleLoader, CategoryPage, SearchPage, AuthorPage, AboutPage, SavedPage,
  CommentSection, ShareIcon, relTime, PrivacyPage, ContactPage,
});
