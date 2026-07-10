/* One-shot asset baker: square favicons + the default OG share card, all derived
 * from the brand mark in public/favicon.svg. Run from frontend/ (WSL, where
 * sharp's Linux binary lives):  bun run scripts/make-icons.mjs
 *
 * Why square PNGs/ICO exist next to the SVG: Google's crawler wants a perfect
 * square raster (Not Bagel's non-square logo got a globe in the results) and
 * /favicon.ico is the hard-coded crawler fallback (404 today). The ICO is a
 * modern PNG-in-ICO container (valid since Vista; accepted by every crawler). */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url));

async function png(size, out) {
  const buf = await sharp(svg, { density: (72 * size) / 64 }).resize(size, size).png().toBuffer();
  await writeFile(new URL(`../public/${out}`, import.meta.url), buf);
  console.log(`${out}  ${size}x${size}  ${buf.length}B`);
  return buf;
}

await png(96, 'favicon.png');          // <link rel="icon"> (48-multiple, Google-friendly)
await png(180, 'apple-touch-icon.png');
const ico48 = await sharp(svg, { density: (72 * 48) / 64 }).resize(48, 48).png().toBuffer();

// PNG-in-ICO container: 6-byte header + one 16-byte directory entry + PNG bytes.
const header = Buffer.alloc(6 + 16);
header.writeUInt16LE(0, 0);            // reserved
header.writeUInt16LE(1, 2);            // type: icon
header.writeUInt16LE(1, 4);            // image count
header.writeUInt8(48, 6);              // width
header.writeUInt8(48, 7);              // height
header.writeUInt8(0, 8);               // palette
header.writeUInt8(0, 9);               // reserved
header.writeUInt16LE(1, 10);           // color planes
header.writeUInt16LE(32, 12);          // bits per pixel
header.writeUInt32LE(ico48.length, 14); // image size
header.writeUInt32LE(22, 18);          // image offset (6 + 16)
await writeFile(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([header, ico48]));
console.log(`favicon.ico  48x48  ${ico48.length + 22}B`);

// Default OG share card (1200×630): cream canvas, the hinomaru-101 mark scaled up,
// the wordmark + tagline as plain sans text (per-post cards use the post cover, so
// this only shows for the home/listing pages and coverless posts).
const og = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#FBFAF7"/>
  <rect x="0" y="602" width="1200" height="28" fill="#D63752"/>
  <g transform="translate(420,120) scale(5.625)">
    <circle cx="32" cy="26" r="12" fill="#D63752"/>
    <path id="one" d="M16 13 L16 36 L19 36 L19 40 L7 40 L7 36 L10 36 L10 17 L6.5 18.5 L5.5 15 Z" fill="#1A1817"/>
    <use href="#one" transform="translate(38,0)"/>
  </g>
  <text x="600" y="452" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="64" font-weight="bold" fill="#1A1817">nihon101</text>
  <text x="600" y="516" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#5C544C">Slow stories from Japan — culture, food, travel &amp; anime</text>
</svg>`;
const ogBuf = await sharp(Buffer.from(og)).png().toBuffer();
await writeFile(new URL('../public/og-default.png', import.meta.url), ogBuf);
console.log(`og-default.png  1200x630  ${ogBuf.length}B`);
