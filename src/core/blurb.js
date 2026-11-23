// @ts-check
import {scriptLines} from './script-text.js';

/* The story's blurb: at most one record line `// @vn-blurb {"text":"..."}` in the text, beside the director records.
 * It is optional and a comment to the parser, so texts without it, and readers that predate it, read as before. The
 * original book's own description comes first; a whole-book design may write one when the book has none; the shelf can
 * change it. */
export const BLURB_PREFIX='// @vn-blurb ';
export const BLURB_LIMIT=2000;

/** A checked blurb, or an error. @param {unknown} value @returns {string} */
export function checkBlurb(value) {
  if(typeof value!=='string')throw new Error('简介须为文字。');
  const text=value.replace(/\r\n?/g,'\n').trim();
  if(text.length>BLURB_LIMIT)throw new Error(`简介不超过 ${BLURB_LIMIT} 字。`);
  return text;
}

/** The blurb the text carries, or null. @param {string} raw @returns {string|null} */
export function readBlurb(raw) {
  /** @type {string|null} */
  let found=null;
  for(const {text:line,literal} of scriptLines(raw)) {
    if(literal||!line.startsWith(BLURB_PREFIX))continue;
    if(found!==null)throw new Error('简介记录重复。');
    let value;
    try {value=JSON.parse(line.slice(BLURB_PREFIX.length));} catch {throw new Error('简介记录无效。');}
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>key!=='text'))throw new Error('简介记录须为 {"text":"…"}。');
    found=checkBlurb(value.text);
  }
  return found||null;
}

/* The text with its blurb replaced: the record line is rewritten where it stands, added before the first director record
 * (or at the end), or removed when the blurb is empty. Every other line stays as it is.
 * @param {string} raw @param {string|null} blurb @returns {string} */
export function withBlurb(raw,blurb) {
  const text=blurb===null?'':checkBlurb(blurb),lines=raw.split('\n');
  const literal=scriptLines(raw).map(line=>line.literal);
  const at=lines.findIndex((line,i)=>!literal[i]&&line.trim().startsWith(BLURB_PREFIX));
  const record=`${BLURB_PREFIX}${JSON.stringify({text})}`;
  if(at>=0) {
    if(text)lines[at]=record+(lines[at].endsWith('\r')?'\r':'');
    else lines.splice(at,1);
    return lines.join('\n');
  }
  if(!text)return raw;
  const before=lines.findIndex((line,i)=>!literal[i]&&/^\/\/ @vn-(title-card|end-card|director) /.test(line.trim()));
  if(before>=0){lines.splice(before,0,record);return lines.join('\n');}
  return `${raw.replace(/\n*$/,'')}\n${record}\n`;
}
