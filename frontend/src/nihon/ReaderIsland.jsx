// Interactive engagement for the SSR article reader (/[locale]/p/[slug]). The
// reading view itself (title, byline, cover, body, tags, author card) is pure
// SSR HTML for SEO; this island only hydrates the parts that need a session:
//   slot="top"    → the byline action buttons (save/share, or owner edit/delete)
//   slot="engage" → the end-of-article like/save/share bar + the comment thread
// Mirrors the SPA reader (screens.jsx ArticlePage/RealArticle) so there's no
// visual drift — it reuses the very same CommentSection component + icons.
import React from "react";
import "./api.jsx";      // window.N101_API
import "./content.jsx";  // window.N101_CONTENT (postApi, feedApi)
import "./ui.jsx";       // icons, PALETTES, deriveDark, gradStyle
import "./social.jsx";   // chains screens.jsx → window.CommentSection

const readMode = () => { try { return localStorage.getItem("nihon.mode") || "light"; } catch (e) { return "light"; } };
const initials = (name) => (name || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
const toCommentView = (c) => ({
  id: c.id, parentId: c.parentId || null,
  author: { slug: c.userId, en: c.authorName || "Reader", jp: c.authorName || "読者", initials: initials(c.authorName), tint: "rose" },
  text: c.body, ts: c.createdAt, likes: c.likes, liked: c.liked, _real: true, userId: c.userId,
});

export default function ReaderIsland({ slot, postId, slug, locale, authorId, likes = 0 }) {
  const loc = locale === "ja" ? "ja" : "en";
  const lang = loc === "ja" ? "jp" : "en";
  const [mode, setMode] = React.useState(readMode);
  const p = mode === "dark" ? window.deriveDark(window.PALETTES.hakuji) : window.PALETTES.hakuji;
  const { HeartIcon, CommentIcon, BookmarkIcon, ShareIcon, PencilIcon, CommentSection } = window;

  const [user, setUser] = React.useState(null);
  const [liked, setLiked] = React.useState(false);
  const [likeCount, setLikeCount] = React.useState(likes);
  const [saved, setSaved] = React.useState(false);
  const [comments, setComments] = React.useState([]);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [delBusy, setDelBusy] = React.useState(false);
  const isOwner = !!(user && user.id === authorId);
  const dockRef = React.useRef(null);
  const [floatOn, setFloatOn] = React.useState(false);

  // Keep the palette synced with the header dark-mode toggle.
  React.useEffect(() => {
    const h = (e) => setMode((e && e.detail) || readMode());
    window.addEventListener("nihon:mode", h);
    return () => window.removeEventListener("nihon:mode", h);
  }, []);

  // Restore session, then load this reader's per-user state (liked + saved) and
  // record the read (the For You affinity signal). Logged out → defaults.
  React.useEffect(() => {
    let live = true;
    window.N101_API.refresh().then((u) => {
      if (!live) return;
      setUser(window.N101_API.toAppUser(u, null));
      const { postApi, feedApi } = window.N101_CONTENT;
      postApi.getBySlug(slug).then((po) => { if (live) { setLiked(!!po.liked); setLikeCount(po.likes); } }).catch(() => {});
      postApi.listSaved().then((rows) => { if (live) setSaved(rows.some((po) => po.slug === slug)); }).catch(() => {});
      feedApi.recordRead(postId);
    }).catch(() => { if (live) setUser(null); });
    return () => { live = false; };
  }, [slug, postId]);

  // Comments load for both slots' sake (the engage slot renders them; the count
  // is cheap to keep consistent).
  React.useEffect(() => {
    let live = true;
    window.N101_CONTENT.postApi.listComments(postId).then((rows) => { if (live) setComments(rows.map(toCommentView)); }).catch(() => {});
    return () => { live = false; };
  }, [postId]);

  // Floating action pill: appears once the reader has scrolled into the body and
  // hides ("docks") the moment the in-flow engagement bar comes on screen — so it
  // never overlaps the bar/comments at the bottom.
  React.useEffect(() => {
    if (slot !== "engage" || isOwner) return;
    const onScroll = () => {
      const dock = dockRef.current;
      let dockInView = false;
      if (dock) { const r = dock.getBoundingClientRect(); dockInView = r.top < window.innerHeight - 40 && r.bottom > 0; }
      setFloatOn(window.scrollY > 520 && !dockInView);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [slot, isOwner]);

  const requireLogin = () => { window.location.href = `/${loc}/app`; };

  const onToggleLike = async () => {
    if (!user) return requireLogin();
    setLiked((v) => !v); setLikeCount((n) => n + (liked ? -1 : 1));
    try { const r = await window.N101_CONTENT.postApi.toggleLike(postId); setLiked(r.liked); setLikeCount(r.likes); }
    catch { setLiked((v) => !v); setLikeCount((n) => n + (liked ? 1 : -1)); }
  };
  const onToggleSave = async () => {
    if (!user) return requireLogin();
    let was = saved; setSaved(!was);
    try { await window.N101_CONTENT.postApi.toggleSave(slug); }
    catch { setSaved(was); }
  };
  const onShare = () => {
    const url = window.location.href;
    if (navigator.share) navigator.share({ url }).catch(() => {});
    else navigator.clipboard?.writeText(url).catch(() => {});
  };
  const onAddComment = async (_slug, text, parentId) => {
    try { const c = await window.N101_CONTENT.postApi.addComment(postId, text, parentId); setComments((prev) => [...prev, toCommentView(c)]); } catch {}
  };
  const onLikeComment = async (_slug, cid) => {
    setComments((prev) => prev.map((c) => (c.id === cid ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) } : c)));
    try { const r = await window.N101_CONTENT.postApi.toggleCommentLike(postId, cid); setComments((prev) => prev.map((c) => (c.id === cid ? { ...c, liked: r.liked, likes: r.likes } : c))); }
    catch { setComments((prev) => prev.map((c) => (c.id === cid ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? 1 : -1) } : c))); }
  };
  const onDeleteComment = async (cid) => {
    setComments((prev) => prev.filter((c) => c.id !== cid && c.parentId !== cid));
    try { await window.N101_CONTENT.postApi.removeComment(postId, cid); } catch {}
  };
  const doDelete = async () => {
    setDelBusy(true);
    try { await window.N101_CONTENT.postApi.remove(postId); window.location.href = `/${loc}/me`; }
    catch { setDelBusy(false); }
  };

  const pill = (extra) => ({ appearance: "none", border: `1px solid ${p.line}`, background: p.surface, borderRadius: 999, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--fontBody)", color: p.ink, ...extra });
  const floatBtn = (color) => ({ appearance: "none", border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999, fontFamily: "var(--fontBody)", fontSize: 13.5, fontWeight: 600, color, textDecoration: "none" });
  const floatSep = { width: 1, height: 20, background: p.line, display: "inline-block" };

  const ownerActions = (
    <div style={{ display: "flex", gap: 10 }}>
      <a href={`/${loc}/write?id=${postId}`} style={pill({ height: 40, padding: "0 16px", gap: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" })}>
        <PencilIcon color={p.ink} size={15} /> {lang === "jp" ? "編集" : "Edit"}
      </a>
      <button onClick={() => setConfirmDel(true)} style={{ appearance: "none", border: "none", background: p.stamp, padding: "0 16px", height: 40, borderRadius: 999, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--fontBody)", fontSize: 13, fontWeight: 700, color: "#fff" }}>
        🗑 {lang === "jp" ? "削除" : "Delete"}
      </button>
    </div>
  );

  // ---- slot: top byline actions ----
  if (slot === "top") {
    return (
      <>
        {isOwner ? ownerActions : (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onToggleSave} style={pill({ width: 40, height: 40, color: saved ? p.stamp : p.ink })}>
              <BookmarkIcon filled={saved} color={saved ? p.stamp : p.ink} />
            </button>
            <button onClick={onShare} style={pill({ height: 40, padding: "0 14px", gap: 6, fontSize: 13 })}>
              <ShareIcon color={p.ink} /> {lang === "jp" ? "共有" : "Share"}
            </button>
          </div>
        )}
        {confirmDel && <DeleteModal p={p} lang={lang} busy={delBusy} onCancel={() => !delBusy && setConfirmDel(false)} onConfirm={doDelete} />}
      </>
    );
  }

  // ---- slot: end-of-article engagement bar + comments ----
  return (
    <>
      {!isOwner && (
        <div ref={dockRef} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 0", borderTop: `1px solid ${p.line}`, borderBottom: `1px solid ${p.line}`, marginBottom: 48, flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onToggleLike} style={{ appearance: "none", border: `1px solid ${liked ? p.stamp : p.line}`, background: liked ? `color-mix(in oklab, ${p.stamp} 12%, ${p.surface})` : p.surface, padding: "12px 18px", borderRadius: 999, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10, fontFamily: "var(--fontBody)", fontSize: 14, fontWeight: 600, color: p.ink }}>
              <HeartIcon color={p.stamp} filled={liked} />
              <span>{likeCount.toLocaleString()}</span>
              <span style={{ color: p.inkFaint, fontSize: 12, fontWeight: 500 }}>{lang === "jp" ? "いいね" : "likes"}</span>
            </button>
            <a href="#comments" onClick={(e) => { e.preventDefault(); const el = document.getElementById("comments"); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" }); }}
              style={pill({ padding: "12px 18px", gap: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" })}>
              <CommentIcon color={p.ink} /> {comments.length}
              <span style={{ color: p.inkFaint, fontSize: 12, fontWeight: 500 }}>{lang === "jp" ? "コメント" : "comments"}</span>
            </a>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onToggleSave} style={pill({ padding: "10px 16px", gap: 8, fontSize: 13 })}>
              <BookmarkIcon filled={saved} color={saved ? p.stamp : p.ink} /> {saved ? (lang === "jp" ? "保存済み" : "Saved") : (lang === "jp" ? "保存" : "Save")}
            </button>
            <button onClick={onShare} style={pill({ padding: "10px 16px", gap: 8, fontSize: 13 })}>
              <ShareIcon color={p.ink} /> {lang === "jp" ? "共有" : "Share"}
            </button>
          </div>
        </div>
      )}

      <div id="comments">
        <CommentSection p={p} lang={lang} slug={slug} comments={comments}
          onAdd={onAddComment} onLike={onLikeComment} onDelete={onDeleteComment}
          canModerate={isOwner} currentUser={user} onRequireLogin={requireLogin} />
      </div>

      {!isOwner && (
        <div aria-hidden={!floatOn} style={{ position: "fixed", left: "50%", bottom: 24, transform: `translateX(-50%) translateY(${floatOn ? "0" : "16px"})`, opacity: floatOn ? 1 : 0, pointerEvents: floatOn ? "auto" : "none", transition: "opacity .25s ease, transform .25s ease", zIndex: 45, display: "flex", alignItems: "center", gap: 2, background: p.surface, border: `1px solid ${p.line}`, borderRadius: 999, boxShadow: `0 20px 44px -18px color-mix(in oklab, ${p.ink} 40%, transparent)`, padding: "6px 8px" }}>
          <button onClick={onToggleLike} style={floatBtn(liked ? p.stamp : p.ink)}>
            <HeartIcon color={p.stamp} filled={liked} /> <span>{likeCount.toLocaleString()}</span>
          </button>
          <span style={floatSep} />
          <button onClick={onToggleSave} style={floatBtn(saved ? p.stamp : p.ink)}>
            <BookmarkIcon filled={saved} color={saved ? p.stamp : p.ink} /> <span>{saved ? (lang === "jp" ? "保存済み" : "Saved") : (lang === "jp" ? "保存" : "Save")}</span>
          </button>
          <span style={floatSep} />
          <button onClick={onShare} style={floatBtn(p.ink)}>
            <ShareIcon color={p.ink} /> <span>{lang === "jp" ? "共有" : "Share"}</span>
          </button>
          <span style={floatSep} />
          <a href="#comments" onClick={(e) => { e.preventDefault(); const el = document.getElementById("comments"); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" }); }} style={floatBtn(p.ink)}>
            <CommentIcon color={p.ink} /> <span>{comments.length}</span>
          </a>
        </div>
      )}
    </>
  );
}

function DeleteModal({ p, lang, busy, onCancel, onConfirm }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: p.surface, borderRadius: 18, padding: 28, maxWidth: 420, border: `1px solid ${p.line}` }}>
        <h3 style={{ fontFamily: "var(--fontDisplay)", fontSize: 20, fontWeight: 700, color: p.ink }}>{lang === "jp" ? "この記事を削除しますか？" : "Delete this post?"}</h3>
        <p style={{ color: p.inkSoft, fontSize: 14.5, lineHeight: 1.6, marginTop: 10, fontFamily: "var(--fontBody)" }}>
          {lang === "jp" ? "この操作は取り消せません。記事と翻訳版の両方が完全に削除されます。" : "This can't be undone. Both language versions will be permanently removed."}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
          <button disabled={busy} onClick={onCancel} style={{ appearance: "none", border: `1px solid ${p.line}`, background: p.surface, padding: "10px 18px", borderRadius: 999, cursor: "pointer", fontFamily: "var(--fontBody)", fontSize: 13, fontWeight: 600, color: p.ink }}>{lang === "jp" ? "キャンセル" : "Cancel"}</button>
          <button disabled={busy} onClick={onConfirm} style={{ appearance: "none", border: "none", background: p.stamp, color: "#fff", padding: "10px 18px", borderRadius: 999, cursor: "pointer", fontFamily: "var(--fontBody)", fontSize: 13, fontWeight: 700 }}>{lang === "jp" ? "削除する" : "Delete"}</button>
        </div>
      </div>
    </div>
  );
}
