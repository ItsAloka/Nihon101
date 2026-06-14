// Follow button island for the SSR author profile (/[locale]/u/[handle]).
// The page is server-rendered without the viewer's token, so this island
// resolves the session client-side (refresh cookie → access token), figures out
// self / following state, and toggles follow against the real backend.
import React from "react";
import "./api.jsx";       // window.N101_API
import "./content.jsx";   // window.N101_CONTENT (followApi)

export default function FollowButton({ userId, handle, locale = "ja", followers = 0 }) {
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
    ? (jp ? "…" : "…")
    : following ? (jp ? "フォロー中" : "Following") : (jp ? "フォロー" : "Follow");

  return (
    <button class="pf-follow" data-following={following ? "1" : "0"} onClick={toggle} disabled={busy || state === "loading"}>
      {!following && state !== "loading" && <span class="plus">+</span>}{label}
      <span class="pf-followers">{count.toLocaleString()}</span>
    </button>
  );
}
