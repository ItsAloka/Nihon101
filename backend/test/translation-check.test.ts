/* Untranslated-output detection (lib/openai.ts) — the script-level check that
 * stops a "translated" post from shipping with blocks still in the source
 * language (the bug that left English sections mid-page on the Japanese reader).
 * Pure logic: no DB, no OpenAI. */
import { describe, it, expect } from 'bun:test';
import { textLooksUntranslated, htmlHasUntranslatedBlock, splitHtmlBlocks } from '../src/lib/openai';

const JA_P = '<p>神道は日本固有の宗教で、自然や祖先への敬意から生まれました。</p>';
const EN_P = '<p>Shinto is Japan’s native spiritual tradition, built on respect for nature and ancestors.</p>';

describe('textLooksUntranslated — into Japanese', () => {
  it('flags a full English sentence', () => {
    expect(textLooksUntranslated('Shinto is Japan’s native spiritual tradition, developed over centuries.', 'ja')).toBe(true);
  });
  it('passes real Japanese prose', () => {
    expect(textLooksUntranslated('神道は日本固有の宗教です。自然への敬意が中心にあります。', 'ja')).toBe(false);
  });
  it('tolerates Japanese that keeps Latin terms (names, loanwords)', () => {
    expect(textLooksUntranslated('J-POPの歴史はThe Beatlesの影響から語られることが多い。', 'ja')).toBe(false);
  });
  it('tolerates short Latin-only strings (photo credits, brand names)', () => {
    expect(textLooksUntranslated('photo: Unsplash', 'ja')).toBe(false);
  });
  it('short mode flags an untranslated title but passes a Latin-styled one', () => {
    expect(textLooksUntranslated('Religion in Japan', 'ja', true)).toBe(true);
    expect(textLooksUntranslated('J-POP', 'ja', true)).toBe(false);
  });
});

describe('textLooksUntranslated — into English', () => {
  it('flags an untranslated Japanese paragraph', () => {
    expect(textLooksUntranslated('神道は日本固有の宗教で、自然や祖先への敬意から生まれました。', 'en')).toBe(true);
  });
  it('passes English that keeps a couple of Japanese terms', () => {
    expect(textLooksUntranslated('Kamon (家紋) are family crests you still see on kimono today.', 'en')).toBe(false);
  });
  it('passes English quoting a short Japanese phrase inside a longer sentence', () => {
    expect(textLooksUntranslated('People visit shrines for hatsumode (初詣) in the first days of January.', 'en')).toBe(false);
  });
  it('short mode flags an untranslated Japanese title', () => {
    expect(textLooksUntranslated('日本の宗教について', 'en', true)).toBe(true);
  });
});

describe('htmlHasUntranslatedBlock', () => {
  it('flags a Japanese body with one English section left in the middle', () => {
    const body = JA_P + '<h2>Shinto Shrines: Places Where People Connect With Kami</h2>' + EN_P + JA_P;
    expect(htmlHasUntranslatedBlock(body, 'ja')).toBe(true);
  });
  it('passes a fully Japanese body', () => {
    expect(htmlHasUntranslatedBlock(JA_P + '<h2>日本文化における「神」の役割</h2>' + JA_P, 'ja')).toBe(false);
  });
  it('ignores code blocks, URLs, and tag attributes', () => {
    const body = JA_P
      + '<pre><code>const shrine = fetchShrineData("https://example.com/api/shrines");</code></pre>'
      + '<p>詳しくは <a href="https://example.com/very/long/english/path">こちら</a> を見てください。</p>';
    expect(htmlHasUntranslatedBlock(body, 'ja')).toBe(false);
  });
  it('flags an untranslated block inside a translated-to-English body', () => {
    const body = EN_P + JA_P + EN_P;
    expect(htmlHasUntranslatedBlock(body, 'en')).toBe(true);
  });
  it('checks per top-level block, so surrounding Japanese cannot mask an English section', () => {
    // One flat string would drown the English in kana counts; per-block it is caught.
    const body = JA_P.repeat(6) + EN_P + JA_P.repeat(6);
    expect(htmlHasUntranslatedBlock(body, 'ja')).toBe(true);
  });
});

describe('splitHtmlBlocks with maxLen=1 (the checker granularity)', () => {
  it('yields one top-level block per chunk, never splitting inside a list', () => {
    const html = '<p>a</p><ul><li><p>one</p></li><li><p>two</p></li></ul><h2>t</h2>';
    expect(splitHtmlBlocks(html, 1)).toEqual(['<p>a</p>', '<ul><li><p>one</p></li><li><p>two</p></li></ul>', '<h2>t</h2>']);
  });
});
