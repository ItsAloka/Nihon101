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
import { withBoundary } from "./ErrorBoundary.jsx";

const readMode = () => { try { return localStorage.getItem("nihon.mode") || "light"; } catch (e) { return "light"; } };
const initials = (name) => (name || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
const toCommentView = (c) => ({
  id: c.id, parentId: c.parentId || null,
  author: {
    slug: c.userId, handle: c.authorHandle || null, avatarUrl: c.authorAvatarUrl || null,
    en: c.authorName || "Reader", jp: c.authorNameJa || c.authorName || "読者",
    initials: initials(c.authorName), tint: "rose",
  },
  text: c.body, ts: c.createdAt, likes: c.likes, liked: c.liked, _real: true, userId: c.userId,
});

function ReaderIsland({ slot, postId, slug, locale, authorId, likes = 0 }) {
  const loc = locale === "ja" ? "ja" : "en";
  const lang = loc === "ja" ? "jp" : "en";
  const [mode, setMode] = React.useState(readMode);
  const p = mode === "dark" ? window.deriveDark(window.PALETTES.hakuji) : window.PALETTES.hakuji;
  const { HeartIcon, CommentIcon, BookmarkIcon, ShareIcon, PencilIcon, CommentSection } = window;

  const [user, setUser] = React.useState(null);
  const [sessionReady, setSessionReady] = React.useState(false);
  const [liked, setLiked] = React.useState(false);
  const [likeCount, setLikeCount] = React.useState(likes);
  const [saved, setSaved] = React.useState(false);
  const [comments, setComments] = React.useState([]);
  const [commentsTotal, setCommentsTotal] = React.useState(0);
  const [commentsNext, setCommentsNext] = React.useState(null);
  const [commentsSort, setCommentsSort] = React.useState("top");
  const [commentsBusy, setCommentsBusy] = React.useState(false);
  const [commentsErr, setCommentsErr] = React.useState(false);
  const [commentsReload, setCommentsReload] = React.useState(0);
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
    }).catch(() => { if (live) setUser(null); })
      .finally(() => { if (live) setSessionReady(true); });
    return () => { live = false; };
  }, [slug, postId]);

  // Comments load for both slots' sake (the engage slot renders them; the count
  // is cheap to keep consistent). Gated on the session restore so the first fetch
  // already carries the token — otherwise the viewer's own comment-hearts render
  // empty (the fetch would race the refresh and come back liked:false).
  React.useEffect(() => {
    if (!sessionReady) return;
    let live = true;
    setCommentsErr(false);
    window.N101_CONTENT.postApi.listComments(postId, { sort: commentsSort === "top" ? "top" : "new" })
      .then((r) => { if (live) { setComments(r.comments.map(toCommentView)); setCommentsTotal(r.total ?? r.comments.length); setCommentsNext(r.nextOffset ?? null); } })
      .catch(() => { if (live) setCommentsErr(true); });
    return () => { live = false; };
  }, [postId, commentsReload, sessionReady, commentsSort]);

  // "Load more": append the next page of top-level threads (replies ride along).
  const loadMoreComments = React.useCallback(async () => {
    if (commentsNext == null || commentsBusy) return;
    setCommentsBusy(true);
    try {
      const r = await window.N101_CONTENT.postApi.listComments(postId, { sort: commentsSort === "top" ? "top" : "new", offset: commentsNext });
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...r.comments.map(toCommentView).filter((c) => !seen.has(c.id))];
      });
      setCommentsTotal((t) => r.total ?? t);
      setCommentsNext(r.nextOffset ?? null);
    } catch { /* keep the button; the reader can retry */ }
    finally { setCommentsBusy(false); }
  }, [postId, commentsNext, commentsBusy, commentsSort]);

  // Deep-link from a comment/reply notification (#comment-<id>): once comments are
  // in the DOM, scroll to the target and flash it. Runs after comments load so the
  // anchor exists. Mirrors Not Bagel's navToComment.
  React.useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#comment-") || !comments.length) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.background = `color-mix(in oklab, ${p.accent} 18%, transparent)`;
      setTimeout(() => { el.style.background = "transparent"; }, 1600);
    }, 120);
    return () => clearTimeout(t);
  }, [comments.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Every optimistic rollback SAYS SO — a like that quietly un-flips reads as
  // "the site is broken". Toaster lives in the page shell (window.__nihon_toast).
  const toast = (en, jp) => window.__nihon_toast?.(lang === "jp" ? jp : en);

  const onToggleLike = async () => {
    if (!user) return requireLogin();
    setLiked((v) => !v); setLikeCount((n) => n + (liked ? -1 : 1));
    try { const r = await window.N101_CONTENT.postApi.toggleLike(postId); setLiked(r.liked); setLikeCount(r.likes); }
    catch { setLiked((v) => !v); setLikeCount((n) => n + (liked ? 1 : -1)); toast("Could not update like — try again", "いいねできませんでした — もう一度お試しください"); }
  };
  const onToggleSave = async () => {
    if (!user) return requireLogin();
    let was = saved; setSaved(!was);
    try {
      await window.N101_CONTENT.postApi.toggleSave(slug);
      toast(was ? "Removed from saved" : "Saved", was ? "保存を解除しました" : "保存しました");
    }
    catch { setSaved(was); toast("Could not update save — try again", "保存できませんでした — もう一度お試しください"); }
  };
  const onShare = () => {
    const url = window.location.href;
    if (navigator.share) navigator.share({ url }).catch(() => {});
    else navigator.clipboard?.writeText(url)
      .then(() => toast("Link copied!", "リンクをコピーしました"))
      .catch(() => toast("Could not copy the link", "リンクをコピーできませんでした"));
  };
  // Moderation reporting. Opening sets the target ({type,id}); ReportModal collects
  // a reason + optional note and POSTs to /reports. `reportedIds` tracks what's been
  // flagged this session so the buttons can flip to "Reported". Server dedups too.
  const [reportTarget, setReportTarget] = React.useState(null);
  const [reportedIds, setReportedIds] = React.useState(() => new Set());
  const openReportPost = () => { if (!user) return requireLogin(); setReportTarget({ type: "post", id: postId }); };
  const openReportComment = (cid) => { if (!user) return requireLogin(); setReportTarget({ type: "comment", id: cid }); };
  const submitReport = async (reason, detail) => {
    const tgt = reportTarget;
    const res = await fetch(window.N101_API.API_BASE + "/reports", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + window.N101_API.getAccessToken() },
      body: JSON.stringify({ targetType: tgt.type, targetId: tgt.id, reason, detail }),
    });
    if (!res.ok) throw new Error("report_failed");
    setReportedIds((s) => new Set(s).add(tgt.id));
    setReportTarget(null);
    toast("Report sent — thank you", "通報しました。ご協力ありがとうございます");
  };
  const reported = reportedIds.has(postId);
  const onAddComment = async (_slug, text, parentId) => {
    // Optimistic: show the comment immediately, reconcile with the server row on
    // success, drop it on failure. Mirrors the like/follow pattern.
    const tmpId = "tmp_" + Math.random().toString(36).slice(2);
    const optimistic = {
      id: tmpId, parentId: parentId || null,
      author: { slug: user.slug, handle: user.slug, avatarUrl: user.avatarUrl || null,
        en: user.en, jp: user.jp, initials: user.initials, tint: user.tint },
      text, ts: Date.now(), likes: 0, liked: false, _real: false, userId: user.id, _pending: true,
    };
    setComments((prev) => [...prev, optimistic]);
    try { const c = await window.N101_CONTENT.postApi.addComment(postId, text, parentId); setComments((prev) => prev.map((x) => (x.id === tmpId ? toCommentView(c) : x))); setCommentsTotal((t) => t + 1); }
    catch { setComments((prev) => prev.filter((x) => x.id !== tmpId)); toast("Could not post your comment — try again", "コメントを投稿できませんでした — もう一度お試しください"); }
  };
  const onLikeComment = async (_slug, cid) => {
    setComments((prev) => prev.map((c) => (c.id === cid ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) } : c)));
    try { const r = await window.N101_CONTENT.postApi.toggleCommentLike(postId, cid); setComments((prev) => prev.map((c) => (c.id === cid ? { ...c, liked: r.liked, likes: r.likes } : c))); }
    catch { setComments((prev) => prev.map((c) => (c.id === cid ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? 1 : -1) } : c))); toast("Could not update like — try again", "いいねできませんでした — もう一度お試しください"); }
  };
  const onDeleteComment = async (cid) => {
    // Optimistic removal with a real rollback — before this, a failed delete
    // just vanished the thread locally and said nothing.
    const prev = comments;
    const removed = comments.filter((c) => c.id === cid || c.parentId === cid).length;
    setComments((cur) => cur.filter((c) => c.id !== cid && c.parentId !== cid));
    setCommentsTotal((t) => Math.max(0, t - removed));
    try { await window.N101_CONTENT.postApi.removeComment(postId, cid); }
    catch { setComments(prev); setCommentsTotal((t) => t + removed); toast("Could not delete — try again", "削除できませんでした — もう一度お試しください"); }
  };
  const doDelete = async () => {
    setDelBusy(true);
    try { await window.N101_CONTENT.postApi.remove(postId); window.location.href = `/${loc}/me`; }
    catch { setDelBusy(false); toast("Delete failed — try again", "削除できませんでした — もう一度お試しください"); }
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
              <CommentIcon color={p.ink} /> {Math.max(commentsTotal, comments.length)}
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
            <button onClick={openReportPost} disabled={reported} title={lang === "jp" ? "通報" : "Report"}
              style={pill({ padding: "10px 16px", gap: 8, fontSize: 13, color: reported ? p.stamp : p.ink })}>
              ⚑ {reported ? (lang === "jp" ? "通報済み" : "Reported") : (lang === "jp" ? "通報" : "Report")}
            </button>
          </div>
        </div>
      )}

      <div id="comments">
        {commentsErr && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "14px 18px", marginBottom: 16, border: `1px solid ${p.line}`, borderRadius: 12, background: p.surface }}>
            <span style={{ fontFamily: "var(--fontBody)", fontSize: 13.5, color: p.inkSoft }}>{lang === "jp" ? "コメントを読み込めませんでした。" : "Couldn’t load comments."}</span>
            <button onClick={() => setCommentsReload((k) => k + 1)} style={pill({ padding: "8px 16px", fontSize: 13, fontWeight: 600 })}>{lang === "jp" ? "再試行" : "Try again"}</button>
          </div>
        )}
        <CommentSection p={p} lang={lang} slug={slug} comments={comments}
          onAdd={onAddComment} onLike={onLikeComment} onDelete={onDeleteComment}
          onReport={openReportComment}
          total={Math.max(commentsTotal, comments.length)}
          sort={commentsSort} onSortChange={setCommentsSort}
          hasMore={commentsNext != null} onLoadMore={loadMoreComments} loadingMore={commentsBusy}
          canModerate={isOwner} currentUser={user} onRequireLogin={requireLogin} />
      </div>

      {reportTarget && (
        <ReportModal p={p} lang={lang} target={reportTarget}
          alreadyReported={reportedIds.has(reportTarget.id)}
          onClose={() => setReportTarget(null)} onSubmit={submitReport} />
      )}

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
            <CommentIcon color={p.ink} /> <span>{Math.max(commentsTotal, comments.length)}</span>
          </a>
        </div>
      )}
    </>
  );
}

export default withBoundary(ReaderIsland, "reader");

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

// Reason categories (mirror the backend allow-list) + bilingual labels.
const REPORT_REASONS = [
  ["spam", "スパム", "Spam"],
  ["harassment", "嫌がらせ", "Harassment"],
  ["hate", "ヘイト", "Hate speech"],
  ["sexual", "性的", "Sexual content"],
  ["violence", "暴力", "Violence"],
  ["misinformation", "誤情報", "Misinformation"],
  ["other", "その他", "Other"],
];

function ReportModal({ p, lang, target, alreadyReported, onClose, onSubmit }) {
  const [reason, setReason] = React.useState("spam");
  const [detail, setDetail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const isComment = target.type === "comment";
  const submit = async () => {
    setBusy(true); setErr("");
    try { await onSubmit(reason, detail.trim().slice(0, 1000)); }
    catch (e) { setErr(lang === "jp" ? "通報に失敗しました。" : "Couldn't submit the report."); setBusy(false); }
  };
  const chip = (key, jp, en) => (
    <button key={key} onClick={() => setReason(key)} style={{
      appearance: "none", cursor: "pointer", borderRadius: 999, padding: "8px 14px",
      fontFamily: "var(--fontBody)", fontSize: 13, fontWeight: reason === key ? 600 : 500,
      border: `1px solid ${reason === key ? p.stamp : p.line}`,
      background: reason === key ? `color-mix(in oklab, ${p.stamp} 12%, ${p.surface})` : p.surface,
      color: reason === key ? p.stamp : p.ink,
    }}>{lang === "jp" ? jp : en}</button>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: p.surface, borderRadius: 20, padding: 28, width: "100%", maxWidth: 460, border: `1px solid ${p.line}`, boxShadow: `0 30px 60px -24px color-mix(in oklab, ${p.ink} 45%, transparent)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>⚑</span>
          <h3 style={{ fontFamily: "var(--fontDisplay)", fontSize: 21, fontWeight: 700, color: p.ink }}>
            {isComment ? (lang === "jp" ? "コメントを通報" : "Report comment") : (lang === "jp" ? "記事を通報" : "Report post")}
          </h3>
        </div>
        <p style={{ color: p.inkSoft, fontSize: 14, lineHeight: 1.6, marginBottom: 18, fontFamily: "var(--fontBody)" }}>
          {lang === "jp" ? "理由を選んでください。モデレーターが確認します。" : "Pick a reason. A moderator will review this."}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {REPORT_REASONS.map(([k, jp, en]) => chip(k, jp, en))}
        </div>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={1000}
          placeholder={lang === "jp" ? "詳細（任意）" : "Add details (optional)"}
          style={{ width: "100%", minHeight: 84, resize: "vertical", padding: "12px 14px", borderRadius: 12, border: `1px solid ${p.line}`, background: p.surface, color: p.ink, fontFamily: "var(--fontBody)", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        {err && <div style={{ color: p.stamp, fontSize: 13, marginTop: 10, fontFamily: "var(--fontBody)" }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button disabled={busy} onClick={onClose} style={{ appearance: "none", border: `1px solid ${p.line}`, background: p.surface, padding: "10px 18px", borderRadius: 999, cursor: "pointer", fontFamily: "var(--fontBody)", fontSize: 13, fontWeight: 600, color: p.ink }}>{lang === "jp" ? "キャンセル" : "Cancel"}</button>
          <button disabled={busy} onClick={submit} style={{ appearance: "none", border: "none", background: p.stamp, color: "#fff", padding: "10px 20px", borderRadius: 999, cursor: "pointer", fontFamily: "var(--fontBody)", fontSize: 13, fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
            {busy ? "…" : (lang === "jp" ? "通報する" : "Submit report")}
          </button>
        </div>
      </div>
    </div>
  );
}
