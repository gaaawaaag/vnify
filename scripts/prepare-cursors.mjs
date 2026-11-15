import { writeFile } from 'node:fs/promises';

/* Draws the three cursors from circles and diamonds and renders them to 32px PNGs with a soft shadow baked in (the
 * browser uses the PNGs; SVG cursors with filters fell back to the system pointer in real use). Sharp is a dependency
 * of the production tools; the player itself only reads the PNGs.
 *   node scripts/prepare-cursors.mjs
 * Hotspots (tokens.css): cursor 3 3 (the tip), pointer 14 14 (the diamond's centre), help 3 3. */
const sharp = (await import('sharp')).default;

const shadow = `<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="1"/><feOffset dy="1"/>
    <feComponentTransfer><feFuncA type="linear" slope=".55"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;
const fill = '#f2f4f7', edge = '#16181c';
// A slim diamond leaning to the upper left: its long tip is the arrow's point.
const kite = `<path d="M3 3 L11.5 25 L14 14 L25 11.5 Z" fill="${fill}" stroke="${edge}" stroke-width="1.2" stroke-linejoin="round"/>`;
const shapes = {
  cursor: kite,
  pointer: `<rect x="8.5" y="8.5" width="11" height="11" transform="rotate(45 14 14)" fill="${fill}" stroke="${edge}" stroke-width="1.2"/>
    <circle cx="14" cy="14" r="1.6" fill="${edge}"/>`,
  // Notes: the arrow with a small ring tucked into its notch.
  help: `${kite}<circle cx="20" cy="20" r="3.2" fill="none" stroke="${edge}" stroke-width="3"/>
    <circle cx="20" cy="20" r="3.2" fill="none" stroke="${fill}" stroke-width="1.5"/>`,
};

for (const [name, body] of Object.entries(shapes)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>${shadow}</defs>
  <g filter="url(#shadow)">${body}</g>
</svg>
`;
  await writeFile(new URL(`../assets/cursors/${name}.svg`, import.meta.url), svg);
  await writeFile(new URL(`../assets/cursors/${name}.png`, import.meta.url), await sharp(Buffer.from(svg)).png().toBuffer());
}
