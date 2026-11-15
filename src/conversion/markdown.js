// @ts-check
/* Markdown sources are numbered as plain text: emphasis markers and backslash escapes come off, heading marks go, and a
 * thematic break (* * *, ***, ---) becomes the line `* * *`. Line structure is kept, so paragraphs number as before.
 * Italics are not kept; the text of every line is. */

const BREAK=/^\s*(?:(?:\\?\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;

/** @param {string} line */
function plainLine(line) {
  if(BREAK.test(line))return '* * *';
  return line
    .replace(/^(\s*)#{1,6}\s+/,'$1')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g,'$1')
    .replace(/__(?=\S)([\s\S]*?\S)__/g,'$1')
    .replace(/(?<![\p{L}\p{N}*\\])\*(?=\S)([^*]*?[^\s\\*])\*(?![\p{L}\p{N}*])/gu,'$1')
    .replace(/(?<![\p{L}\p{N}_\\])_(?=\S)([^_]*?[^\s\\_])_(?![\p{L}\p{N}_])/gu,'$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g,'$1');
}

/** Plain text of a Markdown document, line for line. @param {string} text */
export const markdownText=text=>text.split(/(\r\n|\r|\n)/).map((part,i)=>i%2?part:plainLine(part)).join('');
