// home-chrome.jsx — the prototype header + footer, reused on the SSR home page.
// The real chrome (Nav/Footer/LoginModal, palettes, auth client) is the SAME proto
// code the SPA uses; we just lift app.jsx's chrome-level state here WITHOUT the SPA
// screen router. Mounted as two `client:only="react"` islands around the SSR body
// (see pages/[locale]/index.astro). The body stays server-rendered for SEO.
import React from "react";
import "./api.jsx";     // window.N101_API
import "./ui.jsx";      // window.Nav, Footer, PALETTES, deriveDark
import "./social.jsx";  // window.LoginModal (+ chains ui/home/screens globals)

const { Nav, Footer, LoginModal, PALETTES, deriveDark } = window;

// Home-page hash routing: there's no SPA mounted here, so every Nav/Footer/avatar
// action hard-navigates into the app shell at /<locale>/app#<hash> (home → /<locale>/).
function serializeHash(r) {
  switch (r.name) {
    case "home": return "";
    case "article": return `#/article/${r.slug}`;
    case "category": return `#/category/${r.slug}`;
    case "author": return `#/author/${r.slug}`;
    case "authors": return "#/authors";
    case "about": return "#/about";
    case "privacy": return "#/privacy";
    case "contact": return "#/contact";
    case "saved": return "#/saved";
    case "trending": return "#/trending";
    case "feed": return "#/following";
    case "compose": case "write": return r.editId ? `#/compose/${r.editId}` : "#/compose";
    case "profile": return "#/profile";
    case "search": return r.q ? `#/search?q=${encodeURIComponent(r.q)}` : "#/search";
    default: return "";
  }
}

// Reader-discovery routes that have real SSR pages (Phase 3). Returns the SSR href
// or '' to fall through to the SPA shell. Shared with the SPA navigator (app.jsx).
export function ssrHref(r, loc) {
  switch (r.name) {
    case "search": return `/${loc}/search${r.q ? `?q=${encodeURIComponent(r.q)}` : ""}`;
    case "category": return `/${loc}/c/${r.slug}`;
    case "tag": return `/${loc}/t/${r.slug}`;
    case "author": return `/${loc}/u/${r.slug}`;
    case "trending": return `/${loc}/trending`;
    case "authors": return `/${loc}/writers`;
    default: return "";
  }
}

function readMode() {
  try { return localStorage.getItem("nihon.mode") || "light"; } catch (e) { return "light"; }
}
function readSavedCount() {
  try { return new Set(JSON.parse(localStorage.getItem("nihon.saved") || "[]")).size; } catch (e) { return 0; }
}
function paletteFor(mode) {
  const base = PALETTES.hakuji;
  return mode === "dark" ? deriveDark(base) : base;
}

// ------- Header island -------
// `active` is the Nav route name to highlight (home | search | trending | …).
// SSR discovery pages (explore/category/tag) pass "search" so Explore underlines.
export function HomeHeader({ locale, active = "home" }) {
  const loc = locale === "ja" ? "ja" : "en";
  const lang = loc === "ja" ? "jp" : "en";
  const [mode, setMode] = React.useState(readMode);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [savedCount, setSavedCount] = React.useState(0);
  const [loginOpen, setLoginOpen] = React.useState(false);
  const p = paletteFor(mode);

  // Install the home-scoped navigator so the reused Nav/Footer can leave this page.
  // Reader-discovery surfaces (explore/category/tag) are real SSR pages now, so
  // route there directly; everything else hard-navigates into the SPA app shell.
  React.useEffect(() => {
    window.__nihon_go = (r) => {
      if (!r || r.name === "home") { window.location.href = `/${loc}/`; return; }
      const ssr = ssrHref(r, loc);
      window.location.href = ssr || `/${loc}/app${serializeHash(r)}`;
    };
  }, [loc]);

  // Restore the session from the HttpOnly refresh cookie (same bootstrap as app.jsx).
  React.useEffect(() => {
    let live = true;
    window.N101_API.refresh()
      .then((u) => { if (live) setCurrentUser((prev) => window.N101_API.toAppUser(u, prev)); })
      .catch(() => { if (live) setCurrentUser(null); });
    return () => { live = false; };
  }, []);

  // Saved badge: read on mount, keep live with the hero bookmark + other tabs.
  React.useEffect(() => {
    setSavedCount(readSavedCount());
    const h = () => setSavedCount(readSavedCount());
    window.addEventListener("nihon:saved", h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener("nihon:saved", h); window.removeEventListener("storage", h); };
  }, []);

  // Dark mode: drive the whole page (SSR body via [data-mode], + footer island).
  React.useEffect(() => {
    try { localStorage.setItem("nihon.mode", mode); } catch (e) {}
    document.documentElement.dataset.mode = mode;
    document.documentElement.style.colorScheme = mode === "dark" ? "dark" : "light";
    window.dispatchEvent(new CustomEvent("nihon:mode", { detail: mode }));
  }, [mode]);

  const onLang = (next) => { window.location.href = `/${next === "jp" ? "ja" : "en"}/`; };
  const onSearch = (q) => { window.__nihon_go({ name: "search", q }); };

  return (
    <>
      <Nav
        p={p} route={{ name: active }} lang={lang}
        onLang={onLang} onSearch={onSearch} savedCount={savedCount}
        mode={mode} onToggleMode={() => setMode((m) => (m === "dark" ? "light" : "dark"))}
        currentUser={currentUser}
        onLogin={() => setLoginOpen(true)}
        onLogout={() => { window.N101_API.logout(); setCurrentUser(null); }}
        notifs={[]} onReadNotifs={() => {}}
      />
      {loginOpen && (
        <LoginModal
          p={p} lang={lang}
          onLogin={(user) => { setCurrentUser(user); setLoginOpen(false); }}
          onClose={() => setLoginOpen(false)}
        />
      )}
    </>
  );
}

// ------- Footer island -------
export function HomeFooter({ locale }) {
  const lang = locale === "ja" ? "jp" : "en";
  const [mode, setMode] = React.useState(() => {
    try { return document.documentElement.dataset.mode || readMode(); } catch (e) { return "light"; }
  });
  React.useEffect(() => {
    const h = (e) => setMode((e && e.detail) || readMode());
    window.addEventListener("nihon:mode", h);
    return () => window.removeEventListener("nihon:mode", h);
  }, []);
  return <Footer p={paletteFor(mode)} lang={lang} />;
}
