/**
 * One-shot PWA icon generator. Renders the brand mark (white cloud on the
 * indigo accent gradient) to the PNG sizes the manifest + apple-touch-icon
 * reference. Run once with `node scripts/generate-icons.mjs`; output lands in
 * public/icons/. Re-run only if the brand mark changes.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// Cloud glyph path from lucide "cloud" (the same icon used in the UI).
const cloudPath =
  "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z";

/**
 * @param {number} size   output px
 * @param {number} pad    fraction of size kept as empty margin around the glyph
 *                        (maskable icons need a large safe margin)
 * @param {boolean} rounded  round the background corners (regular icon)
 */
function svg(size, pad, rounded) {
  const radius = rounded ? size * 0.22 : 0;
  // Scale + center the 24x24 lucide glyph inside the padded area.
  const inner = size * (1 - pad * 2);
  const scale = inner / 24;
  const offset = size * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none"
     stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="${cloudPath}"/>
  </g>
</svg>`;
}

async function render(name, size, pad, rounded) {
  const buf = Buffer.from(svg(size, pad, rounded));
  await sharp(buf).png().toFile(join(outDir, name));
  console.log("wrote", name);
}

await mkdir(outDir, { recursive: true });
await render("icon-192.png", 192, 0.24, true);
await render("icon-512.png", 512, 0.24, true);
await render("icon-maskable-512.png", 512, 0.34, false); // full-bleed bg + safe margin
await render("apple-touch-icon.png", 180, 0.24, true);
console.log("done");
