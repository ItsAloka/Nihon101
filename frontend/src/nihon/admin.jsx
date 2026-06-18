import React from "react";
import "./api.jsx";  // ensures window.N101_API is registered in THIS island's bundle

/* Admin console island. Bootstraps the session from the refresh cookie, gates on
 * role=admin, then drives the /admin/* API. All data is fetched client-side with
 * the in-memory access token (refreshed on 401). Tabs: Dashboard, Reports, Users,
 * Media, Featured, Settings, Audit. Styling = the .adm-* classes in admin.astro. */

const T = (jp, en) => (loc) => (loc === "ja" ? jp : en);

function useApi() {
  const base = (typeof window !== "undefined" && window.N101_API?.API_BASE) || "";
  // Authed fetch: attach the bearer, and on a 401 refresh once and retry.
  return React.useCallback(async (path, opts = {}) => {
    const call = () => fetch(base + path, {
      ...opts,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(window.N101_API?.getAccessToken() ? { Authorization: "Bearer " + window.N101_API.getAccessToken() } : {}),
        ...(opts.headers || {}),
      },
    });
    let res = await call();
    if (res.status === 401) { try { await window.N101_API.refresh(); } catch (e) {} res = await call(); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "request_failed"), { status: res.status, code: data.error });
    return data;
  }, [base]);
}

const API_BASE = () => (typeof window !== "undefined" && window.N101_API?.API_BASE) || "";
const fmtDate = (ms) => new Date(Number(ms)).toLocaleDateString();
const fmtBytes = (b) => b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : (b / 1e3).toFixed(0) + " KB";
const relTime = (ms, loc) => {
  const s = Math.max(1, Math.floor((Date.now() - Number(ms)) / 1000));
  if (s < 60) return loc === "ja" ? `${s}秒前` : `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return loc === "ja" ? `${m}分前` : `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return loc === "ja" ? `${h}時間前` : `${h}h ago`;
  const d = Math.floor(h / 24); return loc === "ja" ? `${d}日前` : `${d}d ago`;
};
const initialsOf = (s) => (String(s || "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "—").toUpperCase();

/* ───────────── shared UI: thumbnail, toasts, confirm ───────────── */

// Image with a graceful initials fallback (broken/empty/0-byte → letters).
function Thumb({ src, alt = "", size = 56, rounded = 12, fallback }) {
  const [err, setErr] = React.useState(false);
  const box = { width: size, height: size, borderRadius: rounded, flexShrink: 0, background: "var(--line)" };
  if (!src || err) return (
    <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--fontDisplay)", color: "var(--inkFaint)", fontWeight: 600, fontSize: size * 0.34 }}>{fallback || "—"}</div>
  );
  return <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} style={{ ...box, objectFit: "cover" }} />;
}

const toastBus = typeof window !== "undefined" ? new EventTarget() : null;
function emitToast(msg, kind = "info") { toastBus?.dispatchEvent(new CustomEvent("t", { detail: { id: Math.random(), msg, kind } })); }
function Toaster() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    if (!toastBus) return;
    const on = (e) => {
      const it = e.detail;
      setItems((s) => [...s, it]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== it.id)), 3200);
    };
    toastBus.addEventListener("t", on);
    return () => toastBus.removeEventListener("t", on);
  }, []);
  return (
    <div style={{ position: "fixed", right: 18, bottom: 18, display: "flex", flexDirection: "column", gap: 8, zIndex: 90 }}>
      {items.map((it) => (
        <div key={it.id} style={{
          padding: "11px 16px", borderRadius: 12, background: "var(--surface)", color: "var(--ink)",
          border: `1px solid ${it.kind === "error" ? "color-mix(in oklab, var(--stamp) 50%, var(--line))" : "var(--line)"}`,
          boxShadow: "0 8px 28px rgba(0,0,0,.14)", fontFamily: "var(--fontBody)", fontSize: 13.5, maxWidth: 360,
        }}>{it.msg}</div>
      ))}
    </div>
  );
}

// Promise-based confirm dialog, mounted once in AdminConsole.
let confirmResolver = null;
const confirmBus = typeof window !== "undefined" ? new EventTarget() : null;
function confirmDialog(opts) {
  return new Promise((resolve) => {
    if (!confirmBus) return resolve(false);
    confirmResolver = resolve;
    confirmBus.dispatchEvent(new CustomEvent("c", { detail: opts }));
  });
}
function ConfirmHost({ loc }) {
  const [opts, setOpts] = React.useState(null);
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (!confirmBus) return;
    const on = (e) => { setNote(""); setOpts(e.detail); };
    confirmBus.addEventListener("c", on);
    return () => confirmBus.removeEventListener("c", on);
  }, []);
  if (!opts) return null;
  // Resolve: false on cancel; on confirm → { note } when a note was requested, else true.
  const done = (ok) => { setOpts(null); const r = confirmResolver; confirmResolver = null; r?.(ok ? (opts.note ? { note: note.trim() } : true) : false); };
  return (
    <div onClick={() => done(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 95 }}>
      <div onClick={(e) => e.stopPropagation()} className="adm-card" style={{ maxWidth: 460, margin: 0, width: "92%" }}>
        <h3 className="adm-h" style={{ fontSize: 20, fontWeight: 700 }}>{opts.title}</h3>
        {opts.message && <p style={{ color: "var(--inkSoft)", fontSize: 14.5, lineHeight: 1.6, marginTop: 10, fontFamily: "var(--fontBody)" }}>{opts.message}</p>}
        {opts.note && (
          <textarea className="adm-in" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={opts.notePlaceholder || T("対応メモ（任意・記録に残ります）", "Resolution note (optional — kept on record)")(loc)}
            style={{ height: "auto", padding: 12, marginTop: 14, resize: "vertical", fontFamily: "var(--fontBody)" }} />
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button className="adm-btn" onClick={() => done(false)}>{opts.cancelLabel || T("キャンセル", "Cancel")(loc)}</button>
          <button className={opts.danger ? "adm-btn danger" : "adm-btn primary"} onClick={() => done(true)}>{opts.confirmLabel || T("確定", "Confirm")(loc)}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminConsole({ locale }) {
  const loc = locale === "ja" ? "ja" : "en";
  const api = useApi();
  const [boot, setBoot] = React.useState("loading"); // loading | denied | ok
  const [tab, setTab] = React.useState("dashboard");
  const [stats, setStats] = React.useState(null);
  const refreshStats = React.useCallback(() => { api("/admin/stats").then(setStats).catch(() => {}); }, [api]);

  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        const u = await window.N101_API.refresh();
        if (!live) return;
        if (u?.role !== "admin") { setBoot("denied"); return; }
        setBoot("ok");
      } catch (e) { if (live) setBoot("denied"); }
    })();
    return () => { live = false; };
  }, []);

  React.useEffect(() => { if (boot === "ok") refreshStats(); }, [boot, refreshStats]);

  if (boot === "loading") return <div className="adm-empty">{T("読み込み中…", "Loading…")(loc)}</div>;
  if (boot === "denied") return (
    <div className="adm adm-card" style={{ textAlign: "center", padding: 48 }}>
      <div className="adm-h" style={{ fontSize: 22, marginBottom: 8 }}>{T("権限がありません", "Not authorized")(loc)}</div>
      <div className="adm-muted">{T("このページは管理者専用です。", "This page is for admins only.")(loc)}</div>
      <a className="adm-btn" style={{ display: "inline-block", marginTop: 18 }} href={`/${loc}/`}>{T("ホームへ", "Back home")(loc)}</a>
    </div>
  );

  const tabs = [
    ["dashboard", T("ダッシュボード", "Dashboard")(loc)],
    ["reports", T("通報", "Reports")(loc), stats?.openReports || 0],
    ["users", T("ユーザー", "Users")(loc)],
    ["media", T("メディア", "Media")(loc)],
    ["featured", T("注目記事", "Featured")(loc)],
    ["settings", T("設定", "Settings")(loc)],
    ["audit", T("監査ログ", "Audit")(loc)],
  ];

  return (
    <div className="adm">
      <div className="adm-kicker">{T("管理", "Admin")(loc)}</div>
      <h1 className="adm-h" style={{ fontSize: 34, margin: "4px 0 0" }}>{T("管理パネル", "Moderation console")(loc)}</h1>

      <div className="adm-tabs">
        {tabs.map(([k, label, badge]) => (
          <button key={k} className={"adm-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
            {label}{badge ? <span className="badge">{badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <Dashboard loc={loc} stats={stats} onJump={setTab} />}
      {tab === "reports" && <Reports loc={loc} api={api} onChange={refreshStats} />}
      {tab === "users" && <Users loc={loc} api={api} />}
      {tab === "media" && <Media loc={loc} api={api} />}
      {tab === "featured" && <Featured loc={loc} api={api} />}
      {tab === "settings" && <Settings loc={loc} api={api} />}
      {tab === "audit" && <Audit loc={loc} api={api} />}

      <Toaster />
      <ConfirmHost loc={loc} />
    </div>
  );
}

/* ───────────── Dashboard ───────────── */
function Dashboard({ loc, stats, onJump }) {
  if (!stats) return <div className="adm-empty">…</div>;
  const cells = [
    [stats.openReports, T("未処理の通報", "Open reports")(loc), stats.openReports > 0, "reports"],
    [stats.activeBans, T("有効なBAN", "Active bans")(loc), false, "users"],
    [stats.totalUsers, T("ユーザー総数", "Total users")(loc), false, "users"],
    [stats.newUsersToday, T("本日の新規", "New today")(loc), false, "users"],
    [stats.totalPosts, T("公開記事", "Published posts")(loc), false, "featured"],
    [stats.hiddenPosts, T("非表示の記事", "Hidden posts")(loc), stats.hiddenPosts > 0, "reports"],
  ];
  return (
    <div className="adm-stats">
      {cells.map(([n, l, alert, jump], i) => (
        <button key={i} onClick={() => onJump?.(jump)} className={"adm-stat" + (alert ? " alert" : "")}
          style={{ textAlign: "left", cursor: "pointer", appearance: "none", font: "inherit" }}>
          <div className="n">{n}</div><div className="l">{l}</div>
        </button>
      ))}
    </div>
  );
}

/* ───────────── Reports (grouped cases) ───────────── */
const REASON_LABEL = {
  spam: ["スパム", "spam"], harassment: ["嫌がらせ", "harassment"], hate: ["ヘイト", "hate"],
  sexual: ["性的", "sexual"], violence: ["暴力", "violence"], misinformation: ["誤情報", "misinfo"], other: ["その他", "other"],
};
function reasonBreakdown(reasons) {
  const m = new Map();
  for (const r of reasons || []) m.set(r, (m.get(r) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
const reasonLabel = (r, loc) => (REASON_LABEL[r] || [r, r])[loc === "ja" ? 0 : 1];

// Expandable "who reported, why, with what note" drawer — loads on first open.
function CaseReporters({ loc, api, k }) {
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState(null);
  const toggle = () => {
    const nx = !open; setOpen(nx);
    if (nx && rows === null) {
      api(`/admin/reports/by-target?targetType=${k.targetType}&targetId=${encodeURIComponent(k.targetId)}`)
        .then((d) => setRows(d.reports)).catch(() => setRows([]));
    }
  };
  return (
    <div style={{ marginTop: 8 }}>
      <button className="adm-btn" style={{ padding: "4px 11px", fontSize: 12 }} onClick={toggle}>
        {open ? "▾" : "▸"} {T(`通報者 ${k.distinctReporters}人の詳細`, `Who reported (${k.distinctReporters})`)(loc)}
      </button>
      {open && (rows === null ? <div className="adm-muted" style={{ padding: "8px 0" }}>…</div> : (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 11px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)" }}>
              <Thumb src={r.reporterAvatarUrl} size={32} rounded={999} fallback={initialsOf(r.reporterName)} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                  <b>{r.reporterName || T("不明", "unknown")(loc)}</b>
                  {r.reporterHandle && <span className="adm-mono">@{r.reporterHandle}</span>}
                  <span className="adm-pill red">{reasonLabel(r.reason, loc)}</span>
                  <span className="adm-mono" style={{ marginLeft: "auto" }}>{relTime(r.createdAt, loc)}</span>
                </div>
                {r.detail && <div className="adm-muted" style={{ marginTop: 3, fontStyle: "italic" }}>“{r.detail}”</div>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Reports({ loc, api, onChange }) {
  const [status, setStatus] = React.useState("open");
  const [data, setData] = React.useState(null);   // { mode, threshold, needsAction, watching } | { mode, reports }
  const [busy, setBusy] = React.useState("");
  const [banFor, setBanFor] = React.useState(null); // authorId
  const [showWatching, setShowWatching] = React.useState(false);

  const load = React.useCallback(() => {
    setData(null);
    api(`/admin/reports?status=${status}`).then(setData).catch(() => setData({ mode: status === "open" ? "cases" : "list", needsAction: [], watching: [], reports: [] }));
  }, [api, status]);
  React.useEffect(load, [load]);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try { await fn(); if (okMsg) emitToast(okMsg, "success"); load(); onChange?.(); setBanFor(null); }
    catch (e) { emitToast(e.code || e.message || "Failed", "error"); }
    finally { setBusy(""); }
  };

  const ep = (k) => (k.targetType === "post" ? "posts" : "comments");
  const hide = async (k) => {
    const ok = await confirmDialog({
      loc, note: true, confirmLabel: T("非表示", "Hide")(loc),
      title: k.targetType === "post" ? T("記事を非表示", "Hide post")(loc) : T("コメントを非表示", "Hide comment")(loc),
      message: T("公開ページから外します（後で戻せます）。", "Removes it from the public site (reversible).")(loc),
    });
    if (!ok) return;
    run(k.targetId + "h", () => api(`/admin/${ep(k)}/${k.targetId}/hide`, { method: "PATCH", body: JSON.stringify({ hidden: true, reason: "moderation", note: ok.note }) }), T("非表示にしました。", "Hidden.")(loc));
  };
  const del = async (k) => {
    const ok = await confirmDialog({
      loc, danger: true, note: true, confirmLabel: T("削除", "Delete")(loc),
      title: k.targetType === "post" ? T("記事を削除", "Delete post")(loc) : T("コメントを削除", "Delete comment")(loc),
      message: T("この操作は取り消せません。", "This can't be undone.")(loc),
    });
    if (!ok) return;
    run(k.targetId + "d", () => api(`/admin/${ep(k)}/${k.targetId}`, { method: "DELETE", body: JSON.stringify({ note: ok.note }) }), T("削除しました。", "Deleted.")(loc));
  };
  const dismissAll = async (k) => {
    const ok = await confirmDialog({
      loc, note: true, confirmLabel: T("却下", "Dismiss")(loc),
      title: T("通報を却下", "Dismiss reports")(loc),
      message: T("この案件は問題なしとして閉じます。", "Close this case as harmless.")(loc),
    });
    if (!ok) return;
    run(k.targetId + "dm", () => api("/admin/reports/dismiss-target", { method: "POST", body: JSON.stringify({ targetType: k.targetType, targetId: k.targetId, note: ok.note }) }), T("却下しました。", "Dismissed.")(loc));
  };
  const clearStale = async () => {
    const ok = await confirmDialog({
      loc, confirmLabel: T("一括却下", "Dismiss all")(loc),
      title: T("古い監視案件を一括却下", "Clear stale watching cases")(loc),
      message: T("30日以上動きのない、しきい値未満の通報をまとめて却下します。", "Dismisses all below-threshold reports untouched for 30+ days.")(loc),
    });
    if (!ok) return;
    run("clearStale", () => api("/admin/reports/dismiss-watching", { method: "POST", body: JSON.stringify({ olderThanDays: 30 }) }), T("古い案件を却下しました。", "Stale cases cleared.")(loc));
  };
  const doBan = (authorId, reason, duration) => run(authorId + "ban", () => api(`/admin/users/${authorId}/ban`, { method: "POST", body: JSON.stringify({ reason, duration }) }), T("BANしました。", "User banned.")(loc));

  const renderCase = (k) => {
    const t = k.target || {};
    const isPost = k.targetType === "post";
    const isComment = k.targetType === "comment";
    const isUser = k.targetType === "user";
    const title = isPost ? (t.postTitle || k.targetId) : isComment ? `“${t.excerpt || ""}”` : `@${t.handle || t.authorName || k.targetId}`;
    const href = isPost && t.postSlug ? `/${loc}/p/${t.postSlug}` : (t.handle ? `/${loc}/u/${t.handle}` : null);
    const thumb = isPost ? t.cover : t.authorAvatarUrl;
    const breakdown = reasonBreakdown(k.reasons);
    return (
      <div className="adm-card" key={k.targetType + k.targetId}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <Thumb src={thumb} size={isPost ? 64 : 48} rounded={isPost ? 12 : 999} fallback={initialsOf(t.authorName || t.handle)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <span className="adm-pill">{k.targetType}</span>
              <span className="adm-pill red" style={{ fontWeight: 700 }}>
                {k.distinctReporters} {T("人が通報", k.distinctReporters === 1 ? "person" : "people")(loc)}
              </span>
              {k.totalReports !== k.distinctReporters && <span className="adm-pill">{k.totalReports} {T("件", "reports")(loc)}</span>}
              {t.isHidden && <span className="adm-pill red">{T("非表示中", "hidden")(loc)}</span>}
              <span className="adm-mono" style={{ marginLeft: "auto" }}>{relTime(k.lastAt, loc)}</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
              {href ? <a className="adm-link" href={href} target="_blank" rel="noreferrer">{title}</a> : title}
            </div>
            {t.authorName && !isUser && <div className="adm-mono" style={{ marginBottom: 6 }}>{T("投稿者", "by")(loc)} {t.authorName}{t.handle ? ` @${t.handle}` : ""}</div>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: k.details?.length ? 8 : 0 }}>
              {breakdown.map(([r, n]) => (
                <span key={r} className="adm-pill">{(REASON_LABEL[r] || [r, r])[loc === "ja" ? 0 : 1]}{n > 1 ? ` ×${n}` : ""}</span>
              ))}
            </div>
            <CaseReporters loc={loc} api={api} k={k} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {(isPost || isComment) && !t.isHidden && <button className="adm-btn danger" disabled={!!busy} onClick={() => hide(k)}>{T("非表示", "Hide")(loc)}</button>}
              {(isPost || isComment) && <button className="adm-btn danger" disabled={!!busy} onClick={() => del(k)}>{T("削除", "Delete")(loc)}</button>}
              {t.authorId && <button className="adm-btn danger" disabled={!!busy} onClick={() => setBanFor(banFor === t.authorId ? null : t.authorId)}>{T("投稿者をBAN", "Ban author")(loc)}</button>}
              <button className="adm-btn" disabled={!!busy} onClick={() => dismissAll(k)}>{T("却下", "Dismiss")(loc)}</button>
            </div>
            {banFor && banFor === t.authorId && (
              <BanForm loc={loc} busy={!!busy} onCancel={() => setBanFor(null)} onBan={(reason, duration) => doBan(t.authorId, reason, duration)} />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="adm-tabs" style={{ border: "none", marginTop: 0 }}>
        {["open", "resolved", "dismissed"].map((s) => (
          <button key={s} className={"adm-tab" + (status === s ? " on" : "")} onClick={() => setStatus(s)}>
            {T({ open: "未処理", resolved: "解決済み", dismissed: "却下" }[s], s[0].toUpperCase() + s.slice(1))(loc)}
          </button>
        ))}
      </div>

      {data === null ? <div className="adm-empty">…</div> : status === "open" ? (
        <>
          <div className="adm-muted" style={{ marginBottom: 12 }}>
            {T(`しきい値 ${data.threshold} 人以上の通報で「要対応」に表示。`, `Cases reach “Needs action” at ${data.threshold}+ distinct reporters.`)(loc)}
          </div>
          {(data.needsAction?.length === 0 && data.watching?.length === 0)
            ? <div className="adm-empty">{T("通報はありません。", "No open reports.")(loc)}</div>
            : (
              <>
                <div className="adm-col-h">{T("要対応", "Needs action")(loc)} · {data.needsAction?.length || 0}</div>
                {data.needsAction?.length ? data.needsAction.map(renderCase)
                  : <div className="adm-muted" style={{ marginBottom: 16 }}>{T("要対応の案件はありません。", "Nothing over the threshold.")(loc)}</div>}

                {data.watching?.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button className="adm-btn" onClick={() => setShowWatching((v) => !v)}>
                        {showWatching ? "▾" : "▸"} {T("監視中", "Watching")(loc)} · {data.watching.length} {T("（しきい値未満）", "(below threshold)")(loc)}
                      </button>
                      <button className="adm-btn" disabled={busy === "clearStale"} onClick={clearStale} title={T("30日以上動きのない案件を一括却下", "Dismiss cases untouched for 30+ days")(loc)}>
                        {T("古い案件を一括却下", "Clear stale")(loc)}
                      </button>
                    </div>
                    {showWatching && <div style={{ marginTop: 12, opacity: 0.92 }}>{data.watching.map(renderCase)}</div>}
                  </div>
                )}
              </>
            )}
        </>
      ) : (
        (data.reports?.length ? data.reports : []).length === 0
          ? <div className="adm-empty">{T("ここには通報はありません。", "No reports here.")(loc)}</div>
          : data.reports.map((r) => {
            const t = r.target || {};
            const title = r.targetType === "post" ? t.postTitle : r.targetType === "comment" ? `“${t.excerpt || ""}”` : `@${t.handle || r.targetId}`;
            return (
              <div className="adm-card" key={r.id}>
                <div style={{ minWidth: 0 }}>
                  <span className="adm-pill">{r.targetType}</span> <span className="adm-pill">{reasonLabel(r.reason, loc)}</span>
                  {r.dupeCount > 1 && <> <span className="adm-pill">{r.dupeCount}×</span></>}
                  <div style={{ fontWeight: 600, margin: "6px 0 2px" }}>{title}</div>
                  <div className="adm-mono">{T("通報者", "by")(loc)} {r.reporterName || "—"} · {fmtDate(r.createdAt)}</div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                    <span className="adm-pill ok">{status === "resolved" ? T("解決", "resolved")(loc) : T("却下", "dismissed")(loc)}</span>{" "}
                    <span className="adm-mono">{r.resolverName || T("システム", "system")(loc)}{r.resolvedAt ? ` · ${fmtDate(r.resolvedAt)}` : ""}</span>
                    {r.resolutionNote && <div className="adm-muted" style={{ marginTop: 4, fontStyle: "italic" }}>“{r.resolutionNote}”</div>}
                  </div>
                </div>
              </div>
            );
          })
      )}
    </div>
  );
}

/* ───────────── Users ───────────── */
function Users({ loc, api }) {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [banFor, setBanFor] = React.useState(null);
  const load = React.useCallback((query) => {
    setRows(null);
    api(`/admin/users?q=${encodeURIComponent(query || "")}`).then((d) => setRows(d.users)).catch(() => setRows([]));
  }, [api]);
  React.useEffect(() => { load(""); }, [load]);
  React.useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q, load]);

  const wrap = async (fn, key, okMsg) => {
    setBusy(key);
    try { await fn(); if (okMsg) emitToast(okMsg, "success"); load(q); setBanFor(null); }
    catch (e) { emitToast(e.code || e.message || "Failed", "error"); }
    finally { setBusy(""); }
  };
  const unban = (u) => wrap(() => api(`/admin/users/${u.id}/unban`, { method: "POST" }), u.id, T("BAN解除しました。", "Unbanned.")(loc));
  const role = async (u, r) => {
    const ok = await confirmDialog({ loc, title: r === "admin" ? T("管理者に昇格", "Grant admin")(loc) : T("管理者を解除", "Revoke admin")(loc), message: `@${u.handle}`, confirmLabel: T("確定", "Confirm")(loc) });
    if (ok) wrap(() => api(`/admin/users/${u.id}/role`, { method: "POST", body: JSON.stringify({ role: r }) }), u.id + "role", T("更新しました。", "Role updated.")(loc));
  };
  const doBan = (u, reason, duration) => wrap(() => api(`/admin/users/${u.id}/ban`, { method: "POST", body: JSON.stringify({ reason, duration }) }), u.id, T("BANしました。", "User banned.")(loc));

  return (
    <div>
      <input className="adm-in adm-search" placeholder={T("名前・@ハンドル・メールで検索", "Search name, @handle, or email")(loc)} value={q} onChange={(e) => setQ(e.target.value)} />
      {rows === null ? <div className="adm-empty">…</div>
        : rows.length === 0 ? <div className="adm-empty">{T("該当なし", "No users")(loc)}</div>
        : rows.map((u) => (
          <div className="adm-card" key={u.id}>
            <div className="adm-row" style={{ flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                <Thumb src={u.avatarUrl} size={46} rounded={999} fallback={initialsOf(u.displayName)} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {u.displayName} <span className="adm-mono">@{u.handle}</span>
                    {u.role === "admin" && <> <span className="adm-pill ok">admin</span></>}
                    {u.isBanned && <> <span className="adm-pill red">{T("BAN中", "banned")(loc)}</span></>}
                  </div>
                  <div className="adm-mono" style={{ marginTop: 4 }}>{u.email} · {u.postCount} {T("記事", "posts")(loc)} · {T("登録", "joined")(loc)} {fmtDate(u.createdAt)}{u.bannedUntil ? ` · ${T("解除", "until")(loc)} ${fmtDate(u.bannedUntil)}` : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                {u.role === "admin"
                  ? <button className="adm-btn" disabled={!!busy} onClick={() => role(u, "user")}>{T("管理者解除", "Revoke admin")(loc)}</button>
                  : <button className="adm-btn" disabled={!!busy} onClick={() => role(u, "admin")}>{T("管理者に", "Make admin")(loc)}</button>}
                {u.isBanned
                  ? <button className="adm-btn" disabled={!!busy} onClick={() => unban(u)}>{T("BAN解除", "Unban")(loc)}</button>
                  : u.role !== "admin" && <button className="adm-btn danger" disabled={!!busy} onClick={() => setBanFor(banFor === u.id ? null : u.id)}>{T("BAN", "Ban")(loc)}</button>}
              </div>
            </div>
            {banFor === u.id && <BanForm loc={loc} busy={!!busy} onCancel={() => setBanFor(null)} onBan={(reason, duration) => doBan(u, reason, duration)} />}
          </div>
        ))}
    </div>
  );
}

function BanForm({ loc, onBan, onCancel, busy }) {
  const [reason, setReason] = React.useState("");
  const [duration, setDuration] = React.useState("7d");
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input className="adm-in" style={{ flex: 1, minWidth: 200, height: 38 }} placeholder={T("理由（必須）", "Reason (required)")(loc)} value={reason} onChange={(e) => setReason(e.target.value)} />
      {["24h", "7d", "permanent"].map((d) => (
        <button key={d} className={"adm-btn" + (duration === d ? " primary" : "")} onClick={() => setDuration(d)}>
          {T({ "24h": "24時間", "7d": "7日", permanent: "永久" }[d], d)(loc)}
        </button>
      ))}
      <button className="adm-btn danger" disabled={!reason.trim() || busy} onClick={() => onBan(reason.trim(), duration)}>{T("BAN実行", "Confirm ban")(loc)}</button>
      <button className="adm-btn" onClick={onCancel}>{T("取消", "Cancel")(loc)}</button>
    </div>
  );
}

/* ───────────── Media (orphan finder) ───────────── */
function Media({ loc, api }) {
  const [data, setData] = React.useState(null);
  const [sel, setSel] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => { setData(null); setSel(new Set()); api("/admin/media").then(setData).catch(() => setData({ objects: [], dangling: [], orphanBytes: 0 })); }, [api]);
  React.useEffect(load, [load]);

  if (!data) return <div className="adm-empty">{T("バケットをスキャン中…", "Scanning bucket…")(loc)}</div>;
  const base = API_BASE();
  const orphans = data.objects.filter((o) => !o.referenced);
  const toggle = (k) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const selectAll = () => setSel(new Set(orphans.map((o) => o.key)));
  const del = async () => {
    if (!sel.size) return;
    const ok = await confirmDialog({ loc, danger: true, confirmLabel: T("削除", "Delete")(loc), title: T("孤立画像を削除", "Delete orphans")(loc), message: T(`${sel.size}件を完全に削除します。`, `Permanently delete ${sel.size} image(s)?`)(loc) });
    if (!ok) return;
    setBusy(true);
    try { const r = await api("/admin/media/bulk-delete", { method: "POST", body: JSON.stringify({ keys: [...sel] }) }); emitToast(T(`${r.deleted}件削除。`, `Deleted ${r.deleted}.`)(loc), "success"); load(); }
    catch (e) { emitToast(e.code || "Failed", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="adm-stats" style={{ marginBottom: 18 }}>
        <div className="adm-stat"><div className="n">{data.objects.length}</div><div className="l">{T("オブジェクト", "objects")(loc)}</div></div>
        <div className={"adm-stat" + (orphans.length ? " alert" : "")}><div className="n">{orphans.length}</div><div className="l">{T("孤立 (未参照)", "orphans (unused)")(loc)}</div></div>
        <div className="adm-stat"><div className="n">{fmtBytes(data.orphanBytes)}</div><div className="l">{T("回収可能", "reclaimable")(loc)}</div></div>
      </div>
      {data.dangling?.length > 0 && (
        <div className="adm-card"><span className="adm-pill red">{T("欠落", "dangling")(loc)}</span> <span className="adm-muted">{T(`${data.dangling.length}件のDB参照がR2に存在しません（ゴーストカバー）。`, `${data.dangling.length} DB row(s) point at a key R2 no longer has (ghost covers).`)(loc)}</span></div>
      )}
      <div className="adm-row" style={{ margin: "8px 0 14px" }}>
        <div className="adm-muted">{sel.size} {T("選択中", "selected")(loc)}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="adm-btn" onClick={selectAll} disabled={!orphans.length}>{T("孤立を全選択", "Select all orphans")(loc)}</button>
          <button className="adm-btn danger" onClick={del} disabled={!sel.size || busy}>{T("選択を削除", "Delete selected")(loc)}</button>
        </div>
      </div>
      {orphans.length === 0 ? <div className="adm-empty">{T("孤立画像はありません。R2はクリーンです。", "No orphans — R2 is clean.")(loc)}</div>
        : orphans.map((o) => (
          <label className="adm-card adm-row" key={o.key} style={{ cursor: "pointer" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
              <input type="checkbox" checked={sel.has(o.key)} onChange={() => toggle(o.key)} />
              <Thumb src={`${base}/media/${o.key}`} size={48} rounded={8} fallback="?" />
              <div style={{ minWidth: 0 }}>
                <div className="adm-mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{o.key}</div>
                <div className="adm-muted">{fmtBytes(o.size)} · {T("アップロード", "uploaded")(loc)} {fmtDate(o.uploaded)}</div>
              </div>
            </div>
            <span className="adm-pill red">{T("未参照", "orphan")(loc)}</span>
          </label>
        ))}
    </div>
  );
}

/* ───────────── Featured (home curation) ─────────────
 * Only the single "ALSO FEATURED" slot is admin-curated. The home hero is the
 * top-3 trending (momentum, not pinnable) and picks/grid are recency — admins
 * can't intervene with those. */
const SECTIONS = [["feature", 1]];
function Featured({ loc, api }) {
  const [cur, setCur] = React.useState(null);     // { hero:[], feature:[], picks:[] }
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [target] = React.useState("feature");
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  const load = React.useCallback(() => { api("/admin/featured").then((d) => { setCur({ hero: d.hero, feature: d.feature, picks: d.picks }); setDirty(false); }).catch(() => {}); }, [api]);
  React.useEffect(load, [load]);
  React.useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(() => api(`/admin/posts?q=${encodeURIComponent(q)}`).then((d) => setResults(d.posts)).catch(() => setResults([])), 300);
    return () => clearTimeout(t);
  }, [q, api]);

  if (!cur) return <div className="adm-empty">…</div>;
  const cap = Object.fromEntries(SECTIONS);
  const titleOf = (p) => (loc === "ja" ? (p.titleJa || p.titleEn) : p.titleEn) || "—";
  const inAny = (id) => SECTIONS.some(([s]) => cur[s].some((p) => p.id === id));

  const add = (p) => {
    if (cur[target].length >= cap[target] || inAny(p.id)) return;
    setCur((c) => ({ ...c, [target]: [...c[target], p] })); setDirty(true);
  };
  const remove = (section, id) => { setCur((c) => ({ ...c, [section]: c[section].filter((p) => p.id !== id) })); setDirty(true); };
  const save = async () => {
    setBusy(true);
    const slots = [];
    for (const [s] of SECTIONS) cur[s].forEach((p, i) => slots.push({ section: s, rank: i + 1, postId: p.id }));
    try { await api("/admin/featured", { method: "PUT", body: JSON.stringify({ slots }) }); emitToast(T("保存しました。", "Saved.")(loc), "success"); load(); }
    catch (e) { emitToast(e.code || "Failed", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="adm-row" style={{ marginBottom: 14 }}>
        <div className="adm-muted">{T("ホームの「注目記事」枠を編集。保存するまで反映されません。", "Curate the home “Also featured” slot. Nothing changes until you save.")(loc)}</div>
        <button className="adm-btn primary" disabled={!dirty || busy} onClick={save}>{dirty ? T("保存", "Save changes")(loc) : T("保存済み", "Saved")(loc)}</button>
      </div>
      <div style={{ maxWidth: 520 }}>
        {SECTIONS.map(([s, n]) => (
          <div key={s}>
            <div className="adm-col-h">{T("注目記事", "Also featured")(loc)} · {cur[s].length}/{n}</div>
            {cur[s].length === 0 && <div className="adm-muted" style={{ fontSize: 12, marginBottom: 8 }}>{T("（recency が代替）", "(recency fills in)")(loc)}</div>}
            {cur[s].map((p) => (
              <div className="adm-card adm-row" key={p.id} style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  <Thumb src={p.cover} size={44} rounded={8} fallback={initialsOf(p.authorName)} />
                  <div style={{ minWidth: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleOf(p)}</div>
                </div>
                <button className="adm-btn" style={{ padding: "3px 9px", fontSize: 12 }} onClick={() => remove(s, p.id)}>✕</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="adm-col-h">{T("記事を検索して追加", "Search posts to add")(loc)}</div>
        <input className="adm-in adm-search" placeholder={T("タイトルで検索…", "Search by title…")(loc)} value={q} onChange={(e) => setQ(e.target.value)} />
        {results.map((p) => {
          const used = inAny(p.id);
          const full = cur[target].length >= cap[target];
          return (
            <div className="adm-card adm-row" key={p.id} style={{ padding: "10px 14px" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                <Thumb src={p.cover} size={52} rounded={8} fallback={initialsOf(p.authorName)} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{titleOf(p)} {p.isHidden && <span className="adm-pill red">{T("非表示", "hidden")(loc)}</span>}</div>
                  <div className="adm-mono">{p.authorName} · ♥ {p.likes}</div>
                </div>
              </div>
              <button className="adm-btn" disabled={used || full} onClick={() => add(p)}>
                {used ? T("追加済み", "added")(loc) : T("追加", "Add")(loc)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Settings (moderation thresholds) ───────────── */
function Settings({ loc, api }) {
  const [cfg, setCfg] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { api("/admin/settings").then((d) => { setCfg(d); setDraft(d); }).catch(() => {}); }, [api]);
  if (!draft) return <div className="adm-empty">…</div>;

  const dirty = cfg && (draft.reportThreshold !== cfg.reportThreshold || draft.autoHideThreshold !== cfg.autoHideThreshold);
  const setField = (k) => (e) => setDraft((d) => ({ ...d, [k]: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }));
  const save = async () => {
    setBusy(true);
    try { const d = await api("/admin/settings", { method: "PUT", body: JSON.stringify(draft) }); setCfg(d); setDraft(d); emitToast(T("保存しました。", "Saved.")(loc), "success"); }
    catch (e) { emitToast(e.code || "Failed", "error"); }
    finally { setBusy(false); }
  };

  const Row = ({ label, hint, k }) => (
    <div className="adm-card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div className="adm-muted" style={{ marginBottom: 12 }}>{hint}</div>
      <input type="number" min={1} max={100} className="adm-in" style={{ maxWidth: 120, height: 40 }} value={draft[k]} onChange={setField(k)} />
    </div>
  );

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="adm-muted" style={{ marginBottom: 16 }}>
        {T("通報の「人数」は通報した別々のユーザー数で数えます（同一人物の連投は1人分）。", "Counts are by distinct reporters — one person spamming the same target counts once.")(loc)}
      </div>
      <Row k="reportThreshold" label={T("通報しきい値", "Report threshold")(loc)}
        hint={T("この人数以上が同じ対象を通報すると「要対応」に表示されます。", "A case appears in “Needs action” once this many different people report the same target.")(loc)} />
      <Row k="autoHideThreshold" label={T("自動非表示しきい値", "Auto-hide threshold")(loc)}
        hint={T("この人数以上が通報すると、対象は審査待ちとして自動的に非表示になります（取り消し可能）。通報しきい値以上である必要があります。", "Once this many different people report a post/comment, it is auto-hidden pending review (reversible). Must be ≥ the report threshold.")(loc)} />
      <button className="adm-btn primary" disabled={!dirty || busy} onClick={save}>{dirty ? T("保存", "Save changes")(loc) : T("保存済み", "Saved")(loc)}</button>
    </div>
  );
}

/* ───────────── Audit ───────────── */
function Audit({ loc, api }) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => { api("/admin/audit").then((d) => setRows(d.actions)).catch(() => setRows([])); }, [api]);
  if (rows === null) return <div className="adm-empty">…</div>;
  if (!rows.length) return <div className="adm-empty">{T("記録なし", "No actions yet")(loc)}</div>;
  return (
    <div>
      {rows.map((a) => (
        <div className="adm-card adm-row" key={a.id} style={{ padding: "10px 14px" }}>
          <div><span className="adm-pill">{a.action}</span> <span className="adm-muted">{a.targetType}{a.targetId ? ` ${a.targetId.slice(0, 14)}…` : ""}</span></div>
          <div className="adm-mono">{a.actorName || T("システム", "system")(loc)} · {new Date(Number(a.createdAt)).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
