import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [react()],
  i18n: {
    defaultLocale: 'ja',
    locales: ['ja', 'en'],
    routing: { prefixDefaultLocale: true },
  },
  server: { port: 4321 },
  // Dev-only: proxy API calls through the web origin so the page reaches the
  // Worker same-origin (the preview browser can't hit :8787 directly). Prod
  // uses api.nihon101.com and is unaffected.
  vite: {
    server: {
      // Poll for file changes: inotify doesn't fire for files on the Windows
      // drive (/mnt/c) when the dev server runs in WSL, so without polling HMR
      // never sees edits and serves stale modules. Dev-only.
      watch: { usePolling: true, interval: 150 },
      proxy: {
        '/auth': 'http://localhost:8787',
        '/posts': 'http://localhost:8787',
        '/categories': 'http://localhost:8787',
        '/media': 'http://localhost:8787',
        '/users': 'http://localhost:8787',
        '/translate': 'http://localhost:8787',
        '/search': 'http://localhost:8787',
        '/feed': 'http://localhost:8787',
        '/notifications': 'http://localhost:8787',
        '/home': 'http://localhost:8787',
        '/weather': 'http://localhost:8787',
        '/admin': 'http://localhost:8787',
        '/reports': 'http://localhost:8787',
        '/newsletter': 'http://localhost:8787',
      },
    },
  },
});
