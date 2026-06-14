// For You feed island for the SSR page /[locale]/for-you. Wraps the existing
// SPA FeedPage with just enough app context (palette, session, follows, saved)
// so the personalized feed lives at a clean URL instead of /app#/following.
import React from "react";
import "./api.jsx";
import "./content.jsx";
import "./social.jsx"; // sets window.FeedPage (+ PALETTES, deriveDark, gradStyle…)

const readMode = () => { try { return localStorage.getItem("nihon.mode") || "light"; } catch (e) { return "light"; } };
const readSaved = () => { try { return new Set(JSON.parse(localStorage.getItem("nihon.saved") || "[]")); } catch (e) { return new Set(); } };
const readClaps = () => { try { return JSON.parse(localStorage.getItem("nihon.claps") || "{}"); } catch (e) { return {}; } };
const TWEAKS = { palette: "hakuji", font: "shippori", cardStyle: "clean", density: "regular" };

export default function ForYouFeed({ locale }) {
  const loc = locale === "ja" ? "ja" : "en";
  const lang = loc === "ja" ? "jp" : "en";
  const [mode, setMode] = React.useState(readMode);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [follows, setFollows] = React.useState(new Set());
  const [savedSet, setSavedSet] = React.useState(readSaved);
  const p = mode === "dark" ? window.deriveDark(window.PALETTES.hakuji) : window.PALETTES.hakuji;

  // Keep the palette in sync with the header's dark-mode toggle.
  React.useEffect(() => {
    const h = (e) => setMode(e.detail || readMode());
    window.addEventListener("nihon:mode", h);
    return () => window.removeEventListener("nihon:mode", h);
  }, []);

  // Restore session + load the real follow set (drives the feed split).
  React.useEffect(() => {
    let live = true;
    window.N101_API.refresh()
      .then((u) => {
        if (!live) return;
        setCurrentUser(window.N101_API.toAppUser(u, null));
        window.N101_CONTENT.followApi.following().then((list) => { if (live) setFollows(new Set(list.map((f) => f.handle))); }).catch(() => {});
      })
      .catch(() => { if (live) setCurrentUser(null); });
    return () => { live = false; };
  }, []);

  const onToggleFollow = React.useCallback((handle) => {
    if (!currentUser) { window.location.href = `/${loc}/app`; return; }
    let nowFollowing = false;
    setFollows((s) => { const ns = new Set(s); if (ns.has(handle)) ns.delete(handle); else { ns.add(handle); nowFollowing = true; } return ns; });
    const { followApi } = window.N101_CONTENT;
    (nowFollowing ? followApi.follow(handle) : followApi.unfollow(handle)).catch(() => {
      setFollows((s) => { const ns = new Set(s); nowFollowing ? ns.delete(handle) : ns.add(handle); return ns; });
    });
  }, [currentUser, loc]);

  const onSave = React.useCallback((slug) => {
    setSavedSet((s) => { const ns = new Set(s); ns.has(slug) ? ns.delete(slug) : ns.add(slug); try { localStorage.setItem("nihon.saved", JSON.stringify([...ns])); } catch (e) {} window.dispatchEvent(new CustomEvent("nihon:saved")); return ns; });
  }, []);

  const FeedPage = window.FeedPage;
  if (!FeedPage) return null;
  return (
    <FeedPage
      p={p} lang={lang} t={TWEAKS} savedSet={savedSet} onSave={onSave} claps={readClaps()}
      follows={follows} onToggleFollow={onToggleFollow} currentUser={currentUser}
      onRequireLogin={() => { window.location.href = `/${loc}/app`; }}
    />
  );
}
