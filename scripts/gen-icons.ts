/**
 * Generates the app icons from one stopwatch glyph: the favicon and the PWA/iOS PNGs.
 * Run with `npm run gen:icons`. The colours are the canvas, surface and accent theme
 * tokens in src/index.css written as hex, since SVG files and PNGs cannot use oklch or
 * CSS variables; src/test/themeColours.test.ts checks they still match.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const CANVAS = "#111419";
const SURFACE = "#1b1e25";
const ACCENT = "#33ebb6";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// Drawn on a 512 grid. Everything sits inside the central 80% circle (the maskable
// safe zone), so one glyph serves the normal, maskable and iOS icons.
const GLYPH = `
  <rect x="224" y="84" width="64" height="30" rx="10" fill="${ACCENT}"/>
  <rect x="244" y="112" width="24" height="36" fill="${ACCENT}"/>
  <circle cx="256" cy="276" r="128" fill="${SURFACE}" stroke="${ACCENT}" stroke-width="32"/>
  <line x1="256" y1="276" x2="309" y2="212" stroke="${ACCENT}" stroke-width="28" stroke-linecap="round"/>
  <circle cx="256" cy="276" r="18" fill="${ACCENT}"/>`;

function svg(cornerRadius: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${cornerRadius}" fill="${CANVAS}"/>${GLYPH}
</svg>
`;
}

async function png(name: string, size: number) {
  // Square, full-bleed: the OS applies its own mask or rounding.
  await sharp(Buffer.from(svg(0))).resize(size, size).png().toFile(join(publicDir, name));
}

writeFileSync(join(publicDir, "favicon.svg"), svg(112));
await png("icon-192.png", 192);
await png("icon-512.png", 512);
await png("icon-maskable-512.png", 512);
await png("apple-touch-icon.png", 180);
console.log("Generated favicon.svg, icon-192/512.png, icon-maskable-512.png, apple-touch-icon.png");
