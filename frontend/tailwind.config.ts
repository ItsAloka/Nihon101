import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{astro,html,tsx,ts}'],
  theme: {
    extend: {
      fontFamily: {
        body: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif JP"', 'serif'],
      },
    },
  },
} satisfies Config;
