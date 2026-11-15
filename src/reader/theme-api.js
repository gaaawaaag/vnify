// What a theme may set. Every custom property declared in styles/tokens.css is themeable, except the
// resolved font chain (themes set --theme-*-font instead, so a reader's own font can still win).
// Decoration slots add --<slot>-layer/-texture/-frame/-outset (see styles/theme-layers.css).
export const THEME_SLOTS=Object.freeze(['dialogue','nameplate','document','toolbar','chapter','scene','portrait','title']);
export const SLOT_PARTS=Object.freeze(['layer','texture','frame','outset']);
// Icons of the page sprite a theme may replace (registry `icons`: an SVG of <symbol>s with these ids).
export const THEME_ICONS=Object.freeze(['i-hide','i-history','i-auto','i-menu','i-next','i-close','i-back']);
export const THEME_FONTS=Object.freeze(['--theme-ui-font','--theme-title-font','--theme-reading-font',
  '--theme-ui-font-en','--theme-title-font-en','--theme-reading-font-en',
  '--theme-ui-font-ja','--theme-title-font-ja','--theme-reading-font-ja',
  '--theme-ui-font-hant','--theme-title-font-hant','--theme-reading-font-hant']);
export const RESERVED=Object.freeze(['--ui-font','--title-font','--reading-font','--user-reading-font']);
export const ASSET_TYPES=Object.freeze({'.png':'image','.webp':'image','.jpg':'image','.jpeg':'image','.svg':'image',
  '.woff2':'font','.woff':'font','.ttf':'font','.otf':'font','.css':'style'});
export const LIMITS=Object.freeze({file:10*1024*1024,images:10*1024*1024,total:40*1024*1024});

export function tokenVariables(tokensCss) {
  const names=new Set();
  for(const m of tokensCss.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/(--[\w-]+)\s*:/g))names.add(m[1]);
  return names;
}
export function themeVariables(tokensCss) {
  const names=tokenVariables(tokensCss);
  for(const name of RESERVED)names.delete(name);
  for(const name of THEME_FONTS)names.add(name);
  for(const slot of THEME_SLOTS)for(const part of SLOT_PARTS)names.add(`--${slot}-${part}`);
  return names;
}
