import React from "react";
import "./api.jsx";  // ensures window.N101_API is registered in THIS island's bundle
import { withBoundary } from "./ErrorBoundary.jsx";

/* Admin console island. Bootstraps the session from the refresh cookie, gates on
 * role=admin, then drives the /admin/* API. All data is fetched client-side with
 * the in-memory access token (refreshed on 401). Tabs: Dashboard, Reports, Posts,
 * Users, Media, Featured, Settings, Audit. Styling = the .adm-* classes in
 * admin.astro. */

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
const fmtDate = (ms) => new Date(Number(ms)).toLocaleDateString(undefined, { timeZone: 'UTC' }); // match the SSR surfaces (UTC-pinned)
const fmtBytes = (b) => b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : (b / 1e3).toFixed(0) + " KB";
const relTime = (ms, loc) => {
  const s = Math.max(1, Math.floor((Date.now() - Number(ms)) / 1000));
  if (s < 60) return loc === "ja" ? `${s}秒前` : `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return loc === "ja" ? `${m}分前` : `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return loc === "ja" ? `${h}時間前` : `${h}h ago`;
  const d = Math.floor(h / 24); return loc === "ja" ? `${d}日前` : `${d}d ago`;
};
const initialsOf = (s) => (String(s || "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "—").toUpperCase();

/* ───────────── icons (inline, currentColor) ───────────── */
const ICONS = {
  gauge: <><path d="M3 3h7v7H3z" /><path d="M14 3h7v7h-7z" /><path d="M14 14h7v7h-7z" /><path d="M3 14h7v7H3z" /></>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22V15" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" /></>,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
  star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />,
  sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" /></>,
  clipboard: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></>,
  eyeoff: <><path d="M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M6.6 6.6A13.5 13.5 0 0 0 1 12s4 8 11 8a9 9 0 0 0 5.4-1.6" /><path d="M1 1l22 22" /></>,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  trash: <><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  ban: <><circle cx="12" cy="12" r="10" /><path d="M4.9 4.9l14.2 14.2" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
  reopen: <><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.5 9a9 9 0 0 1 14.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0 0 20.5 15" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  history: <><circle cx="12" cy="12" r="10" /><path d="M12 7v5l3 2" /></>,
  chevron: <path d="M6 9l6 6 6-6" />,
  chevronR: <path d="M9 6l6 6-6 6" />,
  tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><path d="M7 7h.01" /></>,
  mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><path d="M22 6l-10 7L2 6" /></>,
  send: <><path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 20-7z" /></>,
  power: <><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><path d="M12 2v10" /></>,
};
function Ic({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name] || null}
    </svg>
  );
}

// Per-tab header: icon + title + one-line guidance, for a cohesive console feel.
function TabHead({ icon, title, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ color: "var(--stamp)" }}><Ic name={icon} size={19} /></span>
        <h2 className="adm-h" style={{ fontSize: 21, margin: 0 }}>{title}</h2>
      </div>
      {sub && <p className="adm-sub">{sub}</p>}
    </div>
  );
}

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

function AdminConsole({ locale }) {
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
    ["dashboard", T("ダッシュボード", "Dashboard")(loc), "gauge"],
    ["reports", T("通報", "Reports")(loc), "flag", stats?.openReports || 0],
    ["posts", T("記事", "Posts")(loc), "file"],
    ["users", T("ユーザー", "Users")(loc), "users"],
    ["media", T("メディア", "Media")(loc), "image"],
    ["content", T("カテゴリ・タグ", "Content")(loc), "tag"],
    ["featured", T("注目記事", "Featured")(loc), "star"],
    ["newsletter", T("日曜レター", "Sunday Letter")(loc), "mail"],
    ["settings", T("設定", "Settings")(loc), "sliders"],
    ["audit", T("監査ログ", "Audit")(loc), "clipboard"],
  ];

  return (
    <div className="adm">
      <div className="adm-kicker">{T("管理", "Admin")(loc)}</div>
      <h1 className="adm-h" style={{ fontSize: 34, margin: "4px 0 0" }}>{T("管理パネル", "Moderation console")(loc)}</h1>

      <div className="adm-tabs">
        {tabs.map(([k, label, icon, badge]) => (
          <button key={k} className={"adm-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
            <Ic name={icon} size={15} />{label}{badge ? <span className="badge">{badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <Dashboard loc={loc} stats={stats} onJump={setTab} />}
      {tab === "reports" && <Reports loc={loc} api={api} onChange={refreshStats} />}
      {tab === "posts" && <Posts loc={loc} api={api} onChange={refreshStats} />}
      {tab === "users" && <Users loc={loc} api={api} />}
      {tab === "media" && <Media loc={loc} api={api} />}
      {tab === "content" && <Content loc={loc} api={api} />}
      {tab === "featured" && <Featured loc={loc} api={api} />}
      {tab === "newsletter" && <SundayLetter loc={loc} api={api} />}
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
    [stats.openReports, T("未処理の通報", "Open reports")(loc), stats.openReports > 0, "reports", "flag"],
    [stats.activeBans, T("有効なBAN", "Active bans")(loc), false, "users", "ban"],
    [stats.totalUsers, T("ユーザー総数", "Total users")(loc), false, "users", "users"],
    [stats.newUsersToday, T("本日の新規", "New today")(loc), false, "users", "star"],
    [stats.totalPosts, T("公開記事", "Published posts")(loc), false, "posts", "file"],
    [stats.hiddenPosts, T("非表示の記事", "Hidden posts")(loc), stats.hiddenPosts > 0, "posts", "eyeoff"],
  ];
  return (
    <div className="adm-stats">
      {cells.map(([n, l, alert, jump, icon], i) => (
        <div key={i} role="button" tabIndex={0} onClick={() => onJump?.(jump)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onJump?.(jump); }}
          className={"adm-stat" + (alert ? " alert" : "")}>
          <div className="n">{n}</div>
          <div className="l"><Ic name={icon} size={13} />{l}</div>
        </div>
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
const TYPE_LABEL = { post: ["記事", "Post"], comment: ["コメント", "Comment"], user: ["ユーザー", "User"] };

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
      <button className="adm-tbtn" onClick={toggle}>
        <Ic name={open ? "chevron" : "chevronR"} size={14} />
        {T(`通報者 ${k.distinctReporters}人の詳細`, `Who reported (${k.distinctReporters})`)(loc)}
      </button>
      {open && (rows === null ? <div className="adm-muted" style={{ padding: "8px 0" }}>…</div> : (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <div key={r.id} className="adm-rep">
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
  const [typeFilter, setTypeFilter] = React.useState("all"); // all | post | comment | user
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [banFor, setBanFor] = React.useState(null); // authorId

  const load = React.useCallback(() => {
    setData(null);
    api(`/admin/reports?status=${status}`).then(setData).catch(() => setData({ mode: status === "open" ? "cases" : "list", cases: [], reports: [] }));
  }, [api, status]);
  React.useEffect(load, [load]);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try { await fn(); if (okMsg) emitToast(okMsg, "success"); load(); onChange?.(); setBanFor(null); }
    catch (e) { emitToast(e.code || e.message || "Failed", "error"); }
    finally { setBusy(""); }
  };

  const ep = (k) => (k.targetType === "post" ? "posts" : "comments");
  const matchesType = (t) => typeFilter === "all" || t === typeFilter;

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
  const reopen = async (r) => {
    const ok = await confirmDialog({
      loc, confirmLabel: T("再開", "Reopen")(loc),
      title: T("通報を再開", "Reopen report")(loc),
      message: T("この通報を未処理キューに戻します（対象の非表示は解除されません）。", "Sends this report back to the open queue. Does not unhide the target.")(loc),
    });
    if (!ok) return;
    run(r.id + "ro", () => api(`/admin/reports/${r.id}`, { method: "PATCH", body: JSON.stringify({ status: "open" }) }), T("再開しました。", "Reopened.")(loc));
  };
  const doBan = (authorId, reason, duration) =>run(authorId + "ban", () => api(`/admin/users/${authorId}/ban`, { method: "POST", body: JSON.stringify({ reason, duration }) }), T("BANしました。", "User banned.")(loc));

  const renderCase = (k, sev) => {
    const t = k.target || {};
    const isPost = k.targetType === "post";
    const isComment = k.targetType === "comment";
    const isUser = k.targetType === "user";
    const title = isPost ? (t.postTitle || k.targetId) : isComment ? `“${t.excerpt || ""}”` : `@${t.handle || t.authorName || k.targetId}`;
    const href = isPost && t.postSlug ? `/${loc}/p/${t.postSlug}` : (t.handle ? `/${loc}/u/${t.handle}` : null);
    const thumb = isPost ? t.cover : t.authorAvatarUrl;
    const breakdown = reasonBreakdown(k.reasons);
    return (
      <div className={"adm-card" + (sev === "high" ? " high" : sev === "watch" ? " watch" : "")} key={k.targetType + k.targetId}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <Thumb src={thumb} size={isPost ? 64 : 48} rounded={isPost ? 12 : 999} fallback={initialsOf(t.authorName || t.handle)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 7 }}>
              <span className={"adm-count" + (sev === "watch" ? " watch" : "")}>
                <Ic name="flag" size={12} />{k.distinctReporters} {T("人", k.distinctReporters === 1 ? "reporter" : "reporters")(loc)}
              </span>
              <span className="adm-pill">{(TYPE_LABEL[k.targetType] || [k.targetType, k.targetType])[loc === "ja" ? 0 : 1]}</span>
              {k.totalReports !== k.distinctReporters && <span className="adm-pill">{k.totalReports} {T("件", "reports")(loc)}</span>}
              {t.isHidden && <span className="adm-pill amber"><Ic name="eyeoff" size={11} />{T("非表示中", "hidden")(loc)}</span>}
              <span className="adm-mono" style={{ marginLeft: "auto" }}>{relTime(k.lastAt, loc)}</span>
            </div>
            <div className="adm-title" style={{ marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
              {href ? <a className="adm-link" href={href} target="_blank" rel="noreferrer">{title}</a> : title}
            </div>
            {t.authorName && !isUser && <div className="adm-mono" style={{ marginBottom: 6 }}>{T("投稿者", "by")(loc)} {t.authorName}{t.handle ? ` @${t.handle}` : ""}</div>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {breakdown.map(([r, n]) => (
                <span key={r} className="adm-pill">{reasonLabel(r, loc)}{n > 1 ? ` ×${n}` : ""}</span>
              ))}
            </div>
            <CaseReporters loc={loc} api={api} k={k} />
            <div className="adm-acts">
              {(isPost || isComment) && !t.isHidden && <button className="adm-tbtn danger" disabled={!!busy} onClick={() => hide(k)}><Ic name="eyeoff" size={15} />{T("非表示", "Hide")(loc)}</button>}
              {(isPost || isComment) && t.isHidden && <span className="adm-mono" style={{ alignSelf: "center" }}>{T("自動/手動で非表示中", "currently hidden")(loc)}</span>}
              {(isPost || isComment) && <button className="adm-tbtn danger" disabled={!!busy} onClick={() => del(k)}><Ic name="trash" size={15} />{T("削除", "Delete")(loc)}</button>}
              {t.authorId && <button className="adm-tbtn danger" disabled={!!busy} onClick={() => setBanFor(banFor === t.authorId ? null : t.authorId)}><Ic name="ban" size={15} />{T("投稿者をBAN", "Ban author")(loc)}</button>}
              <button className="adm-tbtn" disabled={!!busy} onClick={() => dismissAll(k)}><Ic name="check" size={15} />{T("却下", "Dismiss")(loc)}</button>
            </div>
            {banFor && banFor === t.authorId && (
              <BanForm loc={loc} busy={!!busy} onCancel={() => setBanFor(null)} onBan={(reason, duration) => doBan(t.authorId, reason, duration)} />
            )}
          </div>
        </div>
      </div>
    );
  };

  const TYPES = [["all", T("すべて", "All")(loc)], ["post", T("記事", "Posts")(loc)], ["comment", T("コメント", "Comments")(loc)], ["user", T("ユーザー", "Users")(loc)]];

  const cases = (data?.cases || []).filter((k) => matchesType(k.targetType));
  const closed = (data?.reports || []).filter((r) => matchesType(r.targetType));

  return (
    <div>
      <TabHead icon="flag" title={T("通報", "Reports")(loc)}
        sub={T("通報は対象ごとに1件の案件にまとめられます。記事とコメントを非表示・削除し、投稿者をBANできます。", "Reports are grouped into one case per target. Hide or delete posts and comments, and ban the author.")(loc)} />

      <div className="adm-bar">
        <div className="adm-seg">
          {["open", "resolved", "dismissed"].map((s) => (
            <button key={s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>
              {T({ open: "未処理", resolved: "解決済み", dismissed: "却下" }[s], { open: "Open", resolved: "Resolved", dismissed: "Dismissed" }[s])(loc)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          {TYPES.map(([v, label]) => (
            <button key={v} className={"adm-chip" + (typeFilter === v ? " on" : "")} onClick={() => setTypeFilter(v)}>{label}</button>
          ))}
        </div>
      </div>

      {data === null ? <div className="adm-empty">…</div> : status === "open" ? (
        <>
          <div className="adm-muted" style={{ marginBottom: 12 }}>
            {T(`同じ対象を ${data.threshold} 人以上が通報すると、ここに表示されます。しきい値未満は非表示（しきい値を下げると現れます）。`, `Cases appear here once ${data.threshold}+ distinct people report the same target. Below the threshold they stay hidden — lower it to reveal them.`)(loc)}
          </div>
          {cases.length === 0
            ? <div className="adm-empty">{T("通報はありません。", "No open reports.")(loc)}</div>
            : (
              <>
                <div className="adm-sec high"><Ic name="alert" size={16} />{T("要対応", "Open cases")(loc)} · {cases.length}</div>
                {cases.map((k) => renderCase(k, "high"))}
              </>
            )}
        </>
      ) : (
        closed.length === 0
          ? <div className="adm-empty">{T("ここには通報はありません。", "No reports here.")(loc)}</div>
          : (
            <>
              <div className="adm-sec"><Ic name="history" size={15} />{T("履歴", "History")(loc)} · {closed.length}</div>
              {closed.map((r) => {
                const t = r.target || {};
                const title = r.targetType === "post" ? (t.postTitle || r.targetId) : r.targetType === "comment" ? `“${t.excerpt || ""}”` : `@${t.handle || r.targetId}`;
                return (
                  <div className="adm-card" key={r.id}>
                    <div className="adm-row" style={{ alignItems: "flex-start", gap: 14 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
                          <span className="adm-pill">{(TYPE_LABEL[r.targetType] || [r.targetType, r.targetType])[loc === "ja" ? 0 : 1]}</span>
                          <span className={"adm-pill " + (status === "resolved" ? "ok" : "")}>{status === "resolved" ? T("解決", "resolved")(loc) : T("却下", "dismissed")(loc)}</span>
                          <span className="adm-pill">{reasonLabel(r.reason, loc)}</span>
                          {r.dupeCount > 1 && <span className="adm-pill">{r.dupeCount}×</span>}
                        </div>
                        <div className="adm-title" style={{ fontSize: 15, marginBottom: 3 }}>{title}</div>
                        <div className="adm-mono">{T("通報者", "by")(loc)} {r.reporterName || "—"} · {fmtDate(r.createdAt)}</div>
                        <div className="adm-mono" style={{ marginTop: 4 }}>
                          {T("対応", "closed by")(loc)} {r.resolverName || T("システム", "system")(loc)}{r.resolvedAt ? ` · ${fmtDate(r.resolvedAt)}` : ""}
                        </div>
                        {r.resolutionNote && <div className="adm-muted" style={{ marginTop: 4, fontStyle: "italic" }}>“{r.resolutionNote}”</div>}
                      </div>
                      <button className="adm-tbtn info" disabled={busy === r.id + "ro"} onClick={() => reopen(r)} style={{ flexShrink: 0 }}>
                        <Ic name="reopen" size={15} />{T("再開", "Reopen")(loc)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )
      )}
    </div>
  );
}

/* ───────────── Posts (proactive moderation) ───────────── */
function Posts({ loc, api, onChange }) {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [banFor, setBanFor] = React.useState(null);
  const load = React.useCallback((query) => {
    setRows(null);
    api(`/admin/posts?q=${encodeURIComponent(query || "")}`).then((d) => setRows(d.posts)).catch(() => setRows([]));
  }, [api]);
  React.useEffect(() => { load(""); }, [load]);
  React.useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q, load]);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try { await fn(); if (okMsg) emitToast(okMsg, "success"); load(q); onChange?.(); setBanFor(null); }
    catch (e) { emitToast(e.code || e.message || "Failed", "error"); }
    finally { setBusy(""); }
  };
  const titleOf = (p) => (loc === "ja" ? (p.titleJa || p.titleEn) : p.titleEn) || "—";

  const toggleHide = async (p) => {
    const hiding = !p.isHidden;
    const ok = await confirmDialog({
      loc, note: hiding, danger: hiding,
      confirmLabel: hiding ? T("非表示", "Hide")(loc) : T("公開に戻す", "Unhide")(loc),
      title: hiding ? T("記事を非表示", "Hide post")(loc) : T("記事を公開に戻す", "Unhide post")(loc),
      message: hiding ? T("公開ページから外します（後で戻せます）。", "Removes it from the public site (reversible).")(loc) : T("もう一度公開ページに表示します。", "Makes it public again.")(loc),
    });
    if (!ok) return;
    run(p.id + "h", () => api(`/admin/posts/${p.id}/hide`, { method: "PATCH", body: JSON.stringify({ hidden: hiding, reason: "moderation", note: ok.note || "" }) }), hiding ? T("非表示にしました。", "Hidden.")(loc) : T("公開に戻しました。", "Unhidden.")(loc));
  };
  const del = async (p) => {
    const ok = await confirmDialog({
      loc, danger: true, note: true, confirmLabel: T("削除", "Delete")(loc),
      title: T("記事を削除", "Delete post")(loc), message: T("この操作は取り消せません。", "This can't be undone.")(loc),
    });
    if (!ok) return;
    run(p.id + "d", () => api(`/admin/posts/${p.id}`, { method: "DELETE", body: JSON.stringify({ note: ok.note }) }), T("削除しました。", "Deleted.")(loc));
  };
  const doBan = (p, reason, duration) => run(p.id + "ban", () => api(`/admin/users/${p.authorId}/ban`, { method: "POST", body: JSON.stringify({ reason, duration }) }), T("BANしました。", "Author banned.")(loc));

  return (
    <div>
      <TabHead icon="file" title={T("記事", "Posts")(loc)}
        sub={T("公開中のすべての記事を検索して、非表示・削除、投稿者のBANができます（通報がなくても対応可能）。", "Search every published post — hide, delete, or ban the author, even without a report.")(loc)} />
      <div className="adm-search">
        <Ic name="search" size={16} />
        <input className="adm-in" placeholder={T("タイトルで検索…", "Search by title…")(loc)} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {rows === null ? <div className="adm-empty">…</div>
        : rows.length === 0 ? <div className="adm-empty">{T("該当する記事がありません。", "No posts found.")(loc)}</div>
        : rows.map((p) => (
          <div className="adm-card" key={p.id}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <Thumb src={p.cover} size={64} rounded={12} fallback={initialsOf(p.authorName)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
                  {p.isHidden && <span className="adm-pill amber"><Ic name="eyeoff" size={11} />{T("非表示中", "hidden")(loc)}</span>}
                  <span className="adm-mono" style={{ marginLeft: "auto" }}>♥ {p.likes} · 💬 {p.comments ?? 0}</span>
                </div>
                <div className="adm-title" style={{ marginBottom: 3 }}>
                  {p.slug ? <a className="adm-link" href={`/${loc}/p/${p.slug}`} target="_blank" rel="noreferrer">{titleOf(p)}</a> : titleOf(p)}
                </div>
                <div className="adm-mono">{p.authorName || "—"}{p.authorHandle ? ` @${p.authorHandle}` : ""}</div>
                <div className="adm-acts">
                  <button className={p.isHidden ? "adm-tbtn" : "adm-tbtn danger"} disabled={!!busy} onClick={() => toggleHide(p)}>
                    <Ic name={p.isHidden ? "eye" : "eyeoff"} size={15} />{p.isHidden ? T("公開に戻す", "Unhide")(loc) : T("非表示", "Hide")(loc)}
                  </button>
                  <button className="adm-tbtn danger" disabled={!!busy} onClick={() => del(p)}><Ic name="trash" size={15} />{T("削除", "Delete")(loc)}</button>
                  {p.authorId && <button className="adm-tbtn danger" disabled={!!busy} onClick={() => setBanFor(banFor === p.id ? null : p.id)}><Ic name="ban" size={15} />{T("投稿者をBAN", "Ban author")(loc)}</button>}
                </div>
                {banFor === p.id && <BanForm loc={loc} busy={!!busy} onCancel={() => setBanFor(null)} onBan={(reason, duration) => doBan(p, reason, duration)} />}
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}

/* ───────────── Users ───────────── */
function Users({ loc, api }) {
  const [q, setQ] = React.useState("");
  const [bannedOnly, setBannedOnly] = React.useState(false);
  const [rows, setRows] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [banFor, setBanFor] = React.useState(null);
  const load = React.useCallback((query, banned) => {
    setRows(null);
    api(`/admin/users?q=${encodeURIComponent(query || "")}${banned ? "&banned=1" : ""}`).then((d) => setRows(d.users)).catch(() => setRows([]));
  }, [api]);
  React.useEffect(() => { const t = setTimeout(() => load(q, bannedOnly), 300); return () => clearTimeout(t); }, [q, bannedOnly, load]);

  const wrap = async (fn, key, okMsg) => {
    setBusy(key);
    try { await fn(); if (okMsg) emitToast(okMsg, "success"); load(q, bannedOnly); setBanFor(null); }
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
      <TabHead icon="users" title={T("ユーザー", "Users")(loc)}
        sub={T("名前・@ハンドル・メールで検索して、BANや管理者権限を変更できます。", "Search by name, @handle, or email to ban, unban, or change roles.")(loc)} />
      <div className="adm-search">
        <Ic name="search" size={16} />
        <input className="adm-in" placeholder={T("名前・@ハンドル・メールで検索", "Search name, @handle, or email")(loc)} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="adm-bar">
        <button className={"adm-chip" + (!bannedOnly ? " on" : "")} onClick={() => setBannedOnly(false)}>{T("すべて", "All")(loc)}</button>
        <button className={"adm-chip" + (bannedOnly ? " on" : "")} onClick={() => setBannedOnly(true)}>{T("BAN中のみ", "Banned only")(loc)}</button>
      </div>
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
                  : u.role !== "admin" && <button className="adm-btn danger" disabled={!!busy} onClick={() => setBanFor(banFor === u.id ? null : u.id)}><Ic name="ban" size={14} />{T("BAN", "Ban")(loc)}</button>}
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
    const ok = await confirmDialog({ loc, danger: true, confirmLabel: T("ゴミ箱へ移動", "Move to trash")(loc), title: T("孤立画像をゴミ箱へ", "Trash orphans")(loc), message: T(`${sel.size}件をゴミ箱へ移動します（30日間復元可能）。`, `Move ${sel.size} image(s) to trash? Recoverable for 30 days.`)(loc) });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api("/admin/media/bulk-delete", { method: "POST", body: JSON.stringify({ keys: [...sel] }) });
      const extra = r.skippedRecent ? T(`（${r.skippedRecent}件は30日未満のためスキップ）`, ` (${r.skippedRecent} skipped — uploaded <30 days ago)`)(loc) : "";
      emitToast(T(`${r.deleted}件をゴミ箱へ移動。`, `Moved ${r.deleted} to trash.`)(loc) + extra, "success");
      load();
    }
    catch (e) { emitToast(e.code || "Failed", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <TabHead icon="image" title={T("メディア", "Media")(loc)}
        sub={T("どのDB行からも参照されていない孤立画像を見つけて、R2から安全に削除します。", "Find images in R2 that no post or profile references, and clear them safely.")(loc)} />
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
          <button className="adm-btn danger" onClick={del} disabled={!sel.size || busy}><Ic name="trash" size={14} />{T("ゴミ箱へ移動（30日間復元可）", "Move to trash · recoverable 30 days")(loc)}</button>
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
      <Trash loc={loc} api={api} onRestored={load} />
    </div>
  );
}

/* Trash drawer under the orphan finder — the "recoverable for 30 days" promise as
 * a button instead of a CLI. Restore puts files back at their original key (never
 * clobbers a re-upload; the API skips those). */
function Trash({ loc, api, onRestored }) {
  const [items, setItems] = React.useState(null);
  const [sel, setSel] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => { setSel(new Set()); api("/admin/media/trash").then((d) => setItems(d.items)).catch(() => setItems([])); }, [api]);
  React.useEffect(load, [load]);

  if (!items) return null;
  const toggle = (k) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const restore = async () => {
    if (!sel.size || busy) return;
    setBusy(true);
    try {
      const r = await api("/admin/media/restore", { method: "POST", body: JSON.stringify({ keys: [...sel] }) });
      const extra = r.skippedExists ? T(`（${r.skippedExists}件は再アップロード済みのためスキップ）`, ` (${r.skippedExists} skipped — already re-uploaded)`)(loc) : "";
      emitToast(T(`${r.restored}件を復元。`, `Restored ${r.restored}.`)(loc) + extra, "success");
      load(); onRestored();
    }
    catch (e) { emitToast(e.code || "Failed", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 26 }}>
      <div className="adm-row" style={{ margin: "8px 0 10px" }}>
        <div className="adm-muted"><Ic name="trash" size={14} /> {T(`ゴミ箱 — ${items.length}件（削除から30日後に自動消去）`, `Trash — ${items.length} item(s), auto-purged 30 days after deletion`)(loc)}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="adm-btn" onClick={() => setSel(new Set(items.map((t) => t.key)))} disabled={!items.length}>{T("全選択", "Select all")(loc)}</button>
          <button className="adm-btn" onClick={restore} disabled={!sel.size || busy}>{T("選択を復元", "Restore selected")(loc)}</button>
        </div>
      </div>
      {items.length === 0 ? <div className="adm-empty">{T("ゴミ箱は空です。", "Trash is empty.")(loc)}</div>
        : items.map((t) => (
          <label className="adm-card adm-row" key={t.key} style={{ cursor: "pointer" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
              <input type="checkbox" checked={sel.has(t.key)} onChange={() => toggle(t.key)} />
              <div style={{ minWidth: 0 }}>
                <div className="adm-mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.originalKey}</div>
                <div className="adm-muted">{fmtBytes(t.size)} · {T("削除", "deleted")(loc)} {fmtDate(t.deletedAt)} · {T("消去予定", "purges")(loc)} {fmtDate(t.purgesAt)}</div>
              </div>
            </div>
            <span className="adm-pill">{T("ゴミ箱", "trash")(loc)}</span>
          </label>
        ))}
    </div>
  );
}

/* ───────────── Content: categories + tags ───────────── */
const TINTS = ["rose", "amber", "blue", "lilac", "peach", "sage", "clay", "mauve", "sky", "cream"];
const TINT_HEX = {
  rose: "#FBC5CC", amber: "#FFD27A", blue: "#A6C7F0", lilac: "#D6B8F0", peach: "#FBB58B",
  sage: "#B6D58E", clay: "#E89A7E", mauve: "#D89DBE", sky: "#9BC2EE", cream: "#FFE6B5",
};

function Content({ loc, api }) {
  const [cats, setCats] = React.useState(null);
  const [tags, setTags] = React.useState(null);
  const load = React.useCallback(() => {
    api("/admin/categories").then((d) => setCats(d.categories)).catch(() => setCats([]));
    api("/admin/tags").then((d) => setTags(d.tags)).catch(() => setTags([]));
  }, [api]);
  React.useEffect(() => { load(); }, [load]);

  const saveCat = async (id, patch) => {
    try { await api(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); emitToast(T("カテゴリを保存しました。", "Category saved.")(loc), "success"); load(); }
    catch (e) { emitToast(e.code || e.message || "Failed", "error"); }
  };
  const delCat = async (c) => {
    if (c.postCount > 0) return emitToast(T(`「${c.labelEn}」には ${c.postCount} 件の記事があり削除できません。`, `“${c.labelEn}” has ${c.postCount} post(s) — can't delete.`)(loc), "error");
    const ok = await confirmDialog({ loc, danger: true, confirmLabel: T("削除", "Delete")(loc), title: T(`「${c.labelEn}」を削除？`, `Delete “${c.labelEn}”?`)(loc), message: T("空のカテゴリのみ削除できます。", "Only empty categories can be deleted.")(loc) });
    if (!ok) return;
    try { await api(`/admin/categories/${c.id}`, { method: "DELETE" }); emitToast(T("カテゴリを削除しました。", "Category deleted.")(loc), "success"); load(); }
    catch (e) { emitToast(e.code || e.message || "Failed", "error"); }
  };
  const renameTag = async (id, label) => {
    try { await api(`/admin/tags/${id}`, { method: "PATCH", body: JSON.stringify({ label }) }); emitToast(T("タグ名を変更しました。", "Tag renamed.")(loc), "success"); load(); }
    catch (e) { emitToast(e.code || e.message || "Failed", "error"); }
  };
  const delTag = async (t) => {
    if (t.postCount > 0) return emitToast(T(`#${t.label} は ${t.postCount} 件の記事で使用中のため削除できません。`, `#${t.label} is on ${t.postCount} post(s) — can't delete.`)(loc), "error");
    const ok = await confirmDialog({ loc, danger: true, confirmLabel: T("削除", "Delete")(loc), title: T(`#${t.label} を削除？`, `Delete #${t.label}?`)(loc), message: T("未使用のタグのみ削除できます。", "Only unused tags can be deleted.")(loc) });
    if (!ok) return;
    try { await api(`/admin/tags/${t.id}`, { method: "DELETE" }); emitToast(T("タグを削除しました。", "Tag deleted.")(loc), "success"); load(); }
    catch (e) { emitToast(e.code || e.message || "Failed", "error"); }
  };

  return (
    <div>
      <TabHead icon="tag" title={T("カテゴリ・タグ", "Content")(loc)}
        sub={T("カテゴリのラベル・漢字・色を編集します。タグの名前変更・削除も可能です。使用中のカテゴリ・タグは削除できません。", "Edit category labels, kanji, and colours. Rename or remove tags. In-use categories and tags can't be deleted.")(loc)} />
      <div className="adm-col-h">{T("カテゴリ", "Categories")(loc)}</div>
      {cats === null ? <div className="adm-empty">…</div>
        : !cats.length ? <div className="adm-empty">{T("カテゴリなし", "No categories")(loc)}</div>
        : cats.map((c) => <CatRow key={c.id} loc={loc} cat={c} onSave={saveCat} onDelete={delCat} />)}

      <div className="adm-col-h" style={{ marginTop: 26 }}>{T("タグ", "Tags")(loc)}</div>
      {tags === null ? <div className="adm-empty">…</div>
        : !tags.length ? <div className="adm-empty">{T("タグなし", "No tags")(loc)}</div>
        : tags.map((t) => <TagRow key={t.id} loc={loc} tag={t} onRename={renameTag} onDelete={delTag} />)}
    </div>
  );
}

function CatRow({ loc, cat, onSave, onDelete }) {
  const [labelEn, setLabelEn] = React.useState(cat.labelEn);
  const [labelJa, setLabelJa] = React.useState(cat.labelJa);
  const [kanji, setKanji] = React.useState(cat.kanji || "");
  const [tint, setTint] = React.useState(cat.tint);
  const dirty = labelEn.trim() !== cat.labelEn || labelJa.trim() !== cat.labelJa || kanji.trim() !== (cat.kanji || "") || tint !== cat.tint;
  return (
    <div className="adm-card" style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: TINT_HEX[tint] || "var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#3a2a2a" }}>{kanji || "•"}</span>
        <input className="adm-in" style={{ maxWidth: 180, height: 36 }} value={labelEn} maxLength={40} placeholder="English label" onChange={(e) => setLabelEn(e.target.value)} />
        <input className="adm-in" style={{ maxWidth: 140, height: 36 }} value={labelJa} maxLength={40} placeholder="日本語" onChange={(e) => setLabelJa(e.target.value)} />
        <input className="adm-in" style={{ maxWidth: 56, height: 36, textAlign: "center" }} value={kanji} maxLength={2} placeholder="漢" onChange={(e) => setKanji(e.target.value)} />
        <span className="adm-mono" style={{ marginLeft: "auto" }}>{cat.postCount} {T("記事", cat.postCount === 1 ? "post" : "posts")(loc)}</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {TINTS.map((h) => (
          <button key={h} title={h} onClick={() => setTint(h)}
            style={{ width: 22, height: 22, borderRadius: "50%", background: TINT_HEX[h], cursor: "pointer",
              border: tint === h ? "2px solid var(--ink)" : "2px solid transparent" }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="adm-btn primary" disabled={!dirty} onClick={() => onSave(cat.id, { labelEn: labelEn.trim(), labelJa: labelJa.trim(), kanji: kanji.trim(), tint })}>{T("保存", "Save")(loc)}</button>
        <button className="adm-btn danger" disabled={cat.postCount > 0} onClick={() => onDelete(cat)}>{T("削除", "Delete")(loc)}</button>
      </div>
    </div>
  );
}

function TagRow({ loc, tag, onRename, onDelete }) {
  const [label, setLabel] = React.useState(tag.label);
  const dirty = label.trim() !== tag.label && label.trim().length > 0;
  return (
    <div className="adm-card adm-row" style={{ padding: "10px 14px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
        <span className="adm-muted">#</span>
        <input className="adm-in" style={{ maxWidth: 220, height: 34 }} value={label} maxLength={50} onChange={(e) => setLabel(e.target.value)} />
        <span className="adm-mono">{tag.postCount}</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="adm-btn primary" disabled={!dirty} onClick={() => onRename(tag.id, label.trim())}>{T("名前変更", "Rename")(loc)}</button>
        <button className="adm-btn danger" disabled={tag.postCount > 0} onClick={() => onDelete(tag)}>{T("削除", "Delete")(loc)}</button>
      </div>
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
      <TabHead icon="star" title={T("注目記事", "Featured")(loc)}
        sub={T("ホームの「注目記事」枠を編集します。保存するまで反映されません。", "Curate the home “Also featured” slot. Nothing changes until you save.")(loc)} />
      <div className="adm-row" style={{ marginBottom: 14 }}>
        <div className="adm-muted">{T("ヒーローと「おすすめ」は人気・新着で自動。ここは1枠のみ。", "Hero + picks are automatic; this is the one curated slot.")(loc)}</div>
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
        <div className="adm-search">
          <Ic name="search" size={16} />
          <input className="adm-in" placeholder={T("タイトルで検索…", "Search by title…")(loc)} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {results.map((p) => {
          const used = inAny(p.id);
          const full = cur[target].length >= cap[target];
          return (
            <div className="adm-card adm-row" key={p.id} style={{ padding: "10px 14px" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                <Thumb src={p.cover} size={52} rounded={8} fallback={initialsOf(p.authorName)} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{titleOf(p)} {p.isHidden && <span className="adm-pill amber">{T("非表示", "hidden")(loc)}</span>}</div>
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

/* ───────────── Sunday Letter (newsletter admin) ───────────── */
function SundayLetter({ loc, api }) {
  const [data, setData] = React.useState(null);
  const [toggling, setToggling] = React.useState(false);

  const load = React.useCallback(() => {
    api("/admin/newsletter").then(setData).catch(() => {});
  }, [api]);

  React.useEffect(() => { load(); }, [load]);

  if (!data) return <div className="adm-empty">…</div>;

  const { enabled, stats, nextSendAt, subscribers } = data;

  const toggle = async () => {
    setToggling(true);
    try {
      const res = await api("/admin/newsletter", { method: "PUT", body: JSON.stringify({ enabled: !enabled }) });
      setData((d) => ({ ...d, enabled: res.enabled }));
      emitToast(
        res.enabled
          ? T("ニュースレターを有効にしました。", "Newsletter enabled.")(loc)
          : T("ニュースレターを無効にしました。", "Newsletter disabled.")(loc),
        "info",
      );
    } catch (e) {
      emitToast(e.code || "Failed", "error");
    } finally {
      setToggling(false);
    }
  };

  const fmtNextSend = (ms) => {
    const d = new Date(Number(ms));
    return loc === "ja"
      ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（日）09:00 JST`
      : d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) + " · 09:00 JST";
  };

  const jaPercent = stats.total > 0 ? Math.round((stats.ja / stats.total) * 100) : 0;
  const enPercent = stats.total > 0 ? 100 - jaPercent : 0;

  return (
    <div style={{ maxWidth: 720 }}>
      <TabHead
        icon="mail"
        title={T("日曜レター", "Sunday Letter")(loc)}
        sub={T("毎週日曜の朝に届く、ゆっくりとした週刊レター。読者へのニュースレターを管理します。", "A slow weekly letter, delivered every Sunday morning. Manage your newsletter here.")(loc)}
      />

      {/* Kill switch */}
      <div className="adm-card" style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ color: enabled ? "var(--stamp)" : "var(--inkFaint)" }}><Ic name="power" size={18} /></span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              {T("システム", "System")(loc)}
              <span style={{
                marginLeft: 8, padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: enabled ? "color-mix(in oklab, var(--stamp) 12%, transparent)" : "var(--line)",
                color: enabled ? "var(--stamp)" : "var(--inkFaint)",
              }}>
                {enabled ? T("稼働中", "LIVE")(loc) : T("停止中", "OFF")(loc)}
              </span>
            </span>
          </div>
          <div className="adm-muted" style={{ fontSize: 13 }}>
            {enabled
              ? T("購読受付中・送信スケジュール有効。OFFにすると登録フォームが503を返します。", "Signups open · send schedule active. Turning OFF makes the signup form return 503.")(loc)
              : T("システム停止中。登録フォームは503を返し、送信は行われません。", "System is OFF. Signup form returns 503 and no sends will occur.")(loc)
            }
          </div>
        </div>
        <button
          className={enabled ? "adm-btn danger" : "adm-btn primary"}
          disabled={toggling}
          onClick={async () => {
            const yes = await confirmDialog({
              title: enabled ? T("システムを停止しますか？", "Disable the newsletter system?")(loc) : T("システムを有効にしますか？", "Enable the newsletter system?")(loc),
              message: enabled
                ? T("OFFにすると、登録フォームが503を返します。既存の読者リストは保持されます。", "Turning OFF makes the signup form return 503. Existing subscriber list is kept.")(loc)
                : T("ONにすると、登録フォームが再び受付を開始します。", "Turning ON re-opens the signup form to new subscribers.")(loc),
              confirmLabel: enabled ? T("停止する", "Disable")(loc) : T("有効にする", "Enable")(loc),
              danger: enabled,
            });
            if (yes) toggle();
          }}
          style={{ whiteSpace: "nowrap" }}
        >
          <Ic name="power" size={14} />
          {" "}{enabled ? T("停止する", "Turn OFF")(loc) : T("有効にする", "Turn ON")(loc)}
        </button>
      </div>

      {/* Stats */}
      <div className="adm-stats" style={{ marginBottom: 16 }}>
        <div className="adm-stat">
          <div className="n">{stats.total.toLocaleString()}</div>
          <div className="l"><Ic name="users" size={13} />{T("購読者合計", "Total subscribers")(loc)}</div>
        </div>
        <div className="adm-stat">
          <div className="n">{stats.last7Days}</div>
          <div className="l"><Ic name="star" size={13} />{T("過去7日間", "Last 7 days")(loc)}</div>
        </div>
        <div className="adm-stat">
          <div className="n">{stats.ja}</div>
          <div className="l"><Ic name="file" size={13} />{T("日本語読者", "Japanese (JA)")(loc)}</div>
        </div>
        <div className="adm-stat">
          <div className="n">{stats.en}</div>
          <div className="l"><Ic name="file" size={13} />{T("英語読者", "English (EN)")(loc)}</div>
        </div>
      </div>

      {/* Language split bar */}
      {stats.total > 0 && (
        <div className="adm-card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>{T("言語別の内訳", "Language breakdown")(loc)}</div>
          <div style={{ display: "flex", height: 10, borderRadius: 8, overflow: "hidden", gap: 2, marginBottom: 8 }}>
            <div style={{ flex: jaPercent, background: "var(--stamp)", borderRadius: "8px 0 0 8px" }} />
            <div style={{ flex: enPercent, background: "#3B5168", borderRadius: "0 8px 8px 0" }} />
          </div>
          <div style={{ display: "flex", gap: 20, fontSize: 12, color: "var(--inkSoft)" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--stamp)", marginRight: 5 }} />JA {jaPercent}%</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#3B5168", marginRight: 5 }} />EN {enPercent}%</span>
          </div>
        </div>
      )}

      {/* Send schedule */}
      <div className="adm-card" style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
            <Ic name="history" size={15} />{T("次回送信予定", "Next scheduled send")(loc)}
          </div>
          <div style={{ fontSize: 14, color: "var(--inkSoft)", marginBottom: 6 }}>{fmtNextSend(nextSendAt)}</div>
          <div className="adm-muted" style={{ fontSize: 12 }}>
            {T("毎週日曜日 09:00 JST に自動送信（実装後）。現在はキャプチャのみ。", "Auto-sends every Sunday at 09:00 JST once sending is implemented. Currently capture-only.")(loc)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <span style={{
            padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: "color-mix(in oklab, #3B5168 12%, transparent)",
            color: "#3B5168",
          }}>{T("キャプチャ中", "Capture only")(loc)}</span>
        </div>
      </div>

      {/* Subscriber list */}
      <div className="adm-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>{T("最近の購読者", "Recent subscribers")(loc)}</span>
          <span className="adm-muted" style={{ fontSize: 12 }}>{T("最新50件", "Latest 50")(loc)}</span>
        </div>
        {!subscribers.length
          ? <div className="adm-empty" style={{ padding: "28px 18px" }}>{T("まだ購読者がいません。", "No subscribers yet.")(loc)}</div>
          : subscribers.map((s) => (
            <div key={s.id} className="adm-row" style={{ padding: "10px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, fontFamily: "var(--fontMono, monospace)", fontSize: 13, color: "var(--ink)" }}>{s.email}</div>
              <span style={{
                padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: s.locale === "ja" ? "color-mix(in oklab, var(--stamp) 10%, transparent)" : "color-mix(in oklab, #3B5168 10%, transparent)",
                color: s.locale === "ja" ? "var(--stamp)" : "#3B5168",
              }}>{s.locale.toUpperCase()}</span>
              <div className="adm-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(s.createdAt)}</div>
            </div>
          ))
        }
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

  const dirty = cfg && draft.reportThreshold !== cfg.reportThreshold;
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
      <TabHead icon="sliders" title={T("設定", "Settings")(loc)}
        sub={T("通報の「人数」は別々のユーザー数で数えます（同一人物の連投は1人分）。", "Counts are by distinct reporters — one person spamming the same target counts once.")(loc)} />
      <Row k="reportThreshold" label={T("通報しきい値", "Report threshold")(loc)}
        hint={T("この人数以上が同じ対象を通報すると、通報タブに表示されます。これ未満の通報は表示されません。しきい値を下げると、隠れていた案件がすぐに現れます。", "Once this many different people report the same target, the case shows in the Reports tab. Anything below this stays hidden — lower the threshold and previously-hidden cases appear immediately.")(loc)} />
      <button className="adm-btn primary" disabled={!dirty || busy} onClick={save}>{dirty ? T("保存", "Save changes")(loc) : T("保存済み", "Saved")(loc)}</button>
    </div>
  );
}

/* ───────────── Audit ───────────── */
function Audit({ loc, api }) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => { api("/admin/audit").then((d) => setRows(d.actions)).catch(() => setRows([])); }, [api]);
  return (
    <div>
      <TabHead icon="clipboard" title={T("監査ログ", "Audit log")(loc)}
        sub={T("すべての管理操作の記録（誰が・いつ・何を）。", "Every admin action — who did what, and when.")(loc)} />
      {rows === null ? <div className="adm-empty">…</div>
        : !rows.length ? <div className="adm-empty">{T("記録なし", "No actions yet")(loc)}</div>
        : rows.map((a) => (
          <div className="adm-card adm-row" key={a.id} style={{ padding: "10px 14px" }}>
            <div><span className="adm-pill">{a.action}</span> <span className="adm-muted">{a.targetType}{a.targetId ? ` ${a.targetId.slice(0, 14)}…` : ""}</span></div>
            <div className="adm-mono">{a.actorName || T("システム", "system")(loc)} · {new Date(Number(a.createdAt)).toLocaleString()}</div>
          </div>
        ))}
    </div>
  );
}

export default withBoundary(AdminConsole, "admin");
