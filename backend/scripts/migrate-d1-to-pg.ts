/**
 * One-off data migration: copy every row from the local D1 (SQLite) database
 * into Postgres. Run once after the Postgres schema is in place.
 *
 *   docker compose up -d
 *   cd backend
 *   DATABASE_URL='postgres://nihon101:nihon101@localhost:5432/nihon101' \
 *     bun run scripts/migrate-d1-to-pg.ts
 *
 * Idempotent-ish: each INSERT is ON CONFLICT (id) DO NOTHING, so re-running
 * won't duplicate. It does NOT update rows that already exist.
 */
import { Database } from 'bun:sqlite';
import pg from 'pg';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const D1_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const DATABASE_URL = process.env.DATABASE_URL
  ?? 'postgres://nihon101:nihon101@localhost:5432/nihon101';

// Tables to copy, with the columns to read from SQLite (snake_case, as stored).
// `bool` columns are 0/1 in SQLite → real booleans in PG; `json` columns are
// text in SQLite → jsonb in PG.
type Spec = { table: string; cols: string[]; bool?: string[]; json?: string[] };
const SPECS: Spec[] = [
  { table: 'users', cols: ['id', 'email', 'password_hash', 'display_name', 'role', 'email_verified', 'created_at', 'updated_at'], bool: ['email_verified'] },
  { table: 'google_links', cols: ['id', 'user_id', 'google_sub', 'email', 'created_at'] },
  { table: 'refresh_tokens', cols: ['id', 'user_id', 'token_hash', 'family_id', 'user_agent', 'expires_at', 'created_at', 'revoked_at', 'replaced_by'] },
  { table: 'password_resets', cols: ['id', 'user_id', 'token_hash', 'expires_at', 'used_at', 'created_at'] },
  { table: 'categories', cols: ['id', 'label_en', 'label_ja', 'kanji', 'tint', 'post_count', 'created_by', 'created_at'] },
  { table: 'posts', cols: ['id', 'author_id', 'category_id', 'slug', 'lang', 'title_en', 'title_ja', 'excerpt_en', 'excerpt_ja', 'body_en', 'body_ja', 'cover', 'cover_label', 'cover_credit', 'status', 'density', 'score', 'tags', 'likes', 'saves', 'comments', 'published_at', 'created_at', 'updated_at'], json: ['tags'] },
  { table: 'post_likes', cols: ['id', 'post_id', 'user_id', 'created_at'] },
  { table: 'post_comments', cols: ['id', 'post_id', 'user_id', 'parent_id', 'body', 'likes', 'created_at', 'updated_at'] },
  { table: 'comment_likes', cols: ['id', 'comment_id', 'user_id', 'created_at'] },
];

function findSqlite(): string {
  if (!existsSync(D1_DIR)) throw new Error(`D1 dir not found: ${D1_DIR} (run from backend/)`);
  const f = readdirSync(D1_DIR).find((n) => n.endsWith('.sqlite') && n !== 'metadata.sqlite');
  if (!f) throw new Error('no D1 .sqlite file found');
  return join(D1_DIR, f);
}

function tableExists(sq: Database, name: string): boolean {
  return !!sq.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

async function main() {
  const sqlitePath = findSqlite();
  console.log(`Source D1: ${sqlitePath}`);
  const sq = new Database(sqlitePath, { readonly: true });
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  let grandTotal = 0;
  for (const spec of SPECS) {
    if (!tableExists(sq, spec.table)) { console.log(`- ${spec.table}: (absent in D1, skipped)`); continue; }
    const rows = sq.query(`SELECT ${spec.cols.join(', ')} FROM ${spec.table}`).all() as Record<string, unknown>[];
    if (rows.length === 0) { console.log(`- ${spec.table}: 0 rows`); continue; }

    const boolSet = new Set(spec.bool ?? []);
    const jsonSet = new Set(spec.json ?? []);
    const placeholders = spec.cols.map((_, i) => `$${i + 1}`).join(', ');
    const insert = `INSERT INTO ${spec.table} (${spec.cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;

    let n = 0;
    for (const row of rows) {
      const values = spec.cols.map((col) => {
        let v = row[col];
        if (v === undefined) v = null;
        if (boolSet.has(col)) return v == null ? null : !!Number(v);
        if (jsonSet.has(col)) {
          if (v == null) return '[]';
          // SQLite stored it as a JSON string already; validate then pass through.
          try { JSON.parse(String(v)); return String(v); } catch { return '[]'; }
        }
        return v;
      });
      const res = await client.query(insert, values);
      n += res.rowCount ?? 0;
    }
    grandTotal += n;
    console.log(`- ${spec.table}: ${n}/${rows.length} inserted`);
  }

  await client.end();
  sq.close();
  console.log(`\nDone. ${grandTotal} rows inserted into Postgres.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
