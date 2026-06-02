// app.jsx — root, routing, theme, tweaks panel

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
      const h = window.location.hash;
      if (h && h.startsWith('#/')) return parseHash(h);
    } catch(e){}
    return { name: 'home' };
  });
  const [history, setHistory] = React.useState([]);
  const [lang, setLang] = React.useState(()=>{
    try { return localStorage.getItem('nihon.lang') || 'en'; } catch(e){ return 'en'; }
  });
  const [savedSet, setSavedSet] = React.useState(()=>{
    try { return new Set(JSON.parse(localStorage.getItem('nihon.saved') || '[]')); } catch(e){ return new Set(); }
  });
  const [claps, setClaps] = React.useState(()=>{
    try { return JSON.parse(localStorage.getItem('nihon.claps') || '{}'); } catch(e){ return {}; }
  });

  React.useEffect(()=>{ try{ localStorage.setItem('nihon.lang', lang);}catch(e){} }, [lang]);
  React.useEffect(()=>{ try{ localStorage.setItem('nihon.saved', JSON.stringify([...savedSet]));}catch(e){} }, [savedSet]);
  React.useEffect(()=>{ try{ localStorage.setItem('nihon.claps', JSON.stringify(claps));}catch(e){} }, [claps]);

  // Routing helpers
  const go = React.useCallback((r)=>{
    setHistory(h=>[...h, route]);
    setRoute(r);
    try { window.location.hash = serializeHash(r); } catch(e){}
    window.scrollTo({top:0});
  }, [route]);
  const back = React.useCallback(()=>{
    setHistory(h=>{
      if (h.length===0) { setRoute({name:'home'}); return []; }
      const last = h[h.length-1];
      setRoute(last);
      try { window.location.hash = serializeHash(last); } catch(e){}
      window.scrollTo({top:0});
      return h.slice(0,-1);
    });
  }, []);
  React.useEffect(()=>{
    window.__nihon_go = go;
    window.__nihon_back = back;
  }, [go, back]);

  // Active palette + font
  const p = window.PALETTES[t.palette] || window.PALETTES.hakuji;
  const f = window.FONT_PAIRINGS[t.font] || window.FONT_PAIRINGS.shippori;

  // CSS vars
  const cssVars = {
    '--fontDisplay': f.display,
    '--fontBody': f.body,
    '--fontMono': '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
  };

  const onLike = React.useCallback((slug)=>{
    setClaps(c=>({...c, [slug]: (c[slug]||0)+1}));
  }, []);
  const onSave = React.useCallback((slug)=>{
    setSavedSet(s=>{
      const ns = new Set(s);
      if (ns.has(slug)) ns.delete(slug); else ns.add(slug);
      return ns;
    });
  }, []);
  const onSearch = React.useCallback((q)=>{
    go({name:'search', q});
  }, [go]);

  // Body bg sync
  React.useEffect(()=>{
    document.body.style.background = p.bg;
    document.body.style.color = p.ink;
  }, [p]);

  // Render current screen
  let screen = null;
  if (route.name === 'home') {
    screen = <HomePage p={p} lang={lang} posts={window.NIHON_DATA.POSTS} t={t}
              savedSet={savedSet} likedMap={claps} onLike={onLike} onSave={onSave}/>;
  } else if (route.name === 'article') {
    const post = window.NIHON_DATA.POSTS.find(po=>po.slug===route.slug);
    if (post) {
      screen = <ArticlePage p={p} lang={lang} post={post} t={t} savedSet={savedSet} claps={claps} onClap={onLike} onSave={onSave}/>;
    } else {
      screen = <NotFound p={p} lang={lang}/>;
    }
  } else if (route.name === 'category') {
    screen = <CategoryPage p={p} lang={lang} slug={route.slug} t={t} savedSet={savedSet} onSave={onSave}/>;
  } else if (route.name === 'search') {
    screen = <SearchPage p={p} lang={lang} initialQuery={route.q || ''} t={t} savedSet={savedSet} onSave={onSave}/>;
  } else if (route.name === 'author') {
    screen = <AuthorPage p={p} lang={lang} slug={route.slug} t={t} savedSet={savedSet} onSave={onSave}/>;
  } else if (route.name === 'authors') {
    screen = <AuthorsPage p={p} lang={lang}/>;
  } else if (route.name === 'about') {
    screen = <AboutPage p={p} lang={lang}/>;
  } else if (route.name === 'saved') {
    screen = <SavedPage p={p} lang={lang} savedSet={savedSet} t={t} onSave={onSave}/>;
  } else if (route.name === 'write') {
    screen = <WriteStubPage p={p} lang={lang}/>;
  } else {
    screen = <NotFound p={p} lang={lang}/>;
  }

  return (
    <div style={{...cssVars, minHeight:'100vh', background:p.bg, color:p.ink}}>
      <Nav p={p} route={route} lang={lang} onLang={setLang}
           onSearch={onSearch} savedCount={savedSet.size}/>
      <main>{screen}</main>
      <Footer p={p} lang={lang}/>
      <NihonTweaks p={p} t={t} setTweak={setTweak}/>
    </div>
  );
}

function parseHash(h) {
  // #/article/slug, #/category/slug, #/author/slug, #/search?q=...
  const parts = h.slice(2).split('?');
  const path = parts[0].split('/');
  const qp = new URLSearchParams(parts[1] || '');
  if (path[0]==='') return {name:'home'};
  if (path[0]==='article' && path[1]) return {name:'article', slug:path[1]};
  if (path[0]==='category' && path[1]) return {name:'category', slug:path[1]};
  if (path[0]==='author' && path[1]) return {name:'author', slug:path[1]};
  if (path[0]==='authors') return {name:'authors'};
  if (path[0]==='about') return {name:'about'};
  if (path[0]==='saved') return {name:'saved'};
  if (path[0]==='search') return {name:'search', q: qp.get('q')||''};
  return {name:'home'};
}
function serializeHash(r) {
  if (r.name==='home') return '#/';
  if (r.name==='article') return `#/article/${r.slug}`;
  if (r.name==='category') return `#/category/${r.slug}`;
  if (r.name==='author') return `#/author/${r.slug}`;
  if (r.name==='authors') return '#/authors';
  if (r.name==='about') return '#/about';
  if (r.name==='saved') return '#/saved';
  if (r.name==='search') return r.q ? `#/search?q=${encodeURIComponent(r.q)}` : '#/search';
  return '#/';
}

function NotFound({p, lang}) {
  return (
    <div style={{...maxWrap(), padding:'120px 32px', textAlign:'center'}}>
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

function WriteStubPage({p, lang}) {
  return (
    <div style={{...maxWrap(), padding:'96px 32px'}}>
      <div style={{maxWidth:640, margin:'0 auto', padding:48, background:p.surface, border:`1px solid ${p.line}`, borderRadius:20, textAlign:'center', position:'relative'}}>
        <Hanko p={p} text="筆" size={80} top={-30} right={'auto'} rotate={-6}/>
        <h1 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:40, color:p.ink, marginTop:48, marginBottom:16, letterSpacing:'-0.02em'}}>
          {lang==='jp'?'書きはじめる':'Start a draft'}
        </h1>
        <p style={{fontFamily:'var(--fontBody)', fontSize:16, color:p.inkSoft, lineHeight:1.6, marginBottom:24}}>
          {lang==='jp'?'編集ページは現在準備中です。最初の一行を、ここに書いてみてください。':'The editor is on its way. For now, write the first line of your piece here:'}
        </p>
        <textarea placeholder={lang==='jp'?'「最初の一行を書く。」':'“The first line is the hardest.”'}
          style={{
            width:'100%', minHeight:140, border:`1px solid ${p.line}`, borderRadius:14,
            background:p.bg, padding:16, fontFamily:'var(--fontDisplay)', fontSize:18, color:p.ink,
            outline:'none', lineHeight:1.5, resize:'vertical',
          }}/>
        <button style={{marginTop:18, appearance:'none', border:'none', background:p.ink, color:p.surface, padding:'12px 24px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:14, fontWeight:600}}>
          {lang==='jp'?'下書きを保存':'Save draft'}
        </button>
      </div>
    </div>
  );
}

// ====== TWEAKS PANEL ======
function NihonTweaks({p, t, setTweak}) {
  const PALETTE_SWATCHES = Object.keys(window.PALETTES).map(k=>{
    const v = window.PALETTES[k];
    return [v.bg, v.surface2, v.accent, v.stamp];
  });
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Palette" />
      <TweakColor label="Theme"
        value={PALETTE_SWATCHES[Object.keys(window.PALETTES).indexOf(t.palette)]}
        options={PALETTE_SWATCHES}
        onChange={(v)=>{
          const idx = PALETTE_SWATCHES.findIndex(arr=>arr.join('|')===v.join('|'));
          if (idx>=0) setTweak('palette', Object.keys(window.PALETTES)[idx]);
        }}/>
      <TweakRadio label="Intensity" value={t.accentIntensity}
        options={['light','medium','heavy']}
        onChange={(v)=>setTweak('accentIntensity', v)}/>

      <TweakSection label="Typography" />
      <TweakSelect label="Headline font" value={t.font}
        options={Object.keys(window.FONT_PAIRINGS).map(k=>({value:k, label:window.FONT_PAIRINGS[k].label}))}
        onChange={(v)=>setTweak('font', v)}/>
      <TweakRadio label="Density" value={t.density}
        options={['cozy','regular','airy']}
        onChange={(v)=>setTweak('density', v)}/>

      <TweakSection label="Layout" />
      <TweakRadio label="Hero" value={t.heroLayout}
        options={['split','stack','magazine']}
        onChange={(v)=>setTweak('heroLayout', v)}/>
      <TweakRadio label="Cards" value={t.cardStyle}
        options={['clean','textured','outlined']}
        onChange={(v)=>setTweak('cardStyle', v)}/>

      <TweakSection label="Japanese accents" />
      <TweakToggle label="Hanko stamps" value={t.showHanko} onChange={(v)=>setTweak('showHanko', v)}/>
      <TweakToggle label="Vertical labels" value={t.showTategaki} onChange={(v)=>setTweak('showTategaki', v)}/>
    </TweaksPanel>
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
