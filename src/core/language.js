// @ts-check
// Languages a work can be written in. A work without a declared language is Chinese in simplified characters.

/** @typedef {'zh'|'zh-Hant'|'en'|'ja'} BookLanguage */

/** @type {BookLanguage[]} */
export const BOOK_LANGUAGES = ['zh', 'zh-Hant', 'en', 'ja'];
/** @type {BookLanguage} */
export const DEFAULT_LANGUAGE = 'zh';

/** @param {unknown} value @returns {value is BookLanguage} */
export const isBookLanguage = value => typeof value === 'string' && /** @type {string[]} */ (BOOK_LANGUAGES).includes(value);

// Common characters written differently in the two scripts, in the same order.
const SIMPLIFIED = '们这个来说时会对为国学开关门见问么还过没长头发经现发样点让们话认听觉边进远选东车马鸟鱼书买卖实应该从后里种';
const TRADITIONAL = '們這個來說時會對為國學開關門見問麼還過沒長頭髮經現發樣點讓們話認聽覺邊進遠選東車馬鳥魚書買賣實應該從後裡種';
const ONLY = (/** @type {string} */ own, /** @type {string} */ other) => new RegExp(`[${[...new Set(own)].filter(c => !other.includes(c)).join('')}]`, 'gu');
const SIMPLIFIED_ONLY = ONLY(SIMPLIFIED, TRADITIONAL), TRADITIONAL_ONLY = ONLY(TRADITIONAL, SIMPLIFIED);

/**
 * The language most of a text is written in: Han characters against Latin letters, kana beside the Han characters, and
 * for Chinese, which script its common characters take.
 * @param {string} text
 * @returns {BookLanguage}
 */
export function detectLanguage(text) {
  const sample = String(text).slice(0, 200000);
  const han = (sample.match(/\p{Script=Han}/gu) || []).length;
  const latin = (sample.match(/\p{Script=Latin}/gu) || []).length;
  // One Han character carries about as much as a short English word.
  const kana = (sample.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
  if (latin > (han + kana) * 4) return 'en';
  // Japanese prose carries more kana than kanji; a Chinese text quotes at most a few lines of it.
  if (kana * 3 > han) return 'ja';
  const traditional = (sample.match(TRADITIONAL_ONLY) || []).length, simplified = (sample.match(SIMPLIFIED_ONLY) || []).length;
  return traditional > simplified ? 'zh-Hant' : 'zh';
}
