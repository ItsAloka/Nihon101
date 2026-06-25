// Readers / Writers stats + an Instagram-style follower/following modal.
// "Readers" = people who follow this profile; "Writers" = people it follows.
// Used on the SSR profile (/[locale]/u/[handle]) and the SPA own-profile.
// Self-styled with the site's theme CSS vars (present on every Shell page).
import React from "react";
import { createPortal } from "react-dom";
import "./api.jsx";       // window.N101_API
import "./content.jsx";   // window.N101_CONTENT (followApi)
import { withBoundary } from "./ErrorBoundary.jsx";

const TINTS = ["#FBC5CC", "#FFD27A", "#A6C7F0", "#D6B8F0", "#FBB58B", "#B6D58E", "#E89A7E", "#D89DBE", "#9BC2EE"];
const tintFor = (s) => { let h = 0; for (const c of String(s || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TINTS[h % TINTS.length]; };
const initialsOf = (n) => (String(n || "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "?").toUpperCase();

// One row in the list: avatar + name + handle + role, clickable → profile, with a
// per-row follow toggle (hidden for the viewer's own row and when logged out).
function Row({ u, loc, viewerId, jp }) {
  const isSelf = viewerId && u.id === viewerId;
  const [following, setFollowing] = React.useState(!!u.viewerFollows);
  const [busy, setBusy] = React.useState(false);
  const go = () => { window.location.href = `/${loc}/u/${u.handle}`; };
  const toggle = async (e) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try { await (next ? window.N101_CONTENT.followApi.follow(u.handle) : window.N101_CONTENT.followApi.unfollow(u.handle)); }
    catch { setFollowing(!next); }
    finally { setBusy(false); }
  };
  const name = jp ? (u.displayNameJa || u.displayName) : u.displayName;
  return (
    <div onClick={go} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", cursor: "pointer" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center", color: "#3a2e28",
        fontFamily: "var(--fontDisplay)", fontWeight: 600, fontSize: 17, border: "1px solid var(--line)",
        background: `linear-gradient(135deg, ${tintFor(u.handle)}, color-mix(in oklab, ${tintFor(u.handle)} 50%, var(--surface2)))` }}>
        {u.avatarUrl ? <img src={u.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initialsOf(u.displayName)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--fontDisplay)", fontWeight: 600, fontSize: 15, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ fontFamily: "var(--fontMono)", fontSize: 11, color: "var(--inkFaint)" }}>@{u.handle}{u.role && u.role !== "user" ? ` · ${u.role}` : ""}</div>
      </div>
      {!isSelf && viewerId && (
        <button onClick={toggle} disabled={busy} style={{
          appearance: "none", cursor: busy ? "default" : "pointer", flexShrink: 0,
          padding: "6px 14px", borderRadius: 999, fontFamily: "var(--fontBody)", fontSize: 12.5, fontWeight: 600,
          border: following ? "1px solid var(--line)" : "1px solid transparent",
          background: following ? "transparent" : "linear-gradient(135deg, color-mix(in oklab, var(--stamp) 78%, #fff), var(--stamp))",
          color: following ? "var(--ink)" : "#fff", opacity: busy ? 0.6 : 1,
        }}>{following ? (jp ? "フォロー中" : "Following") : (jp ? "フォロー" : "Follow")}</button>
      )}
    </div>
  );
}

const TAB_LABELS = { readers: { en: "Readers", ja: "読者" }, writers: { en: "Writers", ja: "フォロー中" } };

export function FollowListModal({ handle, locale, tab, onTab, onClose, tabs = ["readers", "writers"] }) {
  const loc = locale === "ja" ? "ja" : "en";
  const jp = loc === "ja";
  const [rows, setRows] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [viewerId, setViewerId] = React.useState(null);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    window.N101_API.refresh().then((me) => setViewerId(me ? me.id : null)).catch(() => setViewerId(null));
  }, []);

  // Reset the search box when switching tabs.
  React.useEffect(() => { setQ(""); }, [tab]);

  // Fetch the list, refetching (debounced) as the search query changes. A failed
  // fetch shows a distinct error + retry — never a silent empty "no readers".
  React.useEffect(() => {
    let live = true;
    setRows(null); setErr(false);
    const fetcher = tab === "readers" ? window.N101_CONTENT.followApi.followers : window.N101_CONTENT.followApi.followingOf;
    const t = setTimeout(() => {
      fetcher(handle, { q }).then((r) => { if (live) setRows(r); }).catch(() => { if (live) { setErr(true); setRows([]); } });
    }, q ? 220 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [tab, handle, q, reloadKey]);

  React.useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onEsc); document.body.style.overflow = ""; };
  }, [onClose]);

  const TabBtn = ({ id, en, ja }) => (
    <button onClick={() => onTab(id)} style={{
      appearance: "none", border: "none", background: "transparent", cursor: "pointer",
      padding: "14px 10px", fontFamily: "var(--fontDisplay)", fontWeight: 600, fontSize: 16,
      color: tab === id ? "var(--ink)" : "var(--inkFaint)",
      borderBottom: tab === id ? "2px solid var(--stamp)" : "2px solid transparent",
    }}>{jp ? ja : en}</button>
  );

  // Portal to <body> so the modal escapes the profile hero's stacking context —
  // otherwise cards with cover images (their own stacking contexts) can paint
  // over a fixed overlay nested inside the page.
  return createPortal((
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "color-mix(in oklab, var(--ink) 58%, transparent)",
      backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 94vw)", maxHeight: "78vh", display: "flex", flexDirection: "column",
        background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 20, overflow: "hidden",
        boxShadow: "0 40px 80px -28px color-mix(in oklab, var(--ink) 50%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 0 18px", borderBottom: "1px solid var(--line)" }}>
          {tabs.length > 1 ? (
            <div style={{ display: "flex", gap: 16 }}>
              {tabs.map((id) => <TabBtn key={id} id={id} en={TAB_LABELS[id].en} ja={TAB_LABELS[id].ja} />)}
            </div>
          ) : (
            <div style={{ padding: "16px 2px", fontFamily: "var(--fontDisplay)", fontWeight: 600, fontSize: 17, color: "var(--ink)" }}>
              {jp ? TAB_LABELS[tabs[0]].ja : TAB_LABELS[tabs[0]].en}
            </div>
          )}
          <button onClick={onClose} aria-label="Close" style={{ appearance: "none", border: "none", background: "transparent", cursor: "pointer", fontSize: 22, lineHeight: 1, color: "var(--inkFaint)", padding: 8 }}>×</button>
        </div>
        <div style={{ padding: "12px 16px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface2)", border: "1px solid var(--line)", borderRadius: 999, padding: "8px 14px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--inkFaint)" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={jp ? "名前またはハンドルで検索" : "Search by name or handle"}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
                fontFamily: "var(--fontBody)", fontSize: 13.5, color: "var(--ink)" }}
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear" style={{ appearance: "none", border: "none", background: "transparent", cursor: "pointer", color: "var(--inkFaint)", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
            )}
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: "4px 0 10px" }}>
          {rows === null ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontFamily: "var(--fontBody)", fontSize: 14, color: "var(--inkFaint)" }}>{jp ? "読み込み中…" : "Loading…"}</div>
          ) : err ? (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--fontBody)", fontSize: 14, color: "var(--inkSoft)" }}>{jp ? "読み込めませんでした。" : "Couldn’t load this list."}</div>
              <button onClick={() => setReloadKey((k) => k + 1)} style={{ marginTop: 12, appearance: "none", cursor: "pointer", border: "1px solid var(--line)", background: "var(--surface2)", borderRadius: 999, padding: "8px 18px", fontFamily: "var(--fontBody)", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{jp ? "再試行" : "Try again"}</button>
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", fontFamily: "var(--fontDisplay)", fontStyle: "italic", fontSize: 18, color: "var(--inkSoft)" }}>
              {q ? (jp ? "見つかりませんでした。" : "No matches.")
                 : tab === "readers" ? (jp ? "まだ読者がいません。" : "No readers yet.") : (jp ? "まだ誰もフォローしていません。" : "Not following anyone yet.")}
            </div>
          ) : rows.map((u) => <Row key={u.id} u={u} loc={loc} viewerId={viewerId} jp={jp} />)}
        </div>
      </div>
    </div>
  ), document.body);
}

// The two clickable stat chips ("N Readers" / "N Writers") that open the modal.
// Fetches its own counts from the profile endpoint when not provided.
function FollowStats({ handle, locale = "ja", followers = null, following = null, tone = "soft" }) {
  const loc = locale === "ja" ? "ja" : "en";
  const jp = loc === "ja";
  const [counts, setCounts] = React.useState({ followers, following });
  const [open, setOpen] = React.useState(null); // null | 'readers' | 'writers'

  React.useEffect(() => {
    if (counts.followers != null && counts.following != null) return;
    fetch(`${window.N101_API.API_BASE}/users/${handle}`).then((r) => r.json())
      .then((d) => { if (d.stats) setCounts({ followers: d.stats.followers ?? 0, following: d.stats.following ?? 0 }); })
      .catch(() => {});
  }, [handle]);

  const chip = (key, label, n) => (
    <button onClick={() => setOpen(key)} style={{
      appearance: "none", border: "none", background: "transparent", cursor: "pointer", padding: 0,
      fontFamily: "var(--fontMono)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
      color: tone === "light" ? "var(--inkSoft)" : "var(--inkSoft)",
    }}>
      <strong style={{ color: "var(--ink)", fontWeight: 700 }}>{(n ?? 0).toLocaleString()}</strong> {label}
    </button>
  );

  return (
    <span style={{ display: "inline-flex", gap: 18, alignItems: "center" }}>
      {chip("readers", jp ? "読者" : "Readers", counts.followers)}
      {open && <FollowListModal handle={handle} locale={locale} tab="readers" tabs={["readers"]} onClose={() => setOpen(null)} />}
    </span>
  );
}

export default withBoundary(FollowStats, "follow-stats");
