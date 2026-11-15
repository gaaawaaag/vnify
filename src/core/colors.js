export const isColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const palette = ['#d3ab61', '#79b9ae', '#a8a2dc', '#e29f9f', '#94b875', '#79b5d7', '#d7a0c7', '#c4ba83'];
export function defaultColor(id) {
  let hash = 0;
  for (const ch of id) hash = (Math.imul(hash, 31) + ch.codePointAt(0)) >>> 0;
  return palette[hash % palette.length];
}
function luminance(rgb) {
  return rgb.map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; })
    .reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
}
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export function contrast(a, b = '#151612') {
  const x = luminance(rgb(a)), y = luminance(rgb(b));
  return (Math.max(x,y) + .05) / (Math.min(x,y) + .05);
}
export function readableColor(value, background = '#151612') {
  let channels = rgb(isColor(value) ? value : palette[0]);
  const base = luminance(rgb(isColor(background) ? background : '#151612'));
  const step = (base + .05) / .05 >= 1.05 / (base + .05) ? -8 : 8;
  while ((Math.max(luminance(channels),base) + .05) / (Math.min(luminance(channels),base) + .05) < 4.5) {
    channels = channels.map(x => Math.max(0, Math.min(255, x + step)));
  }
  return '#' + channels.map(x => x.toString(16).padStart(2, '0')).join('');
}
export const colorKey = (bookId, characterId) => JSON.stringify([bookId, characterId]);
export function characterColor(bookId, entity, overrides, background) {
  const override = overrides[colorKey(bookId, entity.id)];
  return readableColor(isColor(override) ? override : entity.color || defaultColor(entity.id), background);
}
