# enui — Nihon101 UI wireframe (English-only)

A standalone, backend-free wireframe of the whole Nihon101 reader UI. Same design
system (tokens, fonts, cards, chrome) as the live `frontend/`, but rendered as plain
static HTML + one shared script, with sample data instead of the API. No Japanese
locale — every surface is the English view.

## Run

Open any `.html` directly, or serve the folder:

```
python -m http.server 4555 --directory ui-mocks/enui
```

Then visit `http://localhost:4555/index.html`.

## Pages

| File | Surface |
| --- | --- |
| `index.html` | Home — issue ribbon, hero carousel, secondary feature + topics rail, recent grid, writers in residence, newsletter |
| `explore.html` | Explore — **working** search box, category filter pills, sort toggle, pagination, empty state |
| `trending.html` | Trending — ranked by `trendScore` |
| `writers.html` | Writers directory — sortable, follow buttons |
| `for-you.html` | For You feed — follow-aware ordering + "why you're seeing this" reason chips, who-to-follow |
| `saved.html` | Saved — reads bookmarks from localStorage |
| `profile.html?handle=…` | Author profile — hero, stats, follow, their stories |
| `category.html?cat=…` | Category landing — banner + filtered grid |
| `article.html?slug=…` | Article reader — byline, cover, like/save/comment, body, "more like this" |

## Shared files

- `data.js` — `CATEGORIES`, `AUTHORS`, `POSTS` (the only content source).
- `styles.css` — all design tokens + component CSS (lifted from `index.astro`,
  `Shell.astro`, `ui.jsx`).
- `ui.js` — renders the header/footer, the live header search autocomplete, card
  markup, and drives dark mode + saved/follow state (localStorage).

## Working interactions

- Header search autocomplete (posts / categories / tags / authors) + ⌘K focus.
- Explore search, category filter, sort, and pagination.
- Dark / light toggle (persisted).
- Save / unsave (hero + reader + cards) → reflected on the Saved page and the header badge.
- Follow / unfollow → reflected on Writers, For You, and profiles.
- Hero carousel (auto-advance, dots, arrows).
