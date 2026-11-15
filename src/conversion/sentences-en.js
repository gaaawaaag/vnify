// @ts-check
/* English sentence rules for shorthand drafts: where a paragraph splits into numbered units, which quote marks wrap a
 * line of dialogue, and which short lines look like a bare speech tag. Chinese rules stay in shorthand.js. */

/** @typedef {{text:string,gap:string}} SplitUnit */

const END='.!?…';
const OPENERS='“‘"';
// A unit that ends inside a quote ends with its closing marks and brackets.
const TRAILING='”’")]';
const BEFORE_QUOTE=',:;—…';
// Words whose full stop does not end a sentence.
const ABBREVIATIONS=new Set(['mr','mrs','ms','dr','st','jr','sr','prof','mt','rev','gen','col','capt','lt','sgt','hon','messrs','mme','mlle',
  'vs','etc','cf','ca','vol','ch','pp','fig','approx','dept','inc','ltd','co','ave','rd']);
// No. is an abbreviation only before a number (No. 5); otherwise "yes or no." ends the sentence.
const NUMBERED=new Set(['no','nos']);

const letter=(/** @type {string|undefined} */ c)=>/[\p{L}\p{N}]/u.test(c??'');

/** Whether the quote mark at i closes a quote. A straight quote closes when one is open; a right single quote closes only
 * an open single quote and only when no letter follows (otherwise it is an apostrophe, as in don’t).
 * @param {string[]} chars @param {number} i @param {string[]} stack */
function closes(chars,i,stack) {
  const c=chars[i],top=stack.at(-1);
  if(c==='”')return top==='“';
  if(c==='"')return top==='"';
  if(c==='’')return top==='‘'&&!letter(chars[i+1])&&!pluralPossessive(chars,i);
  return false;
}

/** The dogs’ hour: a right single quote after an s with a lowercase word next is an apostrophe.
 * @param {string[]} chars @param {number} i */
function pluralPossessive(chars,i) {
  if(!/[sS]/.test(chars[i-1]??'')||!/\s/.test(chars[i+1]??''))return false;
  for(let j=i+1;j<chars.length;j++)if(!/\s/.test(chars[j]))return /\p{Ll}/u.test(chars[j]);
  return false;
}

/** Whether a quote mark at i opens a quote: double quotes always, a straight quote unless it closes, a left single quote
 * only at the start of a word. @param {string[]} chars @param {number} i @param {string[]} stack */
function opens(chars,i,stack) {
  const c=chars[i];
  if(c==='“')return true;
  if(c==='"')return stack.at(-1)!=='"';
  if(c==='‘')return !letter(chars[i-1]);
  return false;
}

/** A full stop ends the sentence unless it closes an abbreviation, an initial or a number, or lowercase text follows.
 * @param {string[]} chars @param {number} i */
function fullStop(chars,i) {
  const next=chars[i+1];
  if(next!==undefined&&!/[\s”’")\]]/.test(next))return false;
  let start=i;
  while(start>0&&/[\p{L}.]/u.test(chars[start-1]))start--;
  const word=chars.slice(start,i).join('');
  if(ABBREVIATIONS.has(word.toLowerCase().replace(/\./g,'')))return false;
  if(NUMBERED.has(word.toLowerCase())&&/\d/.test(following(chars,i)??''))return false;
  // Single initials (J. R.) and dotted abbreviations (e.g., U.S.).
  if(/^\p{Lu}$/u.test(word)||/\p{L}\.\p{L}/u.test(word))return false;
  return true;
}

/** The next non-space character after i. @param {string[]} chars @param {number} i */
const following=(chars,i)=>{for(let j=i+1;j<chars.length;j++)if(!/\s/.test(chars[j]))return chars[j];return undefined;};

/** Sentence units of one English paragraph. Split after a sentence end (with its closing quotes), also inside a quote,
 * after a quote that opens the unit and is followed by narration, and before a quote that follows a comma or colon.
 * A quoted title ("The Joker" and ...) has no punctuation before its closing mark and stays in its sentence.
 * @param {string} text @returns {SplitUnit[]} */
export function splitUnitsEn(text) {
  /** @type {SplitUnit[]} */
  const units=[];
  // Hard-wrapped sources (plain-text ebooks) break lines inside a paragraph: those breaks are spaces.
  const chars=[...text.replace(/^\s+/,'').replace(/[ \t]*(?:\r\n|\r|\n)[ \t]*/g,' ')];
  /** @type {string[]} Open quotes; a quote may run across several units. */
  const stack=[];
  let cur='',startDepth=0;
  const push=()=>{
    const m=/^([\s\S]*?)(\s*)$/.exec(cur);
    if(m&&m[1])units.push({text:m[1],gap:m[2]});
    else if(units.length)units[units.length-1].gap+=cur;
    cur='';startDepth=stack.length;
  };
  // The unit is speech: it starts with a quote mark or inside a quote that an earlier unit opened.
  const quoted=()=>startDepth>0||OPENERS.includes(cur.trimStart()[0]??'');
  for(let i=0;i<chars.length;i++) {
    const c=chars[i];
    if(!cur.trim()&&/\s/.test(c)&&units.length){units[units.length-1].gap+=c;continue;}
    const closing=closes(chars,i,stack),opening=!closing&&opens(chars,i,stack);
    if(opening&&cur.trim()&&!stack.length&&BEFORE_QUOTE.includes(cur.trimEnd().at(-1)??''))push();
    cur+=c;
    if(closing)stack.pop();
    else if(opening)stack.push(c);
    const ends=END.includes(c)&&letter([...cur].find(ch=>letter(ch)))&&(c!=='.'||fullStop(chars,i));
    if(ends) {
      // ?! and ... stay together.
      while(i+1<chars.length&&END.includes(chars[i+1]))cur+=chars[++i];
      while(i+1<chars.length&&TRAILING.includes(chars[i+1])&&(chars[i+1]===')'||chars[i+1]===']'||closes(chars,i+1,stack))) {
        cur+=chars[++i];
        if(chars[i]!==')'&&chars[i]!==']')stack.pop();
      }
      // Lowercase text after the end continues the sentence, except after a whole quote that stands alone.
      const next=following(chars,i),lower=next!==undefined&&/\p{Ll}/u.test(next);
      if(!lower||(!stack.length&&quoted()))push();
    } else if(closing&&!stack.length&&quoted()&&/[,;:!?.…—–-]/.test(chars[i-1]??'')&&i+1<chars.length&&!(END+TRAILING+',;:').includes(chars[i+1])) push();
  }
  if(cur)push();
  return units;
}

/** Remove the quote marks that wrap a line of dialogue; quotes inside it stay. @param {string} s */
export function stripOuterQuotesEn(s) {
  const chars=[...s];
  let start=0,end=chars.length;
  if(opens(chars,0,[])) {
    const stack=[chars[0]];
    let match=-1;
    for(let i=1;i<chars.length;i++) {
      if(closes(chars,i,stack)){stack.pop();if(!stack.length){match=i;break;}}
      else if(opens(chars,i,stack))stack.push(chars[i]);
    }
    // An opening quote with no close in the unit belongs to a quote that continues in the next unit.
    if(match===-1||match===chars.length-1)start=1;
    if(match===chars.length-1)end=chars.length-1;
  }
  if(end===chars.length&&'”’"'.includes(chars.at(-1)??'')) {
    // A closing quote whose opening mark is in an earlier unit.
    /** @type {string[]} */
    const inner=[];
    let unmatched=false;
    for(let i=start;i<chars.length;i++) {
      if(closes(chars,i,inner))inner.pop();
      else if(i===chars.length-1&&(chars[i]==='”'||chars[i]==='"'||chars[i]==='’'))unmatched=true;
      else if(opens(chars,i,inner))inner.push(chars[i]);
    }
    if(unmatched)end=chars.length-1;
  }
  return chars.slice(start,end).join('');
}

const TAG_VERBS='said|says|asked|asks|replied|answered|shouted|cried|called|whispered|muttered|murmured|added|continued|began|exclaimed|'
  +'remarked|observed|insisted|demanded|repeated|went on|snapped|told';
const TAG=new RegExp(String.raw`^(?:(?:${TAG_VERBS})\s+\S+(?:\s+\S+)?|(?:\S+\s+){0,3}(?:${TAG_VERBS})(?:\s+\S+){0,3})[.,:;]?$`,'i');

/** A short line that only says who spoke. @param {string} body */
export const speechTagEn=body=>body.length<=48&&TAG.test(body.trim());

/** Names link only as whole words. @param {string} text @param {number} at @param {number} length */
export const wholeWord=(text,at,length)=>!letter(text[at-1])&&!letter(text[at+length]);
