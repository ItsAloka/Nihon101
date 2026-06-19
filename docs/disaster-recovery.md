# Disaster Recovery — Nihon101

Scope: the Postgres database (the only stateful store besides R2 blobs). R2 objects
are covered separately (Cloudflare-durable; covers/avatars are re-uploadable content,
not transactional data).

## Targets

| Metric | Target | How it's met |
|--------|--------|--------------|
| **RPO** (max data loss) | ≈ 5 min | Neon point-in-time recovery (continuous WAL) is primary. Daily `pg_dump` to R2 caps worst-case at 24h if Neon itself is lost. |
| **RTO** (time to restore) | < 30 min | Neon PITR = restore a branch to a timestamp (minutes). Dump restore = `pg_restore`/`psql` into a fresh DB. |

## Backups in place

1. **Neon PITR (primary).** Enabled on the Neon project; retention set in the Neon
   console (use ≥ 7 days for prod). Continuous — nothing to run.
2. **Daily logical dump (secondary).** `.github/workflows/backup.yml` runs `pg_dump`
   at 03:00 UTC and uploads `nihon101-<UTC timestamp>.sql.gz` to
   `r2://$R2_BACKUP_BUCKET/daily/`. Manually triggerable (`workflow_dispatch`) — run
   it **before any risky migration**.

Required GitHub secrets for the dump job: `DATABASE_URL`, `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET`.

## Restore — Neon PITR (preferred, fastest)

1. Neon console → project → **Branches** → **Restore** (or "Time Travel").
2. Pick the timestamp just before the incident.
3. Either restore in place, or create a new branch from that point and verify it.
4. Point the app at the restored branch: update the `DATABASE_URL` Wrangler secret
   (`wrangler secret put DATABASE_URL`) and redeploy the Worker.
5. After cutover, run `DATABASE_URL=<restored> bun run db:verify` to confirm all
   migrations are present.

## Restore — from the R2 dump (Neon project lost)

1. Provision a new Postgres (new Neon project, or any pg16).
2. Pull the latest dump:
   `aws s3 cp s3://$R2_BACKUP_BUCKET/daily/<file>.sql.gz . --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com`
3. Restore: `gunzip -c <file>.sql.gz | psql "$NEW_DATABASE_URL"`
4. `DATABASE_URL=$NEW_DATABASE_URL bun run db:verify` (expect "all N migrations applied ✓").
5. Set the `DATABASE_URL` Wrangler secret to the new DB and redeploy.

## Test cadence

Do a **restore drill quarterly**: restore the latest dump into a throwaway DB, run
`db:verify`, spot-check row counts (`users`, `posts`). An untested backup is not a
backup.
