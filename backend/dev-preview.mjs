// Preview-server entry: runs `wrangler dev` from this directory regardless of
// the launcher's cwd or shell (the old launch.json bash one-liner broke under
// runners whose /bin/bash is not Git Bash). The [[hyperdrive]] bindings are
// live in wrangler.toml, so both LOCAL_CONNECTION_STRING spellings are exported
// from .dev.vars' DATABASE_URL before wrangler starts — wrangler ≥4.107 only
// reads them from the environment, never from .dev.vars itself.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const devVars = readFileSync(join(here, '.dev.vars'), 'utf8');
const db = devVars.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, '');
if (!db) { console.error('dev-preview: no DATABASE_URL in backend/.dev.vars'); process.exit(1); }

for (const prefix of ['WRANGLER', 'CLOUDFLARE']) {
  process.env[`${prefix}_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`] = db;
  process.env[`${prefix}_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_CACHED`] = db;
}

const child = spawn('bunx', ['wrangler', 'dev'], { cwd: here, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 1));
