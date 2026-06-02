import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{astro,html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        paper: '#FBFAF7', // page background
        ink: '#1A1817', // primary text
        mute: '#5C544C', // secondary text
        hinomaru: '#D63752', // brand red (logo "101", accents)
        sakura: '#E8A0AE', // soft pink (selection, hover)
        tan: '#D6C7B3', // scrollbar / muted chrome
        line: '#E8E2D8', // borders / dividers
      },
      fontFamily: {
        // Latin UI + JA body
        body: ['Inter', '"Noto Sans JP"', 'system-ui', 'sans-serif'],
        // JA serif for headings — the authentic mincho look
        serif: ['"Shippori Mincho B1"', '"Noto Serif JP"', 'serif'],
      },
    },
  },
} satisfies Config;
