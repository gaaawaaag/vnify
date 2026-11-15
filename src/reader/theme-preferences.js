import './theme-registry.js';

export const THEMES=globalThis.VN_THEME_REGISTRY;
export const DEFAULT_THEME=THEMES[0].id;
export const normalizeTheme=value=>THEMES.some(theme=>theme.id===value)?value:DEFAULT_THEME;
