// data.js — category taxonomy reference for the SPA.
//
// The example seed (mock posts + mock authors) was removed 2026-06-14: every
// reader surface now runs on the real backend (home/explore/category/tag/
// trending/writers are SSR; the For You feed, profiles, saved + article reader
// fetch real data). What remains here is the core category metadata — kanji +
// palette tint + bilingual labels — used by CategoryChip to style a post's
// category. Category ids in Postgres ARE these slugs (e.g. 'food'), so chips
// resolve directly. AUTHORS/POSTS stay as empty arrays only so the legacy
// helpers (getAllPosts/getAuthor/getPost) keep a stable shape.
const CATEGORIES = [
  { slug: 'culture',     en: 'Culture',     jp: '文化',   kanji: '文', tint: 'rose' },
  { slug: 'food',        en: 'Food',        jp: '食',     kanji: '食', tint: 'amber' },
  { slug: 'travel',      en: 'Travel',      jp: '旅',     kanji: '旅', tint: 'blue' },
  { slug: 'language',    en: 'Language',    jp: '言葉',   kanji: '言', tint: 'lilac' },
  { slug: 'animation',   en: 'Animation',   jp: 'アニメ', kanji: '画', tint: 'peach' },
  { slug: 'philosophy',  en: 'Philosophy',  jp: '哲学',   kanji: '哲', tint: 'sage' },
  { slug: 'history',     en: 'History',     jp: '歴史',   kanji: '史', tint: 'clay' },
  { slug: 'fashion',     en: 'Fashion',     jp: 'ファッション', kanji: '装', tint: 'mauve' },
  { slug: 'news',        en: 'News',        jp: '今日のこと', kanji: '新', tint: 'sky' },
];

const AUTHORS = [];
const POSTS = [];

window.NIHON_DATA = { CATEGORIES, AUTHORS, POSTS };
