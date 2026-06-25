// home-chrome.jsx — the prototype header + footer, reused on the SSR home page.
// The real chrome (Nav/Footer/LoginModal, palettes, auth client) is the SAME proto
// code the SPA uses; we just lift app.jsx's chrome-level state here WITHOUT the SPA
// screen router. Mounted as two `client:only="react"` islands around the SSR body
// (see pages/[locale]/index.astro). The body stays server-rendered for SEO.
import React from "react";
import "./api.jsx";     // window.N101_API
import "./content.jsx"; // window.N101_CONTENT (notifApi, …)
import { Nav, Footer, PALETTES, deriveDark } from "./ui.jsx";
import { LoginModal } from "./social.jsx"; // also chains ui/home/screens globals

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
    case "article": return `/${loc}/p/${r.slug}${r.commentId ? `#comment-${r.commentId}` : ""}`;
    case "saved": return `/${loc}/saved`;
    case "compose": case "write": return r.editId ? `/${loc}/write?id=${r.editId}` : `/${loc}/write`;
    case "profile": return `/${loc}/me`;
    case "settings": return `/${loc}/settings`;
    case "search": return `/${loc}/search${r.q ? `?q=${encodeURIComponent(r.q)}` : ""}`;
    case "category": return `/${loc}/c/${r.slug}`;
    case "tag": return `/${loc}/t/${r.slug}`;
    case "author": return `/${loc}/u/${r.slug}`;
    case "trending": return `/${loc}/trending`;
    case "feed": return `/${loc}/for-you`;
    case "about": return `/${loc}/about`;
    case "contact": return `/${loc}/contact`;
    case "privacy": return `/${loc}/privacy`;
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
  // Start 'light' to match the server render (avoids a React hydration mismatch),
  // then apply the viewer's saved mode on mount. The header/footer backgrounds use
  // CSS vars so they already paint in the right theme before this runs.
  const [mode, setMode] = React.useState('light');
  React.useEffect(() => { setMode(readMode()); }, []);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [savedCount, setSavedCount] = React.useState(0);
  const [loginOpen, setLoginOpen] = React.useState(false);
  const [notifs, setNotifs] = React.useState([]);
  const p = paletteFor(mode);

  // Load the viewer's notifications once signed in, then poll the list every 60s
  // so the bell badge stays current. Mark-all-read / clear-all hit the backend and
  // update locally so the panel reacts immediately.
  React.useEffect(() => {
    if (!currentUser) { setNotifs([]); return; }
    let live = true;
    const load = () => window.N101_CONTENT.notifApi.list()
      .then((r) => { if (live) setNotifs(r.notifications); })
      .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [currentUser]);

  const onReadNotifs = React.useCallback(() => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    window.N101_CONTENT.notifApi.markRead();
  }, []);
  const onClearNotifs = React.useCallback(() => {
    setNotifs([]);
    window.N101_CONTENT.notifApi.clearAll();
  }, []);

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

  // Hydrate SSR card hearts: every .post-card heart renders OUTLINE by default
  // (logged-out truth); once the session resolves, ask the server which of the
  // visible posts this viewer actually liked and fill only those. Re-runs on
  // login/logout. No viewer → leave them all outline.
  React.useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('.post-card .stat.heart[data-like]'));
    if (!nodes.length) return;
    if (!currentUser) { nodes.forEach((n) => n.classList.remove('liked')); return; }
    const ids = [...new Set(nodes.map((n) => n.getAttribute('data-like')).filter(Boolean))];
    let live = true;
    window.N101_API.likedState(ids).then((liked) => {
      if (!live) return;
      const set = new Set(liked);
      nodes.forEach((n) => n.classList.toggle('liked', set.has(n.getAttribute('data-like'))));
    });
    return () => { live = false; };
  }, [currentUser]);

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

  // Wire the SSR home hero bookmark buttons (plain HTML rendered by index.astro)
  // to the REAL backend (post_saves), so a save from the home page persists and
  // shows up on the Saved page — not just in localStorage. Logged in → toggle +
  // reflect the real saved set; logged out → prompt sign-in. Re-runs when the
  // session resolves so the initial "on" state matches the backend.
  React.useEffect(() => {
    const btns = Array.from(document.querySelectorAll(".hero-save"));
    if (!btns.length) return;
    let saved = new Set();
    const paint = () => btns.forEach((b) => b.classList.toggle("on", saved.has(b.getAttribute("data-slug"))));
    if (currentUser) {
      window.N101_CONTENT.postApi.listSaved()
        .then((rows) => { saved = new Set(rows.map((r) => r.slug)); setSavedCount(saved.size); paint(); })
        .catch(() => {});
    }
    const onClick = (e) => {
      e.preventDefault();
      const slug = e.currentTarget.getAttribute("data-slug");
      if (!currentUser) { setLoginOpen(true); return; }
      const was = saved.has(slug);
      was ? saved.delete(slug) : saved.add(slug);
      setSavedCount(saved.size); paint();
      window.N101_CONTENT.postApi.toggleSave(slug).catch(() => { // rollback
        was ? saved.add(slug) : saved.delete(slug);
        setSavedCount(saved.size); paint();
      });
    };
    btns.forEach((b) => b.addEventListener("click", onClick));
    return () => btns.forEach((b) => b.removeEventListener("click", onClick));
  }, [currentUser]);

  // Wire the SSR newsletter form (plain HTML from index.astro) to the real capture
  // endpoint. On success, swap the form for the "you're on the list" note.
  React.useEffect(() => {
    const form = document.getElementById("nl-form");
    if (!form) return;
    const onSubmit = (e) => {
      e.preventDefault();
      const input = form.querySelector('input[name="email"]');
      const btn = form.querySelector("button");
      const email = (input?.value || "").trim();
      if (!email.includes("@")) return;
      if (btn) { btn.disabled = true; btn.textContent = "…"; }
      const finish = () => {
        form.hidden = true;
        const done = form.parentElement?.querySelector(".nl-done");
        if (done) done.hidden = false;
      };
      window.N101_CONTENT.newsletterApi
        .subscribe(email, form.getAttribute("data-locale") === "ja" ? "ja" : "en")
        .then(finish).catch(finish); // dedupe still reads as success
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
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
        notifs={notifs} onReadNotifs={onReadNotifs} onClearNotifs={onClearNotifs}
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
  // Start 'light' to match SSR (no hydration mismatch); apply real mode on mount.
  const [mode, setMode] = React.useState("light");
  React.useEffect(() => {
    try { setMode(document.documentElement.dataset.mode || readMode()); } catch (e) {}
    const h = (e) => setMode((e && e.detail) || readMode());
    window.addEventListener("nihon:mode", h);
    return () => window.removeEventListener("nihon:mode", h);
  }, []);
  return <Footer p={paletteFor(mode)} lang={lang} />;
}
