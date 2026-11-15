import {DEFAULT_THEME,THEMES,normalizeTheme} from './theme-preferences.js';

/* Appearance kept in this browser: the theme (global, and per book for books chosen before the setting was dropped),
 * how transparent the dialogue band is, how many lines of text the dialogue holds before it grows, and the line spacing
 * of the text in steps of 0.1 from the default of the work's language. Options the settings no longer offer (portrait
 * display and size, Cut-in size, variants, narrow height in percent) are dropped, so they fall back to their defaults
 * instead of staying stuck at an old choice. */
export const DIALOGUE_LINES=[2,8];
export const LINE_SPACING=[-3,3];
export const DEFAULT_APPEARANCE=Object.freeze({theme:DEFAULT_THEME,bookThemes:Object.freeze({}),dialogueTransparency:30,dialogueLines:3,lineSpacing:0});
const percentage=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100,value)):fallback;
export function normalizeAppearance(value={}) {
  if(!value||typeof value!=='object')value={};
  const [fewest,most]=DIALOGUE_LINES;
  return {
    theme:normalizeTheme(value.theme),
    // Per-book themes remembered in this browser only; unknown themes are dropped.
    bookThemes:Object.fromEntries(Object.entries(value.bookThemes&&typeof value.bookThemes==='object'?value.bookThemes:{})
      .filter(([book,theme])=>book.length<=200&&THEMES.some(t=>t.id===theme)).slice(0,500)),
    dialogueTransparency:percentage(value.dialogueTransparency,DEFAULT_APPEARANCE.dialogueTransparency),
    // Lines of text the dialogue holds at first, on wide and narrow screens alike; long screens add two more.
    dialogueLines:typeof value.dialogueLines==='number'&&Number.isFinite(value.dialogueLines)
      ?Math.max(fewest,Math.min(most,Math.round(value.dialogueLines))):DEFAULT_APPEARANCE.dialogueLines,
    lineSpacing:typeof value.lineSpacing==='number'&&Number.isFinite(value.lineSpacing)
      ?Math.max(LINE_SPACING[0],Math.min(LINE_SPACING[1],Math.round(value.lineSpacing))):DEFAULT_APPEARANCE.lineSpacing,
  };
}
