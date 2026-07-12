/* Home-page section assembly (routes/home.ts) — pins the young-site behavior:
 * "Recently published" must show posts even when hero/feature/picks have
 * already used every one of them (the grid was empty until the 8th post), and
 * must go back to strict no-repeat dedupe once there are enough posts. Pure
 * logic: no DB. */
import { describe, it, expect } from 'bun:test';
import { assembleHomeSections } from '../src/routes/home';

/** p1 is the newest post, pN the oldest — mirrors the newest-first API rows. */
const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe('assembleHomeSections — young site (fewer than 8 posts)', () => {
  it('a single post appears in the hero AND the recent grid', () => {
    const { hero, feature, picks, recent } = assembleHomeSections(cards(1), [], []);
    expect(ids(hero)).toEqual(['p1']);
    expect(feature).toBeNull();
    expect(picks).toEqual([]);
    expect(ids(recent)).toEqual(['p1']);
  });

  it('three posts: the grid still shows all three, newest first', () => {
    const { hero, recent } = assembleHomeSections(cards(3), [], []);
    expect(ids(hero)).toEqual(['p1', 'p2', 'p3']);
    expect(ids(recent)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('assembleHomeSections — growing site', () => {
  it('ten posts: grid fills to 8, keeping every not-yet-shown post', () => {
    const { recent } = assembleHomeSections(cards(10), [], []);
    // p1-p7 feed hero/feature/picks; p8-p10 are the true leftovers and must all
    // appear; the newest already-shown posts top the grid back up to 8.
    expect(ids(recent)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p8', 'p9', 'p10']);
  });

  it('twenty posts: strict dedupe again — 8 cards, none repeated from above', () => {
    const { hero, feature, picks, recent } = assembleHomeSections(cards(20), [], []);
    expect(recent).toHaveLength(8);
    expect(ids(recent)).toEqual(['p8', 'p9', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15']);
    const above = new Set([...ids(hero), feature!.id, ...ids(picks)]);
    expect(ids(recent).some((id) => above.has(id))).toBe(false);
  });
});

describe('assembleHomeSections — curated slots', () => {
  it('trending hero and the admin-pinned feature keep their slots', () => {
    const { hero, feature } = assembleHomeSections(cards(10), [{ id: 'p9' }], [{ id: 'p5' }]);
    expect(ids(hero)).toEqual(['p9', 'p1', 'p2']); // trending first, recency tops up
    expect(feature!.id).toBe('p5');
  });

  it('a short trending list never shrinks the hero while posts exist', () => {
    const { hero } = assembleHomeSections(cards(5), [], []);
    expect(hero).toHaveLength(3);
  });
});
