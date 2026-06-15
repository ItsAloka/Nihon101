// social.jsx — auth, profile, composer, trending. Loads AFTER ui/home/screens.
import React from "react";
import "./ui.jsx";
import "./home.jsx";
import "./screens.jsx";
import FollowStats from "./FollowStats.jsx";
const { Photo, Avatar, CategoryChip, AuthorChip, gradStyle, Hanko,
        ArrowRight, ArrowLeft, HeartIcon, CommentIcon, PencilIcon,
        BookmarkIcon, TrendIcon, BellIcon } = window;
const ArticleCard = window.ArticleCard;
const SectionHeader = window.SectionHeader;

function wrap() { return {maxWidth:1320, margin:'0 auto', padding:'0 32px'}; }

const TINTS = ['rose','amber','blue','lilac','peach','sage','clay','mauve','sky'];
const COVER_HUES = ['rose','amber','blue','lilac','peach','sage','clay','mauve','sky','cream'];

// Demo accounts for quick sign-in
const DEMO_USERS = [
  { slug:'you',           en:'You',            jp:'あなた',      initials:'YOU', tint:'rose',  city:'—',        role:'Reader & writer',
    bio_en:'This is you. Edit your bio on your profile.', bio_jp:'これはあなたです。プロフィールで自己紹介を編集できます。', posts:0 },
  { slug:'emi-watanabe',  en:'Emi Watanabe',   jp:'渡辺 絵美',   initials:'EW', tint:'lilac', city:'Sapporo',  role:'Photographer',
    bio_en:'Photographer in Sapporo. I shoot snow, steam, and stray cats.', bio_jp:'札幌の写真家。雪と湯気と猫を撮る。', posts:3 },
  { slug:'leo-martin',    en:'Leo Martin',     jp:'レオ・マーティン', initials:'LM', tint:'sky', city:'Fukuoka', role:'Exchange student',
    bio_en:'French exchange student in Fukuoka, learning Japanese one konbini at a time.', bio_jp:'福岡の留学生。コンビニで日本語を学ぶ。', posts:1 },
];

// ====== LOGIN MODAL ======
const T = (lang, en, jp) => (lang === 'jp' ? jp : en);
const AUTH_ERRORS = {
  invalid_email: ['Enter a valid email.', '有効なメールアドレスを入力してください。'],
  weak_password: ['Password must be at least 8 characters.', 'パスワードは8文字以上で入力してください。'],
  email_taken: ['That email is already registered.', 'このメールアドレスは登録済みです。'],
  invalid_credentials: ['Wrong email or password.', 'メールアドレスかパスワードが違います。'],
};
const authError = (code, lang) => T(lang, ...(AUTH_ERRORS[code] || ['Something went wrong. Try again.', '問題が発生しました。もう一度お試しください。']));

function LoginModal({ p, lang, onLogin, onClose }) {
  const [mode, setMode] = React.useState('login'); // login | register
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const isReg = mode === 'register';

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr(''); setBusy(true);
    try {
      const api = window.N101_API;
      const u = isReg
        ? await api.register(email.trim(), password, name.trim())
        : await api.login(email.trim(), password);
      onLogin(api.toAppUser(u, window.__currentUser));
    } catch (ex) {
      setErr(authError(ex.code, lang));
      setBusy(false);
    }
  };

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:60, display:'flex', alignItems:'center', justifyContent:'center',
      background:'rgba(20,14,20,0.45)', backdropFilter:'blur(4px)', padding:20,
    }} onClick={onClose}>
      <div onClick={(e)=>e.stopPropagation()} style={{
        width:'100%', maxWidth:440, background:p.surface, borderRadius:24, overflow:'hidden',
        border:`1px solid ${p.line}`, boxShadow:'0 40px 80px -30px rgba(0,0,0,0.5)', position:'relative',
      }}>
        {/* header */}
        <div style={{padding:'32px 32px 24px', background:`linear-gradient(135deg, ${p.tint}, color-mix(in oklab, ${p.tint} 50%, ${p.surface}))`, position:'relative', overflow:'hidden'}}>
          <Hanko p={p} text="入" size={70} top={20} right={26} rotate={-8}/>
          <div style={{display:'inline-flex', alignItems:'center', marginBottom:14}}>
            <span style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:24, color:p.ink, letterSpacing:'-0.02em', display:'inline-flex', alignItems:'center'}}>
              {lang==='jp' ? '日本' : 'nihon'}
              <span style={{color:p.stamp, display:'inline-flex', alignItems:'center', letterSpacing:0, marginLeft: lang==='jp' ? 2 : 0}}>
                1
                <span aria-hidden="true" style={{display:'inline-block', width:14, height:14, borderRadius:'50%', background:p.stamp, margin:'0 1px'}}></span>
                1
              </span>
            </span>
          </div>
          <h2 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:26, color:p.ink, letterSpacing:'-0.02em', lineHeight:1.1}}>
            {isReg ? T(lang,'Create your account','アカウントを作成') : T(lang,'Welcome back','おかえりなさい')}
          </h2>
          <p style={{fontFamily:'var(--fontBody)', fontSize:14, color:p.inkSoft, marginTop:6}}>
            {isReg ? T(lang,'Join to write, like, and share.','登録して、書いて、共有しよう。') : T(lang,'Sign in to write, like, and share.','ログインして、書いて、共有しよう。')}
          </p>
        </div>

        <div style={{padding:'24px 32px 32px'}}>
          {/* tabs */}
          <div style={{display:'flex', gap:24, marginBottom:20}}>
            {['login','register'].map(m=>(
              <button key={m} onClick={()=>{ setMode(m); setErr(''); }} style={{
                appearance:'none', border:'none', background:'transparent', cursor:'pointer', padding:'0 0 8px',
                fontFamily:'var(--fontBody)', fontSize:14, fontWeight:600, position:'relative',
                color: mode===m ? p.ink : p.inkFaint,
              }}>
                {m==='login' ? T(lang,'Sign in','ログイン') : T(lang,'Create account','新規登録')}
                {mode===m && <span style={{position:'absolute', left:0, right:0, bottom:0, height:3, borderRadius:3, background:p.accentDeep}}/>}
              </button>
            ))}
          </div>

          {/* google */}
          <button onClick={()=>{ window.location.href = window.N101_API.googleStartUrl(lang); }} style={{
            width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10, cursor:'pointer',
            border:`1px solid ${p.line}`, background:p.surface, borderRadius:12, padding:'12px',
            fontFamily:'var(--fontBody)', fontSize:14, fontWeight:600, color:p.ink,
          }}
          onMouseEnter={(e)=>e.currentTarget.style.borderColor=p.inkFaint}
          onMouseLeave={(e)=>e.currentTarget.style.borderColor=p.line}>
            <GoogleMark/>{T(lang,'Continue with Google','Googleで続ける')}
          </button>

          <div style={{display:'flex', alignItems:'center', gap:12, color:p.inkFaint, fontFamily:'var(--fontMono)', fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', margin:'16px 0'}}>
            <span style={{height:1, flex:1, background:p.line}}/>{T(lang,'or','または')}<span style={{height:1, flex:1, background:p.line}}/>
          </div>

          <form onSubmit={submit}>
            <label style={fieldLabel(p)}>{T(lang,'Email','メールアドレス')}</label>
            <input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" autoFocus autoComplete="email"
              placeholder="you@example.com" style={fieldInput(p)}/>

            {isReg && <>
              <label style={{...fieldLabel(p), marginTop:14}}>{T(lang,'Display name','お名前')}</label>
              <input value={name} onChange={(e)=>setName(e.target.value)} autoComplete="name"
                placeholder={T(lang,'Mio Tanaka','山田 太郎')} style={fieldInput(p)}/>
            </>}

            <label style={{...fieldLabel(p), marginTop:14}}>{T(lang,'Password','パスワード')}</label>
            <div style={{position:'relative', display:'flex', alignItems:'center'}}>
              <input value={password} onChange={(e)=>setPassword(e.target.value)} type={showPw?'text':'password'}
                autoComplete={isReg?'new-password':'current-password'} placeholder="••••••••"
                style={{...fieldInput(p), paddingRight:44}}/>
              <button type="button" onClick={()=>setShowPw(s=>!s)} aria-label={showPw?'Hide password':'Show password'}
                style={{position:'absolute', right:6, width:34, height:34, display:'grid', placeItems:'center',
                  appearance:'none', border:'none', background:'transparent', cursor:'pointer', color:p.inkFaint, borderRadius:9}}>
                <EyeIcon off={showPw}/>
              </button>
            </div>

            {err && <div style={{marginTop:12, fontFamily:'var(--fontBody)', fontSize:13, color:p.stamp}}>{err}</div>}

            <button type="submit" disabled={busy}
              style={{...gradStyle(p), width:'100%', justifyContent:'center', marginTop:20, opacity:busy?0.6:1}}>
              {busy ? T(lang,'Please wait…','少々お待ちください…') : (isReg ? T(lang,'Create account','アカウントを作成') : T(lang,'Sign in','ログイン'))}
            </button>
          </form>

          <p style={{fontFamily:'var(--fontBody)', fontSize:13, color:p.inkFaint, textAlign:'center', marginTop:18}}>
            {isReg ? T(lang,'Already have an account? ','すでにアカウントをお持ちですか？ ') : T(lang,'New to nihon101? ','nihon101は初めてですか？ ')}
            <button onClick={()=>{ setMode(isReg?'login':'register'); setErr(''); }} style={{
              appearance:'none', border:'none', background:'transparent', cursor:'pointer',
              fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, color:p.accentDeep, padding:0,
            }}>{isReg ? T(lang,'Sign in','ログイン') : T(lang,'Create one','登録する')}</button>
          </p>
        </div>
      </div>
    </div>
  );
}
function fieldLabel(p){ return {display:'block', fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6}; }
function fieldInput(p){ return {width:'100%', border:`1px solid ${p.line}`, borderRadius:12, padding:'12px 14px', background:p.bg, fontFamily:'var(--fontBody)', fontSize:15, color:p.ink, outline:'none'}; }
function GoogleMark(){ return (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.2 13.5 17.6 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.9 7.2l7.6 5.9c4.4-4.1 7.1-10.1 7.1-17.6z"/>
    <path fill="#FBBC05" d="M10.4 28.3c-.5-1.4-.8-2.9-.8-4.3s.3-3 .8-4.3l-7.8-6.1C.9 16.7 0 20.2 0 24s.9 7.3 2.6 10.4l7.8-6.1z"/>
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.4 0-11.8-4-13.6-9.7l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
  </svg>
); }
function EyeIcon({ off }){ return off ? (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
); }

// ====== COMPOSER (bilingual, TipTap, backend-wired) ======
function ghostBtn(p){ return {appearance:'none', border:`1px solid ${p.line}`, background:p.surface, color:p.ink, padding:'10px 16px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, display:'inline-flex', alignItems:'center', gap:8}; }

// Strip HTML tags → plain text (word count + auto-excerpt source).
function htmlToText(html){ const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent || ''; }

// Length caps — mirror the backend (routes/posts.ts) so what the writer sees is
// exactly what the server will accept.
const MAX_TITLE = 300;
const MAX_EXCERPT = 600;
const MAX_BODY = 200_000;

// Small mono "n/max" counter; turns to the red stamp accent past 90%.
function CharCount({ p, n, max, suffix }){
  return (
    <div style={{fontFamily:'var(--fontMono)', fontSize:11, color: n > max*0.9 ? p.stamp : p.inkFaint, marginBottom:8}}>
      {n}/{max}{suffix ? ` · ${suffix}` : ''}
    </div>
  );
}

function ComposerPage({ p, lang, currentUser, editId }) {
  const Editor = window.NihonEditor;
  // Single source language for the whole post. Fixed from the site language at
  // mount (or the post's own language when editing). The OTHER language is
  // machine-generated in the background on Publish — no tabs, no button.
  const [blogLang, setBlogLang] = React.useState(lang==='jp' ? 'ja' : 'en');
  const [postId, setPostId] = React.useState(null);
  const [title, setTitle] = React.useState('');
  const [excerpt, setExcerpt] = React.useState('');
  const [bodyHtml, setBodyHtml] = React.useState('');
  const other = React.useRef({ title:'', excerpt:'', body:'' }); // preserved opposite locale (edit)
  const [cat, setCat] = React.useState('culture');
  const [cover, setCover] = React.useState(null);
  const [coverLabel, setCoverLabel] = React.useState('');
  const [coverCredit, setCoverCredit] = React.useState('');
  const [tags, setTags] = React.useState([]);
  const [tagInput, setTagInput] = React.useState('');
  const [density, setDensity] = React.useState('compact');
  const { cats, refresh: refreshCats } = window.useCategories();
  const [catSearch, setCatSearch] = React.useState('');
  const [catBusy, setCatBusy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [savedStatus, setSavedStatus] = React.useState('draft');
  const [status, setStatus] = React.useState('');   // inline status line
  const [confirmDel, setConfirmDel] = React.useState(false);
  const coverFileRef = React.useRef(null);
  const edApi = React.useRef(null);
  const [edReady, setEdReady] = React.useState(false); // editor mounted → safe to load content
  const savingRef = React.useRef(false);
  const lastTranslated = React.useRef(''); // snapshot of source at last GPT translate (dirty-check)
  const ja = blogLang==='ja';

  const bodyText = htmlToText(bodyHtml);
  const words = bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0;
  const readMins = Math.max(1, Math.round(words/200));
  const hasContent = !!title.trim();
  const canPublish = hasContent && !!cat && !!bodyText.trim();

  // Category picker: top categories by post_count + search-to-find + create-new.
  const TOP_N = 7;
  const q = catSearch.trim().toLowerCase();
  const matches = (c) => (c.labelEn||'').toLowerCase().includes(q) || (c.labelJa||'').toLowerCase().includes(q);
  const exactMatch = !!q && cats.some((c) => (c.labelEn||'').toLowerCase()===q || (c.labelJa||'').toLowerCase()===q);
  // Searching → all matches; idle → the busiest TOP_N. Always keep the selected
  // chip visible even if it isn't in the top slice.
  let shownCats = q ? cats.filter(matches) : cats.slice(0, TOP_N);
  if (!q && cat && !shownCats.some((c) => c.id===cat)) {
    const sel = cats.find((c) => c.id===cat);
    if (sel) shownCats = [sel, ...shownCats];
  }
  const createCat = async () => {
    const label = catSearch.trim();
    if (!label || catBusy) return;
    setCatBusy(true);
    try {
      const created = await window.N101_CONTENT.categoryApi.create({
        labelEn: label, labelJa: label, kanji: label.slice(0, 1).toUpperCase(),
      });
      await refreshCats();
      setCat(created.id);
      setCatSearch('');
    } catch { setStatus('Could not create category'); }
    finally { setCatBusy(false); }
  };

  // Edit mode: load an existing (owner) post once, in the SITE language — the
  // side you open is the side you edit (both-way). Fall back to the authored
  // side when the site-language side is empty, so the editor is never blank
  // (and we never translate an empty source over the real text).
  React.useEffect(()=>{
    if (!editId || postId || !edReady || !edApi.current) return;
    window.N101_CONTENT.postApi.get(editId).then(po=>{
      const site = lang==='jp' ? 'ja' : 'en';
      const siteEmpty = !((site==='ja' ? po.titleJa : po.titleEn) || (site==='ja' ? po.bodyJa : po.bodyEn));
      const L = siteEmpty ? (po.lang==='ja' ? 'ja' : 'en') : site;
      setBlogLang(L);
      setPostId(po.id);
      setTitle(L==='ja' ? po.titleJa : po.titleEn);
      setExcerpt(L==='ja' ? po.excerptJa : po.excerptEn);
      const body = L==='ja' ? po.bodyJa : po.bodyEn;
      setBodyHtml(body);
      other.current = L==='ja'
        ? { title: po.titleEn, excerpt: po.excerptEn, body: po.bodyEn }
        : { title: po.titleJa, excerpt: po.excerptJa, body: po.bodyJa };
      setCat(po.categoryId); setCover(po.cover); setTags(po.tags||[]);
      setCoverLabel(po.coverLabel||''); setCoverCredit(po.coverCredit||'');
      setDensity(po.density||'compact'); setSavedStatus(po.status);
      edApi.current.setHTML(body);
    }).catch(()=>setStatus('Could not load that post'));
  }, [editId, edReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const onEditorChange = React.useCallback((html)=>{ setBodyHtml(html); }, []);

  const onCoverFile = async (e)=>{
    const f = e.target.files?.[0]; e.target.value='';
    if (!f) return;
    try { setCover(await window.N101_CONTENT.uploadImage(f)); }
    catch { setStatus('Cover upload failed — try a smaller file'); }
  };
  const addTag = (e)=>{
    if (e.key==='Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  // Map the single source language onto the bilingual columns. The opposite
  // locale keeps whatever was there (preserved on edit) — Publish refills it.
  const buildPayload = (st, translate)=>{
    const liveBody = edApi.current ? edApi.current.getHTML() : bodyHtml;
    const ex = excerpt.trim() || htmlToText(liveBody).replace(/\s+/g,' ').trim().slice(0,160);
    const o = other.current;
    const base = {
      categoryId: cat, cover, coverLabel: coverLabel.trim(), coverCredit: coverCredit.trim(),
      status: st, density, score: null, tags,
      lang: blogLang, translate: !!translate,
    };
    return ja
      ? { ...base, titleJa: title.trim(), excerptJa: ex, bodyJa: liveBody,
          titleEn: o.title, excerptEn: o.excerpt, bodyEn: o.body }
      : { ...base, titleEn: title.trim(), excerptEn: ex, bodyEn: liveBody,
          titleJa: o.title, excerptJa: o.excerpt, bodyJa: o.body };
  };

  const save = async (st)=>{
    if (busy) return;
    if (!hasContent || !cat) { setStatus('Add a title and pick a category first'); return; }
    if (st==='published' && !canPublish) { setStatus('Write a body before publishing'); return; }
    setBusy(true); setStatus(st==='published'?'Publishing…':'Saving…');
    try {
      // Manual save (draft OR publish) translates — but only if the source text
      // changed since the last translation (dirty-check); rapid clicks cost nothing.
      const liveBody = edApi.current ? edApi.current.getHTML() : bodyHtml;
      const snap = JSON.stringify({ title: title.trim(), excerpt: excerpt.trim(), body: liveBody });
      const dirty = snap !== lastTranslated.current;
      const payload = buildPayload(st, dirty);
      const po = postId ? await window.N101_CONTENT.postApi.update(postId, payload)
                        : await window.N101_CONTENT.postApi.create(payload);
      if (dirty) lastTranslated.current = snap;
      setPostId(po.id); setSavedStatus(st);
      refreshCats();   // publish/unpublish/move changed post_count — refresh the badges
      if (st==='published') window.__nihon_go({name:'profile'});
      else setStatus('Draft saved');
    } catch (e) { setStatus('Save failed — ' + (e.code || 'try again')); }
    finally { setBusy(false); }
  };

  const doDelete = async ()=>{
    if (!postId || busy) return;
    setBusy(true);
    try { await window.N101_CONTENT.postApi.remove(postId); refreshCats(); window.__nihon_go({name:'profile'}); }
    catch { setBusy(false); setStatus('Delete failed — try again'); }
  };

  // Autosave (2s) as a DRAFT — never translates (keeps the current status,
  // never flips a live post, so editing never re-burns the API).
  React.useEffect(()=>{
    if (!hasContent || !cat) return;
    if (!postId && !bodyText.trim()) return;
    const tmr = setTimeout(async ()=>{
      if (savingRef.current || busy) return;
      savingRef.current = true; setStatus('Saving…');
      try {
        const payload = buildPayload(savedStatus, false);
        const po = postId ? await window.N101_CONTENT.postApi.update(postId, payload)
                          : await window.N101_CONTENT.postApi.create(payload);
        setPostId(po.id); setStatus('Saved');
      } catch { setStatus(''); }
      finally { savingRef.current = false; }
    }, 2000);
    return ()=>clearTimeout(tmr);
  }, [title, excerpt, bodyHtml, cover, coverLabel, coverCredit, density, tags, cat]); // eslint-disable-line react-hooks/exhaustive-deps

  const densityLabel = density==='compact'?'Compact':density==='normal'?'Normal':'Relaxed';
  const cycleDensity = ()=> setDensity(d=> d==='compact'?'normal':d==='normal'?'relaxed':'compact');

  return (
    <div style={{...wrap(), paddingTop:24, paddingBottom:60}}>
      {/* top bar */}
      <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:18}}>
        <button onClick={()=>window.__nihon_go({name:'home'})} style={ghostBtn(p)}><ArrowLeft color={p.inkSoft}/> {lang==='jp'?'破棄':'Discard'}</button>
        <span style={{fontFamily:'var(--fontMono)', fontSize:12, color:p.inkFaint, marginLeft:6}}>
          {words} {lang==='jp'?'語':'words'} · {readMins} min{status?` · ${status}`:''}
        </span>
        <div style={{marginLeft:'auto', display:'flex', gap:10, alignItems:'center'}}>
          {postId && <button disabled={busy} onClick={()=>setConfirmDel(true)} style={{...ghostBtn(p), color:'#c0392b', borderColor:'#e6b3ab'}}>{lang==='jp'?'削除':'Delete'}</button>}
          <button disabled={busy} onClick={()=>save('draft')} style={ghostBtn(p)}>{lang==='jp'?'下書き保存':'Save draft'}</button>
          <button disabled={!canPublish||busy} onClick={()=>save('published')}
            style={{...gradStyle(p), padding:'11px 22px', fontSize:14, opacity:canPublish&&!busy?1:0.5}}>
            {lang==='jp'?'公開する':'Publish'}
          </button>
        </div>
      </div>

      <div style={{maxWidth:840, margin:'0 auto'}}>
        {/* language notice (density now lives in the editor toolbar) */}
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:18}}>
          <span style={{display:'inline-flex', alignItems:'center', gap:8, padding:'7px 14px', borderRadius:999, background:p.surface, border:`1px solid ${p.line}`, fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, color:p.ink}}>
            <span style={{color:p.stamp}}>✎</span>
            {ja ? '日本語で執筆中' : 'Writing in English'}
            <span style={{color:p.inkFaint, fontWeight:400}}>· {ja ? '英語版は公開時に自動生成' : 'auto-translated on publish'}</span>
          </span>
        </div>

        {/* cover */}
        <div onClick={()=>coverFileRef.current?.click()} style={{
          height:240, borderRadius:18, marginBottom:18, cursor:'pointer', overflow:'hidden',
          border:`1px dashed ${p.line}`, background:p.surface, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <input ref={coverFileRef} type="file" accept="image/*" hidden onChange={onCoverFile}/>
          {cover ? <img src={cover} alt="cover" style={{width:'100%', height:'100%', objectFit:'cover'}}/>
            : <span style={{fontFamily:'var(--fontMono)', fontSize:12, color:p.inkFaint, letterSpacing:'0.1em'}}>{lang==='jp'?'表紙画像を選ぶ — 21:9 推奨':'DROP COVER ART — 21:9 RECOMMENDED'}</span>}
        </div>

        {/* cover caption — the PHOTO tag shown on the image + the credit line under it */}
        <div style={{display:'flex', gap:10, marginBottom:22, flexWrap:'wrap'}}>
          <input value={coverLabel} onChange={(e)=>setCoverLabel(e.target.value)}
            placeholder={lang==='jp'?'写真キャプション（例：「君の名は。」より）':'Photo caption — e.g. still from Your Name'}
            style={{flex:'1 1 240px', height:38, padding:'0 12px', border:`1px solid ${p.line}`, borderRadius:9, background:p.bg, color:p.ink, outline:'none', fontFamily:'var(--fontMono)', fontSize:12, letterSpacing:'0.04em'}}/>
          <input value={coverCredit} onChange={(e)=>setCoverCredit(e.target.value)}
            placeholder={lang==='jp'?'クレジット（例：© CoMix Wave Films）':'Credit — e.g. © CoMix Wave Films'}
            style={{flex:'1 1 240px', height:38, padding:'0 12px', border:`1px solid ${p.line}`, borderRadius:9, background:p.bg, color:p.ink, outline:'none', fontFamily:'var(--fontMono)', fontSize:12, letterSpacing:'0.04em'}}/>
        </div>

        {/* category — busiest first; search to find any, or create a new one */}
        <div style={{marginBottom:22}}>
          <input value={catSearch} onChange={(e)=>setCatSearch(e.target.value)}
            placeholder={lang==='jp'?'カテゴリーを検索、または新規作成…':'Search a category, or type a new one…'}
            style={{width:'100%', maxWidth:360, height:38, padding:'0 14px', marginBottom:12,
              border:`1px solid ${p.line}`, borderRadius:10, background:p.bg, color:p.ink, outline:'none',
              fontFamily:'var(--fontBody)', fontSize:14}}/>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            {shownCats.map(c=>(
              <button key={c.id} onClick={()=>setCat(c.id)} style={{
                appearance:'none', cursor:'pointer', padding:'7px 13px', borderRadius:999,
                border:`1px solid ${cat===c.id?p.ink:p.line}`,
                background: cat===c.id?p.ink:p.surface, color: cat===c.id?p.surface:p.ink,
                fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, display:'inline-flex', gap:7, alignItems:'center'}}>
                <span style={{color: cat===c.id?p.surface:p.stamp, fontFamily:'var(--fontDisplay)'}}>{c.kanji}</span>
                {lang==='jp'?c.labelJa:c.labelEn}
                <span style={{fontFamily:'var(--fontMono)', fontSize:11, fontWeight:500,
                  color: cat===c.id?p.surface:p.inkFaint, opacity:0.8}}>{c.postCount ?? 0}</span>
              </button>
            ))}
            {q && !exactMatch && (
              <button onClick={createCat} disabled={catBusy} style={{
                appearance:'none', cursor:catBusy?'default':'pointer', padding:'7px 13px', borderRadius:999,
                border:`1px dashed ${p.stamp}`, background:p.surface, color:p.stamp,
                fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, display:'inline-flex', gap:6, alignItems:'center'}}>
                ＋ {lang==='jp'?`「${catSearch.trim()}」を作成`:`Create “${catSearch.trim()}”`}
              </button>
            )}
            {!q && shownCats.length===0 && (
              <span style={{fontFamily:'var(--fontMono)', fontSize:12, color:p.inkFaint}}>{lang==='jp'?'読み込み中…':'Loading…'}</span>
            )}
          </div>
        </div>

        {/* title */}
        <textarea value={title} maxLength={MAX_TITLE} onChange={(e)=>setTitle(e.target.value.slice(0, MAX_TITLE))} rows={2}
          placeholder={ja?'タイトルを書く':'Title your story'}
          style={{width:'100%', border:'none', outline:'none', background:'transparent', resize:'none',
            fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(32px,4vw,50px)',
            lineHeight:1.05, letterSpacing:'-0.025em', color:p.ink, marginBottom:8}}/>
        <CharCount p={p} n={title.length} max={MAX_TITLE}/>
        {/* excerpt */}
        <input value={excerpt} maxLength={MAX_EXCERPT} onChange={(e)=>setExcerpt(e.target.value.slice(0, MAX_EXCERPT))}
          placeholder={ja?'リード文（短い要約）':'A short standfirst / summary'}
          style={{width:'100%', border:'none', outline:'none', background:'transparent',
            fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:20, color:p.inkSoft, marginBottom:8}}/>
        <div style={{marginBottom:20, paddingBottom:20, borderBottom:`1px solid ${p.line}`}}>
          <CharCount p={p} n={excerpt.length} max={MAX_EXCERPT}/>
        </div>

        {/* rich body */}
        <Editor p={p} onChange={onEditorChange} onReady={(api)=>{ edApi.current = api; setEdReady(true); }}
          density={density} densityLabel={densityLabel} onCycleDensity={cycleDensity}/>
        {/* body length + word count */}
        {(()=>{ const words = htmlToText(bodyHtml).trim().split(/\s+/).filter(Boolean).length;
          return <div style={{marginTop:10}}><CharCount p={p} n={bodyHtml.length} max={MAX_BODY}
            suffix={`${words} ${ja?'語':words===1?'word':'words'}`}/></div>; })()}

        {/* tags */}
        <div style={{marginTop:24}}>
          <label style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.1em', textTransform:'uppercase'}}>{lang==='jp'?'タグ':'Tags'}</label>
          <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginTop:8}}>
            {tags.map(tg=>(
              <span key={tg} style={{display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:999, background:p.surface, border:`1px solid ${p.line}`, fontFamily:'var(--fontBody)', fontSize:13, color:p.ink}}>
                #{tg}
                <button onClick={()=>setTags(tags.filter(x=>x!==tg))} style={{appearance:'none', border:'none', background:'transparent', cursor:'pointer', color:p.inkFaint}}>✕</button>
              </span>
            ))}
            <input value={tagInput} onChange={(e)=>setTagInput(e.target.value)} onKeyDown={addTag}
              placeholder={lang==='jp'?'タグ + Enter':'Add tag + Enter'}
              style={{width:200, height:34, padding:'0 12px', border:`1px solid ${p.line}`, borderRadius:9, background:p.bg, color:p.ink, outline:'none', fontFamily:'var(--fontBody)'}}/>
          </div>
        </div>
      </div>

      {confirmDel && (
        <div onClick={()=>!busy&&setConfirmDel(false)} style={{position:'fixed', inset:0, background:'rgba(0,0,0,.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50}}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:p.surface, borderRadius:18, padding:28, maxWidth:420, border:`1px solid ${p.line}`}}>
            <h3 style={{fontFamily:'var(--fontDisplay)', fontSize:20, fontWeight:700, color:p.ink}}>{lang==='jp'?'この記事を削除しますか？':'Delete this post?'}</h3>
            <p style={{color:p.inkSoft, fontSize:14.5, lineHeight:1.6, marginTop:10, fontFamily:'var(--fontBody)'}}>{lang==='jp'?'この操作は取り消せません。':"This can't be undone."}</p>
            <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:22}}>
              <button disabled={busy} onClick={()=>setConfirmDel(false)} style={ghostBtn(p)}>{lang==='jp'?'キャンセル':'Cancel'}</button>
              <button disabled={busy} onClick={doDelete} style={{...ghostBtn(p), background:'#c0392b', color:'#fff', border:'none'}}>{lang==='jp'?'削除':'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====== PROFILE (current user) ======
// Card for a real backend-authored post. Opens the post in reading mode on click.
function MyPostCard({ p, lang, post, onChanged }) {
  const title = (lang==='jp' ? post.titleJa : post.titleEn) || post.titleEn || post.titleJa || (lang==='jp'?'無題':'Untitled');
  const excerpt = (lang==='jp' ? post.excerptJa : post.excerptEn) || '';
  // Resolve the category from the live table (covers user-created ones); fall
  // back to the seed list, then the raw id.
  const live = window.useCategories().byId(post.categoryId);
  const seed = window.NIHON_DATA.CATEGORIES.find(c=>c.slug===post.categoryId);
  const cat = live
    ? { label: lang==='jp' ? live.labelJa : live.labelEn, tint: live.tint }
    : seed ? { label: lang==='jp' ? seed.jp : seed.en, tint: seed.tint } : null;
  const tint = cat?.tint || 'rose';
  const kanji = (live && live.kanji) || (seed && seed.kanji) || '';
  const [c1,c2] = window.tintGradient ? window.tintGradient(tint) : ['#eee','#ddd'];
  const me = window.__currentUser || { en:'', jp:'', initials:'?', tint:'rose', avatarUrl:null };
  const when = post.publishedAt ?? post.createdAt;
  const dateStr = when ? new Date(when).toLocaleDateString(lang==='jp'?'ja-JP':'en-US', { year:'numeric', month:'short', day:'numeric' }) : '';
  const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean).slice(0,3) : [];
  // Clicking the card opens the post in reading mode (where the owner gets
  // Edit/Delete). No actions on the card itself.
  const open = ()=> window.__nihon_go({name:'article', slug: post.slug});
  return (
    <div onClick={open} style={{position:'relative', borderRadius:22, border:`1.5px solid ${p.line}`, background:p.surface, padding:14, display:'flex', flexDirection:'column', gap:12, cursor:'pointer', transition:'transform .25s ease, border-color .25s ease, box-shadow .25s ease'}}
      onMouseEnter={(e)=>{ e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.borderColor=`color-mix(in oklab, ${p.accent} 55%, ${p.line})`; e.currentTarget.style.boxShadow=`0 18px 30px -22px color-mix(in oklab, ${p.accentDeep} 45%, transparent)`; }}
      onMouseLeave={(e)=>{ e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.borderColor=p.line; e.currentTarget.style.boxShadow='none'; }}>
      <div style={{position:'relative', height:200, borderRadius:14, overflow:'hidden', background: post.cover?undefined:`linear-gradient(135deg, ${c1}, ${c2})`}}>
        {post.status==='draft' && <span style={{position:'absolute', top:10, left:10, zIndex:2, background:p.ink, color:p.surface, fontFamily:'var(--fontMono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', padding:'4px 8px', borderRadius:999}}>{lang==='jp'?'下書き':'draft'}</span>}
        {post.cover && <img src={post.cover} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}}/>}
      </div>
      <div style={{padding:'0 4px', display:'flex', flexDirection:'column', gap:10, flex:1}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <span style={{display:'inline-flex', alignItems:'center', gap:6, padding:'4px 11px', borderRadius:999, fontSize:11, fontWeight:600, letterSpacing:'0.04em', textTransform:'uppercase', border:`1px solid ${p.line}`, background:p.surface, color:p.ink}}>
            {kanji && <span style={{fontFamily:'var(--fontDisplay)', color:p.stamp, textTransform:'none', letterSpacing:0}}>{kanji}</span>}
            {cat ? cat.label : post.categoryId}
          </span>
          <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint}}>{post.readMins || 1} min</span>
        </div>
        <h3 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:21, lineHeight:1.18, letterSpacing:'-0.015em', color:p.ink, textWrap:'pretty'}}>{title}</h3>
        {excerpt && <p style={{fontFamily:'var(--fontBody)', fontSize:14, color:p.inkSoft, lineHeight:1.55, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden'}}>{excerpt}</p>}
        {tags.length>0 && (
          <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
            {tags.map(tg=>(
              <span key={tg} style={{display:'inline-flex', alignItems:'center', gap:1, padding:'3px 9px', borderRadius:999, border:`1px solid ${p.line}`, background:p.surface, fontSize:11, fontWeight:500, color:p.inkSoft}}>
                <span style={{color:p.accent, fontWeight:800}}>#</span>{tg}
              </span>
            ))}
          </div>
        )}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginTop:'auto', paddingTop:12, borderTop:`1px solid ${p.line}`}}>
          <div style={{display:'flex', alignItems:'center', gap:8, minWidth:0}}>
            <span style={{width:26, height:26, borderRadius:'50%', flexShrink:0, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:11, color:'#3a2e28', background:`linear-gradient(135deg, ${window.tintBg(me.tint, p)}, ${p.surface2})`, border:`1px solid ${p.line}`}}>
              {me.avatarUrl ? <img src={me.avatarUrl} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}}/> : me.initials}
            </span>
            <span style={{minWidth:0}}>
              <span style={{display:'block', fontFamily:'var(--fontBody)', fontSize:12.5, fontWeight:600, color:p.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{lang==='jp'?me.jp:me.en}</span>
              <span style={{display:'block', fontFamily:'var(--fontBody)', fontSize:11, color:p.inkFaint}}>{dateStr}</span>
            </span>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:14, flexShrink:0}}>
            <span style={{display:'inline-flex', alignItems:'center', gap:5, fontFamily:'var(--fontMono)', fontSize:12.5, fontWeight:600, color:p.inkSoft}}>
              <HeartIcon color={p.stamp} filled size={15}/> {(post.likes||0).toLocaleString()}
            </span>
            <span style={{display:'inline-flex', alignItems:'center', gap:5, fontFamily:'var(--fontMono)', fontSize:12.5, fontWeight:600, color:p.inkSoft}}>
              <CommentIcon color={p.inkFaint} size={15}/> {(post.comments||0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfilePage({ p, lang, user, t, savedSet, onSave, onUpdateUser, claps, comments }) {
  // Saved posts (slugs in localStorage) resolved to real, card-ready posts.
  const [saved, setSaved] = React.useState([]);
  const savedKey = [...savedSet].sort().join(',');
  React.useEffect(()=>{
    let live = true;
    const slugs = savedKey ? savedKey.split(',') : [];
    if (!slugs.length) { setSaved([]); return; }
    const { postApi, hydrateReal } = window.N101_CONTENT;
    Promise.all(slugs.map(s=>postApi.getBySlug(s).then(hydrateReal).catch(()=>null)))
      .then(rows=>{ if(live) setSaved(rows.filter(Boolean).map(po=>({ ...po, cover: { hue: (window.N101_CATS?.byId(po.category)?.tint) || 'cream', label: po._coverLabel || '', src: po._cover || null } }))); });
    return ()=>{ live=false; };
  }, [savedKey]);
  const [myPosts, setMyPosts] = React.useState([]);
  const refreshMine = React.useCallback(()=>{
    window.N101_CONTENT.postApi.list({status:'mine'}).then(setMyPosts).catch(()=>{});
  }, []);
  React.useEffect(()=>{ refreshMine(); }, [refreshMine]);
  const published = myPosts.filter(po=>po.status==='published');
  const drafts = myPosts.filter(po=>po.status==='draft');
  const [tab, setTab] = React.useState('published');
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(user.en);
  const [nameJa, setNameJa] = React.useState(user.name_ja || '');
  const [bio, setBio] = React.useState(lang==='jp' ? (user.bio_ja_raw || '') : (user.bio_en_raw || ''));
  const [handle, setHandle] = React.useState(user.slug);
  const [city, setCity] = React.useState(user.city==='—' ? '' : user.city);
  const [cropFile, setCropFile] = React.useState(null);
  const [saveErr, setSaveErr] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const fileRef = React.useRef(null);

  const saveProfile = async () => {
    setSaving(true); setSaveErr('');
    try {
      const jpUi = lang==='jp';
      const patch = { displayName: name, displayNameJa: nameJa.trim(), handle: handle.trim().toLowerCase(), location: city.trim() };
      // Bio is edited in the site language; the other locale is filled by stored
      // translation (author can re-edit it from that locale). Names are manual only.
      const orig = jpUi ? (user.bio_ja_raw || '') : (user.bio_en_raw || '');
      if (bio.trim() !== orig.trim()) {
        patch[jpUi ? 'bioJa' : 'bio'] = bio.trim();
        if (bio.trim()) {
          try {
            const f = await window.N101_CONTENT.translate(jpUi ? 'en' : 'ja', { excerpt: bio.trim() });
            if (f?.excerpt) patch[jpUi ? 'bio' : 'bioJa'] = f.excerpt;
          } catch (e) { /* translation failing must not block the save */ }
        } else {
          patch[jpUi ? 'bio' : 'bioJa'] = '';
        }
      }
      const u = await window.N101_API.updateProfile(patch);
      onUpdateUser(window.N101_API.toAppUser(u, user));
      setEditing(false);
    } catch (e) {
      setSaveErr(e.code==='handle_taken' ? (lang==='jp'?'このハンドルは使われています。':'That handle is already taken.')
        : e.code==='invalid_handle' ? (lang==='jp'?'ハンドルは半角英数字とハイフン3〜30文字。':'Handle: 3–30 chars, a–z, 0–9, hyphens.')
        : (lang==='jp'?'保存できませんでした。':'Could not save.'));
    } finally { setSaving(false); }
  };
  const onAvatarCropped = async (blob) => {
    setCropFile(null);
    try {
      const url = await window.N101_API.uploadAvatar(blob);
      const u = await window.N101_API.updateProfile({ avatarUrl: url });
      onUpdateUser(window.N101_API.toAppUser(u, user));
    } catch (e) {
      setSaveErr(lang==='jp'?'画像をアップロードできませんでした。':'Could not upload the image.');
    }
  };
  const c = window.tintBg(user.tint, p);
  const totalLikes = published.reduce((s,po)=> s + (po.likes||0), 0);

  const list = tab==='published'?published : tab==='drafts'?drafts : saved;
  const isMine = tab!=='saved';

  return (
    <div>
      <div style={{background:`linear-gradient(135deg, color-mix(in oklab, ${c} 40%, ${p.bg}), ${p.bg})`, borderBottom:`1px solid ${p.line}`}}>
        <div style={{...wrap(), padding:'56px 32px 44px', display:'grid', gridTemplateColumns:'auto 1fr auto', gap:28, alignItems:'center'}}>
          <div onClick={()=>{ if(editing) fileRef.current?.click(); }} style={{position:'relative', cursor: editing?'pointer':'default'}}>
            <Avatar user={user} p={p} size={132}/>
            {editing && (
              <div style={{position:'absolute', inset:0, borderRadius:'50%', background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontFamily:'var(--fontBody)', fontSize:12, fontWeight:600, textAlign:'center'}}>
                {lang==='jp'?'写真を変更':'Change photo'}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}}
              onChange={(e)=>{ const f=e.target.files?.[0]; if(f) setCropFile(f); e.target.value=''; }}/>
          </div>
          <div style={{minWidth:0}}>
            <div style={{fontFamily:'var(--fontMono)', fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:p.inkSoft, marginBottom:10}}>
              {user.role}{user.city && user.city!=='—'?` · ${user.city}`:''} · @{user.slug}
            </div>
            {editing ? (
              <input value={name} onChange={(e)=>setName(e.target.value)} style={{
                fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(34px,4.5vw,60px)', letterSpacing:'-0.025em',
                color:p.ink, background:p.surface, border:`1px solid ${p.line}`, borderRadius:12, padding:'4px 12px', width:'100%', maxWidth:520,
              }}/>
            ) : (
              <h1 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(34px,4.5vw,60px)', letterSpacing:'-0.025em', lineHeight:1, color:p.ink}}>
                {lang==='jp'?user.jp:user.en}
                {user.name_ja && user.jp!==user.en && (
                  <span style={{fontSize:'0.42em', color:p.stamp, marginLeft:18, fontWeight:500, letterSpacing:0}}>
                    {lang==='jp'?user.en:user.name_ja}
                  </span>
                )}
              </h1>
            )}
            {editing ? (
              <div style={{maxWidth:600}}>
                <textarea value={bio} maxLength={300} onChange={(e)=>setBio(e.target.value.slice(0,300))} rows={2} style={{
                  marginTop:12, fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:18, color:p.inkSoft,
                  background:p.surface, border:`1px solid ${p.line}`, borderRadius:12, padding:'8px 12px', width:'100%', resize:'vertical', outline:'none',
                }}/>
                <CharCount p={p} n={bio.length} max={300}/>
              </div>
            ) : (
              <p style={{fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:19, color:p.inkSoft, marginTop:12, maxWidth:600, lineHeight:1.5}}>
                {lang==='jp'?user.bio_jp:user.bio_en}
              </p>
            )}
            {editing && (
              <div style={{marginTop:12, display:'flex', gap:10, flexWrap:'wrap', maxWidth:600}}>
                <label style={{flex:'1 1 100%'}}>
                  <span style={{fontFamily:'var(--fontMono)', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:p.inkFaint}}>{lang==='jp'?'名前（日本語）':'Name (Japanese)'}</span>
                  <input value={nameJa} onChange={(e)=>setNameJa(e.target.value)} placeholder={lang==='jp'?'例: 田中 美緒（空欄なら英語名を表示）':'e.g. 田中 美緒 (blank = English name everywhere)'} style={{display:'block', width:'100%', boxSizing:'border-box', background:p.surface, border:`1px solid ${p.line}`, borderRadius:10, padding:'8px 10px', marginTop:4, fontFamily:'var(--fontBody)', fontSize:13, color:p.ink, outline:'none'}}/>
                </label>
                <label style={{flex:1, minWidth:200}}>
                  <span style={{fontFamily:'var(--fontMono)', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:p.inkFaint}}>{lang==='jp'?'ハンドル':'Handle'}</span>
                  <div style={{display:'flex', alignItems:'center', gap:4, background:p.surface, border:`1px solid ${p.line}`, borderRadius:10, padding:'7px 10px', marginTop:4}}>
                    <span style={{fontFamily:'var(--fontMono)', fontSize:13, color:p.inkFaint}}>@</span>
                    <input value={handle} onChange={(e)=>setHandle(e.target.value)} style={{flex:1, minWidth:0, border:'none', outline:'none', background:'transparent', fontFamily:'var(--fontMono)', fontSize:13, color:p.ink}}/>
                  </div>
                </label>
                <label style={{flex:1, minWidth:200}}>
                  <span style={{fontFamily:'var(--fontMono)', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:p.inkFaint}}>{lang==='jp'?'場所':'Location'}</span>
                  <input value={city} onChange={(e)=>setCity(e.target.value)} placeholder={lang==='jp'?'例: Tokyo':'e.g. Tokyo'} style={{display:'block', width:'100%', boxSizing:'border-box', background:p.surface, border:`1px solid ${p.line}`, borderRadius:10, padding:'8px 10px', marginTop:4, fontFamily:'var(--fontBody)', fontSize:13, color:p.ink, outline:'none'}}/>
                </label>
              </div>
            )}
            {saveErr && <div style={{marginTop:10, fontFamily:'var(--fontBody)', fontSize:13, color:p.stamp}}>{saveErr}</div>}
            <div style={{marginTop:16, display:'flex', gap:18, fontFamily:'var(--fontMono)', fontSize:11, color:p.inkSoft, letterSpacing:'0.06em', textTransform:'uppercase'}}>
              <span><strong style={{color:p.ink}}>{published.length}</strong> {lang==='jp'?'記事':'published'}</span>
              <span>·</span>
              <span><strong style={{color:p.ink}}>{totalLikes.toLocaleString()}</strong> {lang==='jp'?'いいね':'likes'}</span>
              <span>·</span>
              {user.slug && <FollowStats handle={user.slug} locale={lang==='jp'?'ja':'en'} />}
            </div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {editing ? (
              <button disabled={saving} onClick={saveProfile} style={{...gradStyle(p), padding:'11px 22px', fontSize:13, opacity:saving?0.6:1}}>
                {saving ? (lang==='jp'?'保存中…':'Saving…') : (lang==='jp'?'保存':'Save profile')}
              </button>
            ) : (
              <button onClick={()=>setEditing(true)} style={ghostBtn(p)}><PencilIcon color={p.ink}/> {lang==='jp'?'編集':'Edit profile'}</button>
            )}
            {!editing && (
              <a href={`/${lang==='jp'?'ja':'en'}/u/${user.slug}`} target="_blank" rel="noreferrer" style={{...ghostBtn(p), textDecoration:'none', justifyContent:'center'}}>
                {lang==='jp'?'公開プロフィール':'Public profile'}
              </a>
            )}
            <button onClick={()=>window.__nihon_go({name:'compose'})} style={{...gradStyle(p), padding:'11px 22px', fontSize:13, justifyContent:'center'}}>
              <PencilIcon color="#fff"/> {lang==='jp'?'書く':'New story'}
            </button>
          </div>
        </div>
      </div>

      <div style={{...wrap(), paddingTop:32}}>
        {/* tabs */}
        <div style={{display:'flex', gap:6, borderBottom:`1px solid ${p.line}`, marginBottom:32}}>
          {[['published', lang==='jp'?'公開した記事':'Published', published.length],
            ['drafts',    lang==='jp'?'下書き':'Drafts', drafts.length],
            ['saved',     lang==='jp'?'保存':'Saved', saved.length]].map(([k,label,n])=>(
            <button key={k} onClick={()=>setTab(k)} style={{
              appearance:'none', border:'none', background:'transparent', cursor:'pointer',
              padding:'12px 6px', marginRight:18, fontFamily:'var(--fontBody)', fontSize:15, fontWeight:600,
              color: tab===k?p.ink:p.inkFaint, borderBottom: tab===k?`2px solid ${p.stamp}`:'2px solid transparent',
              marginBottom:-1,
            }}>
              {label} <span style={{color:p.inkFaint, fontWeight:500}}>{n}</span>
            </button>
          ))}
        </div>

        {list.length===0 ? (
          <div style={{padding:'72px 0', textAlign:'center'}}>
            <Hanko p={p} text={tab==='drafts'?'筆':'空'} size={64} top={'auto'} right={'auto'} rotate={0}/>
            <div style={{marginTop:20, fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:20, color:p.inkSoft, marginBottom:20}}>
              {tab==='published' ? (lang==='jp'?'まだ記事がありません。最初の記事を書きましょう。':'No published stories yet. Write your first one!')
               : tab==='drafts' ? (lang==='jp'?'下書きはありません。':'No drafts.')
               : (lang==='jp'?'保存した記事はありません。':'Nothing saved yet.')}
            </div>
            {tab!=='saved' && <button onClick={()=>window.__nihon_go({name:'compose'})} style={{...gradStyle(p), display:'inline-flex'}}>
              <PencilIcon color="#fff"/> {lang==='jp'?'記事を書く':'Start writing'}
            </button>}
          </div>
        ) : (
          isMine ? (
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24, paddingBottom:20}}>
              {list.map(po=>(
                <MyPostCard key={po.id} p={p} lang={lang} post={po} onChanged={refreshMine}/>
              ))}
            </div>
          ) : (
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24, paddingBottom:20}}>
              {list.map(po=>(
                <div key={po.slug} style={{position:'relative'}}>
                  <ArticleCard p={p} lang={lang} post={po} t={t} saved={savedSet.has(po.slug)} onSave={onSave}/>
                </div>
              ))}
            </div>
          )
        )}
      </div>
      {cropFile && <AvatarCropModal p={p} lang={lang} file={cropFile} onCancel={()=>setCropFile(null)} onDone={onAvatarCropped}/>}
    </div>
  );
}

// Square avatar crop: drag to pan, slider to zoom, exports 512×512 webp.
function AvatarCropModal({ p, lang, file, onCancel, onDone }) {
  const SIZE = 320, OUT = 512;
  const [img, setImg] = React.useState(null);
  const [zoom, setZoom] = React.useState(1);
  const [off, setOff] = React.useState({x:0, y:0});
  const drag = React.useRef(null);

  React.useEffect(()=>{
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = ()=>setImg(im);
    im.src = url;
    return ()=>URL.revokeObjectURL(url);
  }, [file]);

  // Cover-fit base scale; zoom multiplies it. Clamp pan so the image always fills the square.
  const base = img ? Math.max(SIZE/img.width, SIZE/img.height) : 1;
  const s = base*zoom;
  const clampWith = (o, sc)=> img ? {
    x: Math.min(Math.max(o.x, SIZE - img.width*sc), 0),
    y: Math.min(Math.max(o.y, SIZE - img.height*sc), 0),
  } : o;
  const clamp = (o)=>clampWith(o, s);

  const confirm = ()=>{
    const cv = document.createElement('canvas');
    cv.width = OUT; cv.height = OUT;
    const k = OUT/SIZE;
    cv.getContext('2d').drawImage(img, off.x*k, off.y*k, img.width*s*k, img.height*s*k);
    cv.toBlob((b)=>{ if(b) onDone(b); }, 'image/webp', 0.9);
  };

  return (
    <div onClick={onCancel} style={{position:'fixed', inset:0, zIndex:80, background:'rgba(20,15,12,0.55)', display:'flex', alignItems:'center', justifyContent:'center'}}>
      <div onClick={(e)=>e.stopPropagation()} style={{background:p.surface, border:`1px solid ${p.line}`, borderRadius:20, padding:24, width:SIZE+48}}>
        <div style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:20, color:p.ink, marginBottom:16}}>
          {lang==='jp'?'写真を調整':'Adjust photo'}
        </div>
        <div
          onPointerDown={(e)=>{ e.currentTarget.setPointerCapture(e.pointerId); drag.current={x:e.clientX-off.x, y:e.clientY-off.y}; }}
          onPointerMove={(e)=>{ if(drag.current) setOff(clamp({x:e.clientX-drag.current.x, y:e.clientY-drag.current.y})); }}
          onPointerUp={()=>{ drag.current=null; }}
          style={{width:SIZE, height:SIZE, borderRadius:16, overflow:'hidden', position:'relative', cursor:'grab', background:p.surface2, touchAction:'none'}}>
          {img && <img src={img.src} alt="" draggable={false} style={{
            position:'absolute', left:off.x, top:off.y, width:img.width*s, height:img.height*s,
            maxWidth:'none', userSelect:'none', pointerEvents:'none',
          }}/>}
          <div style={{position:'absolute', inset:0, borderRadius:'50%', boxShadow:'0 0 0 999px rgba(0,0,0,0.35)', pointerEvents:'none'}}></div>
        </div>
        <input type="range" min="1" max="3" step="0.01" value={zoom}
          onChange={(e)=>{ const z=Number(e.target.value); setZoom(z); setOff(o=>clampWith(o, base*z)); }}
          style={{width:'100%', marginTop:16, accentColor:p.stamp}}/>
        <div style={{display:'flex', gap:10, marginTop:16, justifyContent:'flex-end'}}>
          <button onClick={onCancel} style={ghostBtn(p)}>{lang==='jp'?'キャンセル':'Cancel'}</button>
          <button disabled={!img} onClick={confirm} style={{...gradStyle(p), padding:'10px 20px', fontSize:13}}>
            {lang==='jp'?'保存':'Use photo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ====== TRENDING ======
function TrendingPage({ p, lang, t, savedSet, onSave, claps, comments }) {
  const all = window.getAllPosts().filter(po=>!po.isDraft);
  const score = (po)=> (po.likes||0) + (claps[po.slug]||0)*1 + ((comments[po.slug]||[]).length)*40;
  const ranked = [...all].sort((a,b)=>score(b)-score(a));
  const top = ranked.slice(0,5);
  const rest = ranked.slice(5, 11);
  const cats = window.NIHON_DATA.CATEGORIES;
  // trending tags by total score per category
  const tagScore = {};
  all.forEach(po=>{ tagScore[po.category]=(tagScore[po.category]||0)+score(po); });
  const hotTags = [...cats].sort((a,b)=>(tagScore[b.slug]||0)-(tagScore[a.slug]||0)).slice(0,6);

  return (
    <div style={{...wrap(), paddingTop:48}}>
      <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:14, display:'flex', alignItems:'center', gap:8}}>
        <TrendIcon color={p.stamp}/> {lang==='jp'?'人気':'Trending now'}
      </div>
      <h1 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(40px,5vw,72px)', letterSpacing:'-0.025em', lineHeight:1.05, color:p.ink, marginBottom:8, textWrap:'pretty'}}>
        {lang==='jp'?'いま、読まれているもの。':'What everyone’s reading.'}
      </h1>
      <p style={{fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:20, color:p.inkSoft, marginBottom:40}}>
        {lang==='jp'?'いいねとコメントから集計しています。':'Ranked by likes and conversation this week.'}
      </p>

      {/* hot tags */}
      <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:44}}>
        {hotTags.map((cat,i)=>(
          <button key={cat.slug} onClick={()=>window.__nihon_go({name:'category', slug:cat.slug})} style={{
            appearance:'none', cursor:'pointer', padding:'9px 16px', borderRadius:999,
            border:`1px solid ${p.line}`, background:p.surface, color:p.ink,
            fontFamily:'var(--fontBody)', fontSize:14, fontWeight:600, display:'inline-flex', alignItems:'center', gap:8,
          }}>
            <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.stamp}}>{String(i+1).padStart(2,'0')}</span>
            <span style={{color:p.stamp, fontFamily:'var(--fontDisplay)'}}>{cat.kanji}</span>
            {lang==='jp'?cat.jp:cat.en}
          </button>
        ))}
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:56, alignItems:'start'}}>
        {/* leaderboard */}
        <div style={{display:'flex', flexDirection:'column', gap:4}}>
          {top.map((po,i)=>(
            <div key={po.slug} onClick={()=>window.__nihon_go({name:'article', slug:po.slug})}
              style={{display:'flex', gap:22, padding:'22px 0', borderBottom:`1px solid ${p.line}`, cursor:'pointer', alignItems:'flex-start'}}>
              <div style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:44, lineHeight:0.9, color: i===0?p.stamp:p.inkFaint, minWidth:56, letterSpacing:'-0.04em'}}>
                {String(i+1).padStart(2,'0')}
              </div>
              <div style={{flex:1}}>
                <div style={{fontFamily:'var(--fontMono)', fontSize:10, color:p.inkFaint, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6}}>
                  {cats.find(c=>c.slug===po.category)[lang==='jp'?'jp':'en']} · {po.readMins} min
                </div>
                <h3 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:24, lineHeight:1.12, letterSpacing:'-0.015em', color:p.ink, marginBottom:8, textWrap:'pretty'}}>
                  {lang==='jp'?po.title_jp:po.title_en}
                </h3>
                <div style={{display:'flex', alignItems:'center', gap:16}}>
                  <AuthorChip slug={po.author} p={p} lang={lang} size="sm"/>
                  <span style={{display:'inline-flex', alignItems:'center', gap:5, fontFamily:'var(--fontBody)', fontSize:13, color:p.inkSoft}}>
                    <HeartIcon color={p.stamp} filled size={14}/> {((po.likes||0)+(claps[po.slug]||0)).toLocaleString()}
                  </span>
                  <span style={{display:'inline-flex', alignItems:'center', gap:5, fontFamily:'var(--fontBody)', fontSize:13, color:p.inkSoft}}>
                    <CommentIcon color={p.inkSoft} size={14}/> {(comments[po.slug]||[]).length}
                  </span>
                </div>
              </div>
              <div style={{width:120, flexShrink:0}}>
                <Photo p={p} hue={po.cover.hue} label={po.cover.label} h={84} radius={10}/>
              </div>
            </div>
          ))}
        </div>

        {/* rising */}
        <aside style={{padding:24, background:p.surface, border:`1px solid ${p.line}`, borderRadius:18}}>
          <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:18}}>
            {lang==='jp'?'伸びている記事':'Also rising'}
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:18}}>
            {rest.map((po,i)=>(
              <div key={po.slug} onClick={()=>window.__nihon_go({name:'article', slug:po.slug})} style={{display:'flex', gap:12, cursor:'pointer', alignItems:'baseline'}}>
                <span style={{fontFamily:'var(--fontMono)', fontSize:12, color:p.inkFaint}}>{String(i+6).padStart(2,'0')}</span>
                <div>
                  <h4 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:16, lineHeight:1.2, color:p.ink, marginBottom:3, textWrap:'pretty'}}>
                    {lang==='jp'?po.title_jp:po.title_en}
                  </h4>
                  <span style={{fontFamily:'var(--fontBody)', fontSize:12, color:p.inkFaint}}>
                    {window.getAuthor(po.author)?.[lang==='jp'?'jp':'en']} · <HeartIcon color={p.inkFaint} size={11}/> {((po.likes||0)+(claps[po.slug]||0)).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

Object.assign(window, { LoginModal, ComposerPage, ProfilePage, TrendingPage, FeedPage, DEMO_USERS });

// ====== FOR YOU FEED (real backend /feed — ranked: follows + trending + fresh,
// tilted by category affinity. We only split + label it here.) ======

// Tint + initials for a real author (who-to-follow cards), mirroring api.jsx.
const FEED_TINTS = ['rose','amber','blue','lilac','peach','sage','clay','mauve','sky'];
function tintForKey(s){ let h=0; for(const c of String(s)) h=(h*31+c.charCodeAt(0))>>>0; return FEED_TINTS[h%FEED_TINTS.length]; }
function initialsOfName(n){ return (String(n||'').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,3) || '?').toUpperCase(); }
function toAuthorCard(a){
  return { slug:a.handle, en:a.displayName, jp:a.displayNameJa||a.displayName, role:'Writer',
           avatarUrl:a.avatarUrl, initials:initialsOfName(a.displayName), tint:tintForKey(a.handle) };
}

function feedReason(po, follows, lang) {
  if (follows && po.authorHandle && follows.has(po.authorHandle)) {
    return { icon:'follow', text: (lang==='jp'?'フォロー中・':'From ') + (lang==='jp'? po.author_jp : po.author) };
  }
  return { icon:'trend', text: lang==='jp'?'人気の記事':'Popular now' };
}

function FeedPage({ p, lang, t, savedSet, onSave, claps, follows, onToggleFollow, currentUser, onRequireLogin }) {
  follows = follows || new Set();
  const { feedApi, categoryApi, hydrateReal } = window.N101_CONTENT;
  const loc = lang==='jp' ? 'ja' : 'en';

  // The ranked feed (mapped to the prototype card shape), who-to-follow authors,
  // and topic chips — all real. Refetch when sign-in or the follow set changes so
  // freshly-followed writers' posts get pulled into the server-side pool.
  const [posts, setPosts] = React.useState(null);   // po[] | null=loading (current page)
  const [personalized, setPersonalized] = React.useState(false);
  const [page, setPage] = React.useState(0);        // 0-based page index
  const [total, setTotal] = React.useState(0);      // total posts → page count
  const [authors, setAuthors] = React.useState([]);  // who-to-follow candidates
  const [cats, setCats] = React.useState([]);

  const PAGE = 12;                                  // blog-style: 12 cards per page (matches Trending)
  const totalPages = Math.max(1, Math.ceil(total / PAGE));

  // Reset to page 1 when the viewer or their follow set changes.
  React.useEffect(()=>{ setPage(0); }, [currentUser, follows.size]);

  // Fetch the current page (replace, not append — numbered pagination).
  React.useEffect(()=>{
    let live = true;
    setPosts(null);
    feedApi.forYou({ limit: PAGE, page })
      .then(r=>{ if(live){ setPosts(r.feed.map(hydrateReal)); setPersonalized(!!r.personalized); setTotal(r.total ?? 0); } })
      .catch(()=>{ if(live){ setPosts([]); setTotal(0); } });
    return ()=>{ live = false; };
  }, [currentUser, follows.size, page]);

  const goPage = React.useCallback((n)=>{
    setPage(Math.max(0, Math.min(n, totalPages-1)));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [totalPages]);

  React.useEffect(()=>{
    let live = true;
    fetch(window.N101_API.API_BASE + '/home').then(r=>r.json())
      .then(d=>{ if(live){ setAuthors((d.topAuthors||[]).map(toAuthorCard)); } }).catch(()=>{});
    categoryApi.list().then(list=>{ if(live) setCats(list); }).catch(()=>{});
    return ()=>{ live = false; };
  }, []);

  // ArticleCard (the prototype card) expects a gradient cover `{hue, label}`
  // keyed on the category's palette tint — real posts carry a cover URL instead,
  // so decorate them to the SPA's gradient-card shape (consistent with the rest
  // of the SPA, which has always rendered gradient placeholders).
  const tintByCat = React.useMemo(()=>{ const m={}; cats.forEach(c=>{ m[c.id]=c.tint; }); return m; }, [cats]);
  const deco = React.useCallback((po)=>({ ...po, cover: { hue: tintByCat[po.category] || 'cream', label: po._coverLabel || '', src: po._cover || null } }), [tintByCat]);

  const all = (posts || []).map(deco);
  const loading = posts === null;
  const hasAff = personalized;

  // ONE blended stream, in the backend's ranked order (follows + trending + fresh
  // + taste, already interleaved). No follow/recommended split — that silently
  // dropped followed-author posts past the first few and broke pagination. Each
  // card still shows *why* it's here via its reason chip.
  const stream = all;
  const hasFollowed = all.some(po=>po.authorHandle && follows.has(po.authorHandle));

  // topic chips — top real categories
  const topicChips = cats.slice(0,6).map(c=>({ slug:c.id, kanji:c.kanji, en:c.labelEn, jp:c.labelJa }));

  // who to follow (unfollowed, not me)
  const suggestions = authors
    .filter(a=>!follows.has(a.slug) && a.slug!==(currentUser&&currentUser.slug))
    .slice(0,4);

  const RecCard = ({po})=>{
    const r = feedReason(po, follows, lang);
    return (
      <div>
        <div style={{display:'inline-flex', alignItems:'center', gap:6, marginBottom:10, fontFamily:'var(--fontMono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:p.inkFaint}}>
          {r.icon==='follow' ? <span style={{color:p.accentDeep, fontWeight:700}}>+</span> : r.icon==='like' ? <HeartIcon color={p.stamp} filled size={11}/> : <TrendIcon color={p.stamp} size={11}/>}
          {r.text}
        </div>
        <ArticleCard p={p} lang={lang} post={po} t={t} saved={savedSet.has(po.slug)} onSave={onSave}/>
      </div>
    );
  };

  return (
    <div style={{...wrap(), paddingTop:48}}>
      {/* header */}
      <div style={{display:'flex', alignItems:'center', gap:8, fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:14}}>
        <span style={{width:6, height:6, borderRadius:3, background:p.stamp, display:'inline-block'}}></span>
        {lang==='jp'?'あなたのフィード':'Your feed'}
      </div>
      <h1 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(40px,5vw,72px)', letterSpacing:'-0.025em', lineHeight:1.04, color:p.ink, marginBottom:8, textWrap:'pretty'}}>
        {currentUser ? (lang==='jp'?`${currentUser.jp}さんのために。`:`For you, ${currentUser.en.split(' ')[0]}.`) : (lang==='jp'?'あなた好みの日本。':'Japan, tuned to you.')}
      </h1>
      <p style={{fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:20, color:p.inkSoft, marginBottom:40, maxWidth:680}}>
        {lang==='jp'?'フォロー中の書き手、いま人気の記事、そしてあなたの好みから選びました。':'Built from the writers you follow, what’s trending, and the topics you read.'}
      </p>

      {/* not signed in */}
      {!currentUser && (
        <div onClick={onRequireLogin} style={{cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', gap:20, padding:'20px 24px', borderRadius:16, background:p.tint, border:`1px solid ${p.line}`, marginBottom:40}}>
          <span style={{fontFamily:'var(--fontBody)', fontSize:15, color:p.ink}}>
            {lang==='jp'?'ログインすると、フォローした書き手の記事がここに集まります。':'Sign in to follow writers and make this feed your own.'}
          </span>
          <button onClick={onRequireLogin} style={{...window.gradStyle(p), padding:'10px 20px', fontSize:13}}>{lang==='jp'?'ログイン':'Sign in'}</button>
        </div>
      )}

      {/* No follows yet — gentle prompt to seed the feed. */}
      {currentUser && !hasFollowed && (
        <section style={{marginBottom:48, padding:'28px 32px', borderRadius:20, background:p.surface, border:`1px solid ${p.line}`}}>
          <div style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:22, color:p.ink, marginBottom:6}}>
            {lang==='jp'?'フィードを作りましょう':'Build your feed'}
          </div>
          <p style={{fontFamily:'var(--fontBody)', fontSize:15, color:p.inkSoft, marginBottom:0, maxWidth:560, lineHeight:1.5}}>
            {lang==='jp'?'好きな書き手をフォローすると、新しい記事がここに届きます。':'Follow a few writers and their new stories will land right here.'}
          </p>
        </section>
      )}

      {/* Who to follow */}
      {currentUser && follows.size < 3 && suggestions.length>0 && (
        <section style={{marginBottom:56}}>
          <FeedHeading p={p} lang={lang} en="Writers to follow" jp="おすすめの書き手" kicker_en="suggested for you" kicker_jp="あなたへのおすすめ"/>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16}}>
            {suggestions.map(a=>(
              <div key={a.slug} style={{padding:20, borderRadius:16, background:p.surface, border:`1px solid ${p.line}`, display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:10}}>
                <div onClick={()=>{ window.location.href = `/${loc}/u/${a.slug}`; }} style={{cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
                  <Avatar user={a} p={p} size={60}/>
                  <div>
                    <div style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:16, color:p.ink}}>{lang==='jp'?a.jp:a.en}</div>
                    <div style={{fontFamily:'var(--fontBody)', fontSize:11, color:p.inkFaint, letterSpacing:'0.06em', textTransform:'uppercase', marginTop:2}}>{a.role}</div>
                  </div>
                </div>
                <button onClick={()=>onToggleFollow(a.slug)} style={{...window.gradStyle(p), padding:'8px 20px', fontSize:13}}>{lang==='jp'?'フォロー':'Follow'}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommended */}
      <section style={{marginBottom:48}}>
        <FeedHeading p={p} lang={lang} en="Picked for you" jp="あなたへのおすすめ" kicker_en={hasAff?'follows · trending · your taste':'trending this week'} kicker_jp={hasAff?'フォロー・人気・好みから':'今週の人気'}/>
        {loading ? (
          <div style={{fontFamily:'var(--fontBody)', fontSize:15, color:p.inkFaint, padding:'8px 0'}}>{lang==='jp'?'読み込み中…':'Loading…'}</div>
        ) : (
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:32}}>
            {stream.map(po=>(<RecCard key={po.slug} po={po}/>))}
          </div>
        )}
        {!loading && totalPages>1 && (()=>{
          // Numbered pagination, same look as the Trending page (windowed: Prev · 1
          // … current±2 … N · Next). Anchors so the global `.pager a` styling applies.
          const win=2, from=Math.max(0, page-win), to=Math.min(totalPages-1, page+win);
          const nums=[]; for(let i=from;i<=to;i++) nums.push(i);
          const link=(key,cls,label,n)=>(
            <a key={key} className={cls} aria-current={n===page?'page':undefined} style={{cursor:'pointer'}}
               onClick={()=>goPage(n)}>{label}</a>
          );
          return (
            <nav className="pager" aria-label="Pagination">
              {page>0 && link('prev','pg-btn',(lang==='jp'?'‹ 前へ':'‹ Prev'),page-1)}
              {from>0 && (<>{link('first','pg-num','1',0)}{from>1 && <span className="pg-gap">…</span>}</>)}
              {nums.map(n=>link(n, `pg-num${n===page?' on':''}`, String(n+1), n))}
              {to<totalPages-1 && (<>{to<totalPages-2 && <span className="pg-gap">…</span>}{link('last','pg-num',String(totalPages),totalPages-1)}</>)}
              {page<totalPages-1 && link('next','pg-btn',(lang==='jp'?'次へ ›':'Next ›'),page+1)}
            </nav>
          );
        })()}
      </section>

      {/* Topics */}
      <section style={{marginBottom:20}}>
        <FeedHeading p={p} lang={lang} en="Topics you might like" jp="気になる主題" kicker_en="jump in" kicker_jp="のぞいてみる"/>
        <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
          {topicChips.map(c=>(
            <button key={c.slug} onClick={()=>window.__nihon_go({name:'category', slug:c.slug})} style={{
              appearance:'none', cursor:'pointer', padding:'12px 20px', borderRadius:14,
              border:`1px solid ${p.line}`, background:p.surface, color:p.ink,
              fontFamily:'var(--fontDisplay)', fontSize:18, fontWeight:600, display:'inline-flex', alignItems:'center', gap:10,
            }}>
              <span style={{color:p.stamp}}>{c.kanji}</span>
              {lang==='jp'?c.jp:c.en}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function FeedHeading({p, lang, en, jp, kicker_en, kicker_jp}) {
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontFamily:'var(--fontMono)', fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:p.inkFaint, marginBottom:8}}>{lang==='jp'?kicker_jp:kicker_en}</div>
      <h2 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(24px,2.4vw,32px)', letterSpacing:'-0.02em', color:p.ink, lineHeight:1.1}}>{lang==='jp'?jp:en}</h2>
    </div>
  );
}
