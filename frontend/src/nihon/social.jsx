// social.jsx — auth, profile, composer, trending. Loads AFTER ui/home/screens.
import React from "react";
import "./ui.jsx";
import "./home.jsx";
import "./screens.jsx";
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

// ====== COMPOSER ======
function ComposerPage({ p, lang, currentUser, onPublish, draft }) {
  const [title, setTitle] = React.useState(draft?.title_en || '');
  const [excerpt, setExcerpt] = React.useState(draft?.excerpt_en || '');
  const [category, setCategory] = React.useState(draft?.category || 'culture');
  const [hue, setHue] = React.useState(draft?.cover?.hue || 'rose');
  const [body, setBody] = React.useState(draft?._bodyRaw || '');
  const [showPreview, setShowPreview] = React.useState(false);
  const cats = window.NIHON_DATA.CATEGORIES;
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const readMins = Math.max(1, Math.round(words/200));

  function build(isDraft) {
    const paras = body.split(/\n{2,}/).map(s=>s.trim()).filter(Boolean);
    const slug = (draft?.slug) || ('u-' + Date.now());
    return {
      slug,
      title_en: title || (lang==='jp'?'無題':'Untitled'),
      title_jp: title || '無題',
      kicker_en: 'New story', kicker_jp: '新しい記事',
      category, author: currentUser.slug,
      date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
      readMins, featured:false,
      cover:{ hue, label: title.slice(0,24) || 'cover' },
      excerpt_en: excerpt || paras[0]?.slice(0,140) || '',
      excerpt_jp: excerpt || paras[0]?.slice(0,140) || '',
      body_en: paras.length?paras:[excerpt||''],
      likes:0, saved:false, userPost:true, _bodyRaw: body, isDraft,
      ts: Date.now(),
    };
  }

  return (
    <div style={{...wrap(), paddingTop:32, paddingBottom:40}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24}}>
        <button onClick={()=>window.__nihon_back()} style={ghostBtn(p)}><ArrowLeft color={p.inkSoft}/> {lang==='jp'?'戻る':'Back'}</button>
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <button onClick={()=>setShowPreview(v=>!v)} style={ghostBtn(p)}>
            {showPreview ? (lang==='jp'?'編集':'Edit') : (lang==='jp'?'プレビュー':'Preview')}
          </button>
          <button onClick={()=>onPublish(build(true), true)} style={{...ghostBtn(p), border:`1px solid ${p.line}`}}>
            {lang==='jp'?'下書き保存':'Save draft'}
          </button>
          <button disabled={!title.trim()} onClick={()=>onPublish(build(false), false)}
            style={{...gradStyle(p), padding:'11px 22px', fontSize:14, opacity:title.trim()?1:0.5}}>
            {lang==='jp'?'公開する':'Publish'}
          </button>
        </div>
      </div>

      <div style={{maxWidth:820, margin:'0 auto'}}>
        {showPreview ? (
          <ComposerPreview p={p} lang={lang} post={build(false)} currentUser={currentUser}/>
        ) : (
          <>
            {/* cover hue picker */}
            <div style={{marginBottom:20}}>
              <Photo p={p} hue={hue} label={title.slice(0,24)||'cover'} h={260} radius={18}/>
              <div style={{display:'flex', gap:8, marginTop:12, flexWrap:'wrap', alignItems:'center'}}>
                <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.1em', textTransform:'uppercase', marginRight:4}}>{lang==='jp'?'表紙の色':'Cover'}</span>
                {COVER_HUES.map(h=>{
                  const [c1,c2] = window.tintGradient ? window.tintGradient(h) : ['#eee','#ddd'];
                  return <button key={h} onClick={()=>setHue(h)} title={h} style={{
                    width:30, height:30, borderRadius:9, cursor:'pointer', border: hue===h?`2px solid ${p.ink}`:`2px solid transparent`,
                    background:`linear-gradient(135deg, ${c1}, ${c2})`, boxShadow:`0 0 0 1px ${p.line}`,
                  }}></button>;
                })}
              </div>
            </div>

            {/* category */}
            <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:22}}>
              {cats.map(c=>(
                <button key={c.slug} onClick={()=>setCategory(c.slug)} style={{
                  appearance:'none', cursor:'pointer', padding:'7px 13px', borderRadius:999,
                  border:`1px solid ${category===c.slug?p.ink:p.line}`,
                  background: category===c.slug?p.ink:p.surface, color: category===c.slug?p.surface:p.ink,
                  fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, display:'inline-flex', gap:6, alignItems:'center',
                }}>
                  <span style={{color: category===c.slug?p.surface:p.stamp, fontFamily:'var(--fontDisplay)'}}>{c.kanji}</span>
                  {lang==='jp'?c.jp:c.en}
                </button>
              ))}
            </div>

            {/* title */}
            <textarea value={title} onChange={(e)=>setTitle(e.target.value)} rows={2}
              placeholder={lang==='jp'?'タイトルを書く':'Title your story'}
              style={{
                width:'100%', border:'none', outline:'none', background:'transparent', resize:'none',
                fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(34px,4vw,52px)',
                lineHeight:1.05, letterSpacing:'-0.025em', color:p.ink, marginBottom:8,
              }}/>
            {/* excerpt */}
            <input value={excerpt} onChange={(e)=>setExcerpt(e.target.value)}
              placeholder={lang==='jp'?'リード文（短い要約）':'A short standfirst / summary'}
              style={{
                width:'100%', border:'none', outline:'none', background:'transparent',
                fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:20, color:p.inkSoft,
                marginBottom:20, paddingBottom:20, borderBottom:`1px solid ${p.line}`,
              }}/>
            {/* body */}
            <textarea value={body} onChange={(e)=>setBody(e.target.value)}
              placeholder={lang==='jp'?'ここから書きはじめましょう。空行で段落が分かれます。':'Start writing here. Leave a blank line between paragraphs.'}
              style={{
                width:'100%', minHeight:360, border:'none', outline:'none', background:'transparent', resize:'vertical',
                fontFamily:'var(--fontDisplay)', fontSize:20, lineHeight:1.65, color:p.ink,
              }}/>
            <div style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.08em', marginTop:16, borderTop:`1px solid ${p.line}`, paddingTop:14}}>
              {words} {lang==='jp'?'語':'words'} · {readMins} {lang==='jp'?'分':'min read'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function ghostBtn(p){ return {appearance:'none', border:`1px solid ${p.line}`, background:p.surface, color:p.ink, padding:'10px 16px', borderRadius:999, cursor:'pointer', fontFamily:'var(--fontBody)', fontSize:13, fontWeight:600, display:'inline-flex', alignItems:'center', gap:8}; }

function ComposerPreview({p, lang, post, currentUser}) {
  return (
    <div>
      <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:18}}>
        <CategoryChip slug={post.category} p={p} lang={lang}/>
        <span style={{fontFamily:'var(--fontMono)', fontSize:11, color:p.inkFaint, letterSpacing:'0.1em', textTransform:'uppercase'}}>{lang==='jp'?'プレビュー':'preview'} · {post.readMins} min</span>
      </div>
      <h1 style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:'clamp(34px,4vw,56px)', lineHeight:1.05, letterSpacing:'-0.025em', color:p.ink, marginBottom:14, textWrap:'pretty'}}>{post.title_en}</h1>
      <p style={{fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:22, color:p.inkSoft, marginBottom:24}}>{post.excerpt_en}</p>
      <div style={{marginBottom:28}}><AuthorChip slug={currentUser.slug} p={p} lang={lang} date={post.date}/></div>
      <Photo p={p} hue={post.cover.hue} label={post.cover.label} h={420} radius={18}/>
      <div style={{marginTop:32}}>
        {post.body_en.map((para,i)=>(
          <p key={i} style={{fontFamily:'var(--fontDisplay)', fontSize:20, lineHeight:1.65, color:p.ink, marginBottom:24, textWrap:'pretty'}}>{para}</p>
        ))}
      </div>
    </div>
  );
}

// ====== PROFILE (current user) ======
function ProfilePage({ p, lang, user, t, savedSet, onSave, onUpdateUser, claps, comments }) {
  const all = window.getAllPosts();
  const published = all.filter(po=>po.author===user.slug && !po.isDraft);
  const drafts = all.filter(po=>po.author===user.slug && po.isDraft);
  const saved = all.filter(po=>savedSet.has(po.slug));
  const [tab, setTab] = React.useState('published');
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(user.en);
  const [bio, setBio] = React.useState(user.bio_en);
  const c = window.tintBg(user.tint, p);
  const totalLikes = published.reduce((s,po)=> s + (po.likes||0) + (claps[po.slug]||0), 0);

  const list = tab==='published'?published : tab==='drafts'?drafts : saved;

  return (
    <div>
      <div style={{background:`linear-gradient(135deg, color-mix(in oklab, ${c} 40%, ${p.bg}), ${p.bg})`, borderBottom:`1px solid ${p.line}`}}>
        <div style={{...wrap(), padding:'56px 32px 44px', display:'grid', gridTemplateColumns:'auto 1fr auto', gap:28, alignItems:'center'}}>
          <Avatar user={user} p={p} size={132}/>
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
              </h1>
            )}
            {editing ? (
              <textarea value={bio} onChange={(e)=>setBio(e.target.value)} rows={2} style={{
                marginTop:12, fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:18, color:p.inkSoft,
                background:p.surface, border:`1px solid ${p.line}`, borderRadius:12, padding:'8px 12px', width:'100%', maxWidth:600, resize:'vertical', outline:'none',
              }}/>
            ) : (
              <p style={{fontFamily:'var(--fontDisplay)', fontStyle:'italic', fontSize:19, color:p.inkSoft, marginTop:12, maxWidth:600, lineHeight:1.5}}>
                {lang==='jp'?user.bio_jp:user.bio_en}
              </p>
            )}
            <div style={{marginTop:16, display:'flex', gap:18, fontFamily:'var(--fontMono)', fontSize:11, color:p.inkSoft, letterSpacing:'0.06em', textTransform:'uppercase'}}>
              <span><strong style={{color:p.ink}}>{published.length}</strong> {lang==='jp'?'記事':'published'}</span>
              <span>·</span>
              <span><strong style={{color:p.ink}}>{totalLikes.toLocaleString()}</strong> {lang==='jp'?'いいね':'likes'}</span>
              <span>·</span>
              <span><strong style={{color:p.ink}}>{(published.length*128+42).toLocaleString()}</strong> {lang==='jp'?'読者':'readers'}</span>
            </div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {editing ? (
              <button onClick={()=>{ onUpdateUser({...user, en:name, jp:name, bio_en:bio, bio_jp:bio}); setEditing(false); }} style={{...gradStyle(p), padding:'11px 22px', fontSize:13}}>
                {lang==='jp'?'保存':'Save profile'}
              </button>
            ) : (
              <button onClick={()=>setEditing(true)} style={ghostBtn(p)}><PencilIcon color={p.ink}/> {lang==='jp'?'編集':'Edit profile'}</button>
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
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:32, paddingBottom:20}}>
            {list.map(po=>(
              <div key={po.slug} style={{position:'relative'}}>
                {po.isDraft && <span style={{position:'absolute', top:10, left:10, zIndex:2, background:p.ink, color:p.surface, fontFamily:'var(--fontMono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', padding:'4px 8px', borderRadius:999}}>{lang==='jp'?'下書き':'draft'}</span>}
                <ArticleCard p={p} lang={lang} post={po} t={t} saved={savedSet.has(po.slug)} onSave={onSave}/>
              </div>
            ))}
          </div>
        )}
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

// ====== FOLLOWING / FOR-YOU FEED ======
function feedAffinity({savedSet, claps, follows}) {
  const aff = {};
  const bump = (cat, n)=>{ if(cat) aff[cat] = (aff[cat]||0) + n; };
  window.getAllPosts().forEach(po=>{ if(savedSet && savedSet.has(po.slug)) bump(po.category, 3); });
  Object.keys(claps||{}).forEach(slug=>{ const po = window.getPost(slug); if(po) bump(po.category, 2); });
  (follows ? [...follows] : []).forEach(slug=>{ const b = window.authorBeat({slug}); bump(b, 2); });
  return aff;
}
function feedReason(po, aff, follows, lang) {
  if (follows && follows.has(po.author)) {
    const a = window.getAuthor(po.author);
    return { icon:'follow', text: (lang==='jp'?'フォロー中・':'From ') + (a ? (lang==='jp'?a.jp:a.en) : '') };
  }
  if (aff[po.category]) {
    const cat = window.NIHON_DATA.CATEGORIES.find(c=>c.slug===po.category);
    return { icon:'like', text: (lang==='jp'?`好み・${cat.jp}`:`Because you like ${cat.en}`) };
  }
  return { icon:'trend', text: lang==='jp'?'人気の記事':'Popular now' };
}

function FeedPage({ p, lang, t, savedSet, onSave, claps, follows, onToggleFollow, currentUser, onRequireLogin }) {
  follows = follows || new Set();
  const all = window.getAllPosts().filter(po=>!po.isDraft);
  const aff = feedAffinity({savedSet, claps, follows});
  const hasAff = Object.keys(aff).length>0;

  // posts from followed writers (newest-ish: user posts carry ts, seeds keep order)
  const followed = all.filter(po=>follows.has(po.author))
    .sort((a,b)=>(b.ts||0)-(a.ts||0));

  // recommended (exclude followed + saved), scored by affinity + popularity
  const exclude = new Set([...followed.map(po=>po.slug), ...(savedSet?[...savedSet]:[])]);
  const score = (po)=> (aff[po.category]||0)*50 + (po.likes||0)/40 + (claps[po.slug]||0) + (follows.has(po.author)?80:0);
  const recommended = all.filter(po=>!exclude.has(po.slug)).sort((a,b)=>score(b)-score(a)).slice(0,6);

  // topic affinity chips
  const cats = window.NIHON_DATA.CATEGORIES;
  const topicChips = (hasAff ? cats.filter(c=>aff[c.slug]).sort((a,b)=>aff[b.slug]-aff[a.slug])
    : cats).slice(0,6);

  // who to follow (unfollowed, ranked)
  const suggestions = window.NIHON_DATA.AUTHORS
    .filter(a=>!follows.has(a.slug) && a.slug!==(currentUser&&currentUser.slug))
    .map(a=>({...a, _s: window.writerStats(a, all, claps)}))
    .sort((x,y)=>(y._s.pieces*1000+y._s.likes)-(x._s.pieces*1000+x._s.likes))
    .slice(0,4);

  const RecCard = ({po})=>{
    const r = feedReason(po, aff, follows, lang);
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
        {lang==='jp'?'フォローしている書き手と、あなたの好みから選びました。':'Built from the writers you follow and the topics you read.'}
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

      {/* Following section */}
      {currentUser && (
        followed.length>0 ? (
          <section style={{marginBottom:56}}>
            <FeedHeading p={p} lang={lang} en="Latest from writers you follow" jp="フォロー中の書き手から" kicker_en={`${followed.length} new`} kicker_jp={`${followed.length}件`}/>
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:32}}>
              {followed.slice(0,6).map(po=>(<ArticleCard key={po.slug} p={p} lang={lang} post={po} t={t} saved={savedSet.has(po.slug)} onSave={onSave}/>))}
            </div>
          </section>
        ) : (
          <section style={{marginBottom:48, padding:'28px 32px', borderRadius:20, background:p.surface, border:`1px solid ${p.line}`}}>
            <div style={{fontFamily:'var(--fontDisplay)', fontWeight:600, fontSize:22, color:p.ink, marginBottom:6}}>
              {lang==='jp'?'フィードを作りましょう':'Build your feed'}
            </div>
            <p style={{fontFamily:'var(--fontBody)', fontSize:15, color:p.inkSoft, marginBottom:20, maxWidth:560, lineHeight:1.5}}>
              {lang==='jp'?'好きな書き手をフォローすると、新しい記事がここに届きます。':'Follow a few writers and their new stories will land right here.'}
            </p>
          </section>
        )
      )}

      {/* Who to follow */}
      {currentUser && follows.size < 3 && suggestions.length>0 && (
        <section style={{marginBottom:56}}>
          <FeedHeading p={p} lang={lang} en="Writers to follow" jp="おすすめの書き手" kicker_en="suggested for you" kicker_jp="あなたへのおすすめ"/>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16}}>
            {suggestions.map(a=>(
              <div key={a.slug} style={{padding:20, borderRadius:16, background:p.surface, border:`1px solid ${p.line}`, display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:10}}>
                <div onClick={()=>window.__nihon_go({name:'author', slug:a.slug})} style={{cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
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
        <FeedHeading p={p} lang={lang} en="Picked for you" jp="あなたへのおすすめ" kicker_en={hasAff?'based on what you read':'popular this week'} kicker_jp={hasAff?'読んだ記事から':'今週の人気'}/>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:32}}>
          {recommended.map(po=>(<RecCard key={po.slug} po={po}/>))}
        </div>
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
