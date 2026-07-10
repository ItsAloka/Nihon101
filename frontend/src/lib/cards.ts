// Shared SSR card helpers — the same tint gradients, subject glyphs, and
// per-locale field pickers the home page (index.astro) uses, extracted so the
// explore / category / tag pages render cards identically. Pure functions, no
// window globals (server-rendered).

export const TINT_GRAD: Record<string, [string, string]> = {
  rose: ['#FCCFD6', '#F58FA3'], amber: ['#FFE3A2', '#FFAA4F'], blue: ['#C4DCF6', '#7FA9DE'],
  lilac: ['#E2CCF2', '#B89BD9'], peach: ['#FFCFB0', '#F08D5C'], sage: ['#D4E4B0', '#9CB66D'],
  clay: ['#F2B59C', '#D17A5A'], mauve: ['#E5BBD2', '#BC7FA0'], sky: ['#C0DAF0', '#7FAFDC'],
  cream: ['#FFEFC8', '#FFCB7A'],
};
export const GLYPH: Record<string, string> = {
  cream: '茶', amber: '麺', peach: '弁', blue: '雪', sky: '駅',
  lilac: '燈', rose: '桜', mauve: '香', sage: '葉', clay: '器',
};
export const TINT_HEX: Record<string, string> = {
  rose: '#FBC5CC', amber: '#FFD27A', blue: '#A6C7F0', lilac: '#D6B8F0', peach: '#FBB58B',
  sage: '#B6D58E', clay: '#E89A7E', mauve: '#D89DBE', sky: '#9BC2EE', cream: '#FFE6B5',
};

export interface CatLike { id: string; labelEn: string; labelJa: string; kanji: string; tint: string; postCount?: number; }

/** Tag slug — mirrors backend slugify() so tag links resolve to /t/<slug>. */
export function tagSlug(label: string): string {
  return String(label || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Build the per-page card helpers bound to a category map + the active locale. */
export function makeHelpers(categories: CatLike[], jp: boolean) {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const title = (p: any) => (jp ? (p.titleJa || p.titleEn) : (p.titleEn || p.titleJa)) || '—';
  const excerpt = (p: any) => (jp ? (p.excerptJa || p.excerptEn) : (p.excerptEn || p.excerptJa)) || '';
  const authorName = (p: any) => (jp ? (p.authorNameJa || p.authorName) : (p.authorName || p.authorNameJa)) || '—';
  const catLabel = (id: string) => { const c = catById.get(id); return c ? (jp ? c.labelJa : c.labelEn) : id; };
  const catKanji = (id: string) => { const c = catById.get(id); return (c && c.kanji) || ''; };
  const catTint = (id: string) => { const c = catById.get(id); return (c && c.tint) || 'rose'; };
  const grad = (id: string) => TINT_GRAD[catTint(id)] || TINT_GRAD.rose;
  const glyphFor = (id: string) => GLYPH[catTint(id)] || '日';
  // timeZone pinned: the Worker renders in UTC while readers sit in JST (+9) —
  // unpinned, the same post dates differently server vs client (hydration
  // mismatch on evening-published posts; Not Bagel's React #418 in production).
  const dateFmt = (msv: number) =>
    new Date(msv).toLocaleDateString(jp ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const initialsOf = (n: string) => ((n || '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3) || '?').toUpperCase();
  const tintOf = (handle: string) => {
    const tints = Object.values(TINT_HEX).slice(0, 9);
    let h = 0;
    for (const ch of handle || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return tints[h % tints.length];
  };
  return { catById, title, excerpt, authorName, catLabel, catKanji, catTint, grad, glyphFor, dateFmt, initialsOf, tintOf };
}

export type Helpers = ReturnType<typeof makeHelpers>;
