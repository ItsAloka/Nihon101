// ui.js — shared wireframe runtime for enui. Renders the header/footer/search,
// builds cards from window.NIHON_DATA, and drives dark mode + saved/follow state
// (localStorage). All client-side; no backend. English only.
(function () {
  const D = window.NIHON_DATA;
  const CATS = D.CATEGORIES, AUTHORS = D.AUTHORS, POSTS = D.POSTS;
  const catById = Object.fromEntries(CATS.map((c) => [c.id, c]));
  const authorByHandle = Object.fromEntries(AUTHORS.map((a) => [a.handle, a]));

  // ---- palette maps (same values as the real app) ----
  const TINT_GRAD = {
    rose: ['#FCCFD6', '#F58FA3'], amber: ['#FFE3A2', '#FFAA4F'], blue: ['#C4DCF6', '#7FA9DE'],
    lilac: ['#E2CCF2', '#B89BD9'], peach: ['#FFCFB0', '#F08D5C'], sage: ['#D4E4B0', '#9CB66D'],
    clay: ['#F2B59C', '#D17A5A'], mauve: ['#E5BBD2', '#BC7FA0'], sky: ['#C0DAF0', '#7FAFDC'],
    cream: ['#FFEFC8', '#FFCB7A'],
  };
  const GLYPH = { cream: '茶', amber: '麺', peach: '弁', blue: '雪', sky: '駅', lilac: '燈', rose: '桜', mauve: '香', sage: '葉', clay: '器' };
  const TINT_HEX = ['#FBC5CC', '#FFD27A', '#A6C7F0', '#D6B8F0', '#FBB58B', '#B6D58E', '#E89A7E', '#D89DBE', '#9BC2EE'];

  // ---- helpers ----
  function tint(id) { return (catById[id] || {}).tint || 'rose'; }
  function grad(id) { return TINT_GRAD[tint(id)] || TINT_GRAD.rose; }
  function glyphFor(id) { return GLYPH[tint(id)] || '日'; }
  function catKanji(id) { return (catById[id] || {}).kanji || ''; }
  function catLabel(id) { return (catById[id] || {}).label || id; }
  function avaTint(s) { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TINT_HEX[h % TINT_HEX.length]; }
  function initials(n) { return (String(n || '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3) || '?').toUpperCase(); }
  function authorName(p) { const a = authorByHandle[p.authorHandle]; return a ? a.displayName : '—'; }
  function dateFmt(ms) { return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  function tagSlug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function num(n) { return (n || 0).toLocaleString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function postCountFor(h) { return POSTS.filter((p) => p.authorHandle === h).length; }
  function likesFor(h) { return POSTS.filter((p) => p.authorHandle === h).reduce((s, p) => s + p.likes, 0); }
  function qs(name) { return new URLSearchParams(location.search).get(name) || ''; }

  // ---- saved + follow state (localStorage) ----
  const LS = { saved: 'enui.saved', follows: 'enui.follows', mode: 'enui.mode' };
  function getSet(k) { try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')); } catch (e) { return new Set(); } }
  function setSet(k, s) { localStorage.setItem(k, JSON.stringify([...s])); }
  function isSaved(slug) { return getSet(LS.saved).has(slug); }
  function toggleSaved(slug) { const s = getSet(LS.saved); s.has(slug) ? s.delete(slug) : s.add(slug); setSet(LS.saved, s); window.dispatchEvent(new Event('enui:saved')); return s.has(slug); }
  function isFollowing(h) { return getSet(LS.follows).has(h); }
  function toggleFollow(h) { const s = getSet(LS.follows); s.has(h) ? s.delete(h) : s.add(h); setSet(LS.follows, s); return s.has(h); }

  // ---- icon paths ----
  const HEART = 'M12 21l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.18L12 21z';
  const CHAT = 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z';
  const BOOKMARK = 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z';

  // ---- avatar markup ----
  function avatar(handle, name, size, fs) {
    return `<span class="ava" style="width:${size}px;height:${size}px;font-size:${fs}px;background:linear-gradient(135deg, ${avaTint(handle)}, #f2f0eb);">${esc(initials(name))}</span>`;
  }

  // ---- photo (cover placeholder) ----
  function photo(p, h, href, opts) {
    opts = opts || {};
    const g = grad(p.categoryId);
    const style = `height:${h}px;${p.cover ? '' : `background:linear-gradient(135deg, ${g[0]}, ${g[1]});`}`;
    const inner = (p.cover ? `<img src="${esc(p.cover)}" alt="${esc(p.titleEn)}">` : `<span class="glyph"${opts.glyphSize ? ` style="font-size:${opts.glyphSize}px"` : ''}>${glyphFor(p.categoryId)}</span>`)
      + (p.cover ? '' : '<span class="blob"></span>')
      + '<span class="vignette"></span>'
      + (opts.hanko ? `<span class="cover-hanko">${catKanji(p.categoryId)}</span>` : '')
      + (p.coverLabel ? `<span class="photo-tag"><span class="dot"></span> photo: ${esc(p.coverLabel)}</span>` : '');
    return `<a class="photo" style="${style}" href="${href}">${inner}</a>`;
  }

  // ---- post card (matches Grid.astro) ----
  function card(p, opts) {
    opts = opts || {};
    const read = `article.html?slug=${p.slug}`;
    const tags = (p.tags || []).slice(0, 3).map((t) => `<a class="tag" href="explore.html?q=${encodeURIComponent(t)}"><span class="h">#</span>${esc(t)}</a>`).join('');
    const foot = opts.hideAuthor
      ? `<span class="dt">${dateFmt(p.publishedAt)}</span>`
      : `<a class="achip" href="profile.html?handle=${p.authorHandle}">${avatar(p.authorHandle, authorName(p), 26, 11)}<span><span class="nm" style="font-size:12.5px;">${esc(authorName(p))}</span><br><span class="dt">${dateFmt(p.publishedAt)}</span></span></a>`;
    return `<article class="post-card">
      ${photo(p, 240, read, { glyphSize: 84 })}
      <div class="cmeta"><a class="chip" href="category.html?cat=${p.categoryId}"><span class="kanji">${catKanji(p.categoryId)}</span>${catLabel(p.categoryId)}</a><span class="mins">${p.readMins} min</span></div>
      <a href="${read}"><h3>${esc(p.titleEn)}</h3></a>
      <p class="ex">${esc(p.excerptEn)}</p>
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
      <div class="foot">${foot}
        <div class="stats">
          <span class="stat heart"><svg viewBox="0 0 24 24"><path d="${HEART}"/></svg>${num(p.likes)}</span>
          <span class="stat chat"><svg viewBox="0 0 24 24"><path d="${CHAT}"/></svg>${num(p.comments)}</span>
        </div>
      </div>
    </article>`;
  }
  function grid(posts, opts) { return `<div class="recent-grid">${posts.map((p) => card(p, opts)).join('')}</div>`; }

  // ---- search filtering (powers explore + autocomplete) ----
  function searchPosts(q, cat) {
    let list = POSTS.slice();
    if (cat) list = list.filter((p) => p.categoryId === cat);
    q = (q || '').trim().toLowerCase();
    if (q) list = list.filter((p) =>
      p.titleEn.toLowerCase().includes(q) ||
      p.excerptEn.toLowerCase().includes(q) ||
      (p.tags || []).some((t) => t.toLowerCase().includes(q)) ||
      authorName(p).toLowerCase().includes(q) ||
      catLabel(p.categoryId).toLowerCase().includes(q));
    return list;
  }
  function sortPosts(list, sort) {
    const a = list.slice();
    if (sort === 'top') a.sort((x, y) => y.likes - x.likes);
    else if (sort === 'new') a.sort((x, y) => y.publishedAt - x.publishedAt);
    else if (sort === 'trend') a.sort((x, y) => y.trendScore - x.trendScore);
    return a;
  }

  // ============ HEADER ============
  function renderHeader(active) {
    const items = [
      ['Today', 'index.html', 'home'], ['For You', 'for-you.html', 'feed'],
      ['Explore', 'explore.html', 'search'], ['Trending', 'trending.html', 'trending'],
      ['Writers', 'writers.html', 'authors'], ['About', '#', 'about'],
    ];
    const mode = localStorage.getItem(LS.mode) || 'light';
    const savedN = getSet(LS.saved).size;
    const ME = authorByHandle['kage-loom'] || AUTHORS[0]; // the signed-in viewer (wireframe)
    const nav = items.map(([l, href, key]) => `<a class="${key === active ? 'on' : ''}" href="${href}">${l}</a>`).join('');
    return `<header class="nav"><div class="nav-inner">
      <a class="logo" href="index.html">nihon<span class="stamp">1<span class="disc"></span>1</span></a>
      <nav class="mainnav">${nav}</nav>
      <div class="searchbar" id="searchbar">
        <form id="navsearch" action="explore.html" method="get">
          <svg width="14" height="14" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input name="q" autocomplete="off" placeholder="Search nihon101…" aria-label="Search">
          <span class="kbd">⌘ K</span>
        </form>
      </div>
      <button class="icon-btn" id="modeToggle" title="Toggle theme">${mode === 'dark' ? sun() : moon()}</button>
      <a class="icon-btn" href="saved.html" title="Saved"><svg viewBox="0 0 24 24"><path d="${BOOKMARK}"/></svg>${savedN ? `<span class="badge">${savedN}</span>` : ''}</a>
      <a class="btn-grad" href="#"><svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> Write</a>
      <a class="nav-ava" href="profile.html?handle=${ME.handle}" title="${esc(ME.displayName)} — profile" style="background:linear-gradient(135deg, ${avaTint(ME.handle)}, #f2f0eb)">${esc(initials(ME.displayName))}</a>
    </div></header>`;
  }
  function sun() { return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>'; }
  function moon() { return '<svg viewBox="0 0 24 24" style="fill:var(--ink);stroke:none"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z"/></svg>'; }

  // ============ FOOTER ============
  function renderFooter() {
    const col = (ttl, items) => `<div class="foot-col"><div class="ttl">${ttl}</div><ul>${items.map(([l, h]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul></div>`;
    return `<footer class="foot"><div class="foot-grid">
      <div><a class="logo" href="index.html">nihon<span class="stamp">1<span class="disc"></span>1</span></a>
        <p class="tag">A bilingual blog about Japan — every story, slow-read and ad-supported. (Wireframe, English only.)</p></div>
      ${col('Read', [['Today', 'index.html'], ['Explore', 'explore.html'], ['Writers', 'writers.html'], ['Saved', 'saved.html']])}
      ${col('Magazine', [['About', '#'], ['Contact', '#'], ['Privacy', '#'], ['Submit', '#']])}
      <div class="foot-col"><div class="ttl">Newsletter</div>
        <form class="foot-mini" onsubmit="return false"><input placeholder="you@example.com"><button>Send</button></form></div>
    </div><div class="foot-bar">© 2026 nihon101 — wireframe</div></footer>`;
  }

  // ============ AUTOCOMPLETE ============
  function wireSearch() {
    const bar = document.getElementById('searchbar');
    if (!bar) return;
    const input = bar.querySelector('input');
    let panel = null;
    function close() { if (panel) { panel.remove(); panel = null; } }
    function open(q) {
      close();
      q = q.trim();
      if (!q) return;
      const ql = q.toLowerCase();
      const posts = POSTS.filter((p) => p.titleEn.toLowerCase().includes(ql)).slice(0, 4);
      const cats = CATS.filter((c) => c.label.toLowerCase().includes(ql)).slice(0, 3);
      const tagSet = [...new Set(POSTS.flatMap((p) => p.tags))].filter((t) => t.toLowerCase().includes(ql)).slice(0, 4);
      const auth = AUTHORS.filter((a) => a.displayName.toLowerCase().includes(ql)).slice(0, 4);
      let html = '<div class="ac-scroll">';
      if (posts.length) html += '<div class="ac-group"><div class="ac-head">Posts</div>' + posts.map((p) => `<button class="ac-row" data-go="article.html?slug=${p.slug}"><span style="color:var(--inkFaint)">✎</span><span class="lbl">${esc(p.titleEn)}</span></button>`).join('') + '</div>';
      if (cats.length) html += '<div class="ac-group"><div class="ac-head">Categories</div>' + cats.map((c) => `<button class="ac-row" data-go="category.html?cat=${c.id}"><span class="kj">${c.kanji}</span><span class="lbl">${c.label}</span></button>`).join('') + '</div>';
      if (tagSet.length) html += '<div class="ac-group"><div class="ac-head">Tags</div>' + tagSet.map((t) => `<button class="ac-row" data-go="explore.html?q=${encodeURIComponent(t)}"><span class="hash">#</span><span class="lbl">${esc(t)}</span></button>`).join('') + '</div>';
      if (auth.length) html += '<div class="ac-group"><div class="ac-head">Authors</div>' + auth.map((a) => `<button class="ac-row" data-go="profile.html?handle=${a.handle}"><span class="mini-ava" style="background:linear-gradient(135deg, ${avaTint(a.handle)}, #f2f0eb)">${initials(a.displayName)}</span><span class="lbl"><b>${esc(a.displayName)}</b> <span style="color:var(--inkFaint)">@${a.handle}</span></span></button>`).join('') + '</div>';
      html += '</div>';
      if (!posts.length && !cats.length && !tagSet.length && !auth.length) html = `<div class="ac-empty">No matches for “${esc(q)}”</div>`;
      html += `<div class="ac-foot"><button class="btn-grad" data-go="explore.html?q=${encodeURIComponent(q)}">Search all →</button></div>`;
      panel = document.createElement('div');
      panel.className = 'ac-panel';
      panel.innerHTML = html;
      bar.appendChild(panel);
      panel.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); location.href = b.getAttribute('data-go'); }));
    }
    input.addEventListener('input', () => open(input.value));
    input.addEventListener('focus', () => open(input.value));
    document.addEventListener('mousedown', (e) => { if (!bar.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); } });
  }

  // ============ MODE TOGGLE ============
  function applyMode(m) { document.documentElement.dataset.mode = m; }
  function wireMode() {
    const btn = document.getElementById('modeToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = (localStorage.getItem(LS.mode) || 'light') === 'dark' ? 'light' : 'dark';
      localStorage.setItem(LS.mode, next);
      applyMode(next);
      btn.innerHTML = next === 'dark' ? sun() : moon();
    });
  }

  // ============ MOUNT ============
  function mount(active) {
    applyMode(localStorage.getItem(LS.mode) || 'light');
    const h = document.getElementById('site-header');
    if (h) h.innerHTML = renderHeader(active);
    const f = document.getElementById('site-footer');
    if (f) f.innerHTML = renderFooter();
    wireSearch();
    wireMode();
  }

  // expose
  window.ENUI = {
    CATS, AUTHORS, POSTS, catById, authorByHandle,
    grad, glyphFor, catKanji, catLabel, avaTint, initials, authorName, dateFmt, tagSlug, num, esc,
    postCountFor, likesFor, qs, photo, card, grid, avatar,
    searchPosts, sortPosts, isSaved, toggleSaved, isFollowing, toggleFollow, getSet, LS,
    HEART, CHAT, BOOKMARK, mount,
  };
})();
