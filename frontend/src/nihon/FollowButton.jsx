// Follow button island for the SSR author profile (/[locale]/u/[handle]).
// The page is server-rendered without the viewer's token, so this island
// resolves the session client-side (refresh cookie → access token), figures out
// self / following state, and toggles follow against the real backend.
import React from "react";
import "./api.jsx";       // window.N101_API
import "./content.jsx";   // window.N101_CONTENT (followApi)

export default function FollowButton({ userId, handle, locale = "ja", followers = 0, showCount = true, variant = "pink", size = "md" }) {
  const loc = locale === "ja" ? "ja" : "en";
  const jp = loc === "ja";
  const [state, setState] = React.useState("loading"); // loading|guest|self|following|not
  const [count, setCount] = React.useState(followers);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    window.N101_API.refresh()
      .then(async (me) => {
        if (!live) return;
        if (me && (me.id === userId || me.handle === handle)) { setState("self"); return; }
        try {
          const list = await window.N101_CONTENT.followApi.following();
          if (!live) return;
          setState(list.some((f) => f.handle === handle) ? "following" : "not");
        } catch { if (live) setState("not"); }
      })
      .catch(() => { if (live) setState("guest"); });
    return () => { live = false; };
  }, [userId, handle]);

  const toggle = async () => {
    if (state === "guest") { window.location.href = `/${loc}/app`; return; } // sign in there
    if (busy || state === "self" || state === "loading") return;
    const following = state === "following";
    setBusy(true);
    setState(following ? "not" : "following");
    setCount((n) => n + (following ? -1 : 1));
    try {
      const r = following
        ? await window.N101_CONTENT.followApi.unfollow(handle)
        : await window.N101_CONTENT.followApi.follow(handle);
      if (typeof r.followers === "number") setCount(r.followers);
    } catch {
      setState(following ? "following" : "not"); // rollback
      setCount((n) => n + (following ? 1 : -1));
    } finally { setBusy(false); }
  };

  if (state === "self") return null;

  const following = state === "following";
  const label = state === "loading"
    ? "…"
    : following ? (jp ? "フォロー中" : "Following") : (jp ? "フォロー" : "Follow");

  // Self-contained styling (the island can't see the page's scoped CSS) using
  // the site's theme vars, which Shell sets on every page. Two looks: a rose
  // gradient pill for cards/lists, a solid dark pill for the profile hero.
  const pad = size === "sm" ? "7px 16px" : "10px 22px";
  const fs = size === "sm" ? 13 : 14;
  const base = {
    appearance: "none", cursor: busy || state === "loading" ? "default" : "pointer",
    display: "inline-flex", alignItems: "center", gap: 7, padding: pad,
    borderRadius: 999, fontFamily: "var(--fontBody)", fontSize: fs, fontWeight: 600,
    lineHeight: 1, transition: "transform .12s ease, opacity .12s ease",
    opacity: busy || state === "loading" ? 0.65 : 1,
  };
  const look = following
    ? { background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }
    : variant === "dark"
      ? { background: "var(--ink)", color: "var(--bg)", border: "1px solid var(--ink)" }
      : { background: "linear-gradient(135deg, color-mix(in oklab, var(--stamp) 78%, #fff), var(--stamp))",
          color: "#fff", border: "1px solid transparent",
          boxShadow: "0 10px 24px -12px var(--stamp)" };

  return (
    <button
      onClick={toggle}
      disabled={busy || state === "loading"}
      style={{ ...base, ...look }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {!following && state !== "loading" && <span style={{ fontWeight: 700 }}>+</span>}{label}
      {showCount && following === false && state !== "loading" && (
        <span style={{ fontFamily: "var(--fontMono)", fontSize: 11, opacity: 0.85, paddingLeft: 6,
          borderLeft: "1px solid color-mix(in oklab, currentColor 35%, transparent)" }}>
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}
