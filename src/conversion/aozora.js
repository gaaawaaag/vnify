// @ts-check
/* Japanese text files in Aozora Bunko's notation: readings in 《》 after their word (the word marked off by ｜ when it is
 * not a plain run of kanji), editor's notes in ［＃…］, a legend of these marks after the title and a colophon at the end.
 * The player shows no readings, so the source is numbered without the marks. */

const KANA=String.raw`[\p{Script=Hiragana}\p{Script=Katakana}ー・ヽヾゝゞ]`;
const MARKED_RUBY=/｜([^｜《》\r\n]+)《[^《》\r\n]+》/g;
// Without ｜ the reading belongs to the kanji before it; other text in 《》 is the author's own bracket and stays.
const KANJI_RUBY=new RegExp(String.raw`(?<=[\p{Script=Han}々〆〇ヶ])《${KANA}+》`,'gu');
const LEGEND=/^-{20,}\r?\n【テキスト中に現れる記号について】[\s\S]*?^-{20,}\r?\n/m;
const COLOPHON=/^底本[：:]/m;
// ※［＃…］ stands for a character outside the file's character set; the note names it, sometimes by code point.
const GAIJI=/※［＃[^］\r\n]*］/g;
const NOTE=/［＃[^］\r\n]*］/g;

/**
 * The reading text of an Aozora Bunko file. Text without these marks comes back unchanged.
 * @param {string} text
 * @returns {{text:string,ruby:number,notes:number,gaiji:number}} the text and how many readings and notes were removed and
 *   how many characters outside the character set could not be restored (left as ※)
 */
export function aozoraText(text) {
  let ruby=0,notes=0,gaiji=0;
  let body=text.replace(LEGEND,'');
  const colophon=body.search(COLOPHON);
  if(colophon>0)body=body.slice(0,colophon).replace(/\s+$/,'\n');
  body=body.replace(GAIJI,note=>{
    const code=/U\+([0-9A-Fa-f]{4,6})/.exec(note);
    if(code)return String.fromCodePoint(Number.parseInt(code[1],16));
    gaiji++;
    return '※';
  });
  body=body.replace(NOTE,()=>{notes++;return '';});
  body=body.replace(MARKED_RUBY,(_,word)=>{ruby++;return word;});
  body=body.replace(KANJI_RUBY,()=>{ruby++;return '';});
  // A line that held only notes is now blank space.
  body=body.replace(/^[ \t　]+$/gm,'');
  return {text:body,ruby,notes,gaiji};
}
