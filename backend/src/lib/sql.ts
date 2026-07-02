/* Tiny SQL string helpers shared by the query layer. */

/** Escape LIKE/ILIKE metacharacters (% _ \) so user input matches literally.
 *  Postgres' default LIKE escape character is backslash. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

/** `%needle%` contains-pattern for ILIKE, with the needle's wildcards escaped —
 *  a user-typed "%" must not become match-everything, and "_" must not become
 *  match-any-char. Pass the RAW needle to similarity()/trigram terms; only the
 *  LIKE pattern needs escaping. */
export function likeContains(needle: string): string {
  return '%' + likeEscape(needle) + '%';
}
