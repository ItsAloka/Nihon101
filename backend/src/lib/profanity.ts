/* Profanity masking for user text (comments). Detected words are replaced with a
 * run of '●' (U+25CF) the length of the match; the frontend colors any ● run red.
 * Masking happens at READ time, inside publicComment — the original is kept in the
 * DB (so a future edit feature can show/revert it), but the API never emits raw
 * profanity, so the frontend stays dumb (no word list shipped to the client).
 *
 * Two engines, because the languages differ:
 *   EN  — word-boundary regex with stretched letters (fuuuck, slutttt) + common
 *         suffixes; \b at the start avoids the Scunthorpe problem.
 *   JA  — plain substring match (Japanese has no spaces/word boundaries).
 * Lists are intentionally conservative (strong slurs/obscenities only), not a
 * tone police — mild words are left alone. */

const DOT = '●'; // ● — the censor glyph the frontend renders red

// English bases. Each becomes \b<stretched letters>\w*  (case-insensitive), so
// "fuck", "fuuuck", "fucking", "fucker" all match from a word boundary.
const EN_BASES = [
  'fuck', 'shit', 'bitch', 'slut', 'cunt', 'asshole', 'bastard', 'whore',
  'nigger', 'nigga', 'faggot', 'retard', 'pussy', 'cock', 'dick', 'douche',
  'twat', 'wanker', 'prick', 'bollocks', 'motherfucker', 'jackass', 'dickhead',
];

const stretch = (w: string) => w.split('').map((ch) => `${ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}+`).join('');
const EN_RE = new RegExp(`\\b(?:${EN_BASES.map(stretch).join('|')})\\w*`, 'gi');

// Japanese terms — strong obscenities/slurs only. Matched as raw substrings.
const JA_TERMS = [
  '死ね', 'くたばれ', 'ぶっ殺す', 'くそったれ', 'クソったれ', 'まんこ', 'ちんこ',
  'ちんぽ', 'やりまん', 'きちがい', 'ファック', 'ビッチ', 'ちくしょう', '畜生',
];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const JA_RE = new RegExp(JA_TERMS.map(escapeRe).join('|'), 'g');

const dots = (m: string) => DOT.repeat([...m].length);

/** Replace any profanity in `text` with red-dot placeholders. Safe on empty input. */
export function maskProfanity(text: string): string {
  if (!text) return text;
  return text.replace(EN_RE, dots).replace(JA_RE, dots);
}
