// Preview-server entry: runs `astro dev` in the foreground regardless of the
// launcher's cwd, and pins ASTRO_DEV_BACKGROUND so Astro's agent detection
// doesn't daemonize the process (the preview harness needs it foreground).
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
process.env.ASTRO_DEV_BACKGROUND = '1';
const here = dirname(fileURLToPath(import.meta.url));
process.chdir(here);
await import(pathToFileURL(join(here, 'node_modules/astro/bin/astro.mjs')).href);
