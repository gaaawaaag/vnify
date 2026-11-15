// @ts-check
/** @import {Story,Unit} from '../types/story.js' */
/** @import {LookProfile,ResolvedLookProfile,LookNotice} from '../types/production.js' */
/** @import {DirectorRecord,StageRecord} from '../types/director.js' */

import {splitUnits} from './shorthand.js';

/* Looks: what the source text says about how a character or a place looks (visual-profiles.json).
 * Each entry points at a source and quotes it. The quote only locates the passage: the text handed to the director is
 * the story's own, so a miscopied character does no harm and a quote that is nowhere in its source is left out. */

export const LOOK_MAX=60,LOOK_TEXT_MAX=500,LOOK_NOTE_MAX=1000;
// A run of this many characters shared with the quote places it in a line (shorter quotes must be there whole).
const RUN={zh:6,en:16};
// A description this long clears the stage for the character; a shorter one only brings them on.
const LONG={zh:40,en:120};

const plain=(/** @type {string} */ s)=>s.replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();

// Length of the longest run of characters two strings share.
/** @param {string} a @param {string} b */
export function sharedRun(a,b) {
  let best=0,row=new Uint16Array(b.length+1);
  for(let i=1;i<=a.length;i++) {
    const next=new Uint16Array(b.length+1);
    for(let j=1;j<=b.length;j++)if(a[i-1]===b[j-1]) {
      next[j]=row[j-1]+1;
      if(next[j]>best)best=next[j];
    }
    row=next;
  }
  return best;
}

// Whether a line holds part of the quote, and how much of it.
/** @param {string} line @param {string} quote @param {'zh'|'en'} lang */
export function quoteRun(line,quote,lang) {
  const a=plain(line),b=plain(quote);
  if(!a||!b)return 0;
  const run=sharedRun(a,b),need=Math.min(b.length,RUN[lang]);
  if(run>=need)return run;
  // A very short line counts when the quote holds all of it.
  return a.length>=4&&run===a.length?run:0;
}

/** @param {any} profiles @param {(id:string)=>boolean} known */
export function checkLookProfiles(profiles,known) {
  const fail=(/** @type {string} */ why)=>{
    throw new Error(`visualProfiles：${why}。每项为 {"id":"实体ID","look":[{"source":"来源ID","text":"原文摘录","when":"可选"}],"note":"可选"}。`);
  };
  if(!Array.isArray(profiles))fail('须为数组或该 JSON 文件的路径');
  const seen=new Set();
  for(const p of profiles) {
    if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.id!=='string')fail('条目须为带 id 的对象');
    if(Object.keys(p).some(k=>!['id','look','note'].includes(k)))fail(`${p.id} 只含 id、look、note（概括改为摘录原句，非原文的外观写在 note）`);
    if(!known(p.id))fail(`没有实体 ${p.id}`);
    if(seen.has(p.id))fail(`${p.id} 重复`);
    seen.add(p.id);
    if(p.look===undefined&&p.note===undefined)fail(`${p.id} 需要 look 或 note`);
    if(p.note!==undefined&&(typeof p.note!=='string'||!p.note.trim()||p.note.length>LOOK_NOTE_MAX))fail(`${p.id} 的 note 须为不超过 ${LOOK_NOTE_MAX} 字的文字`);
    if(p.look===undefined)continue;
    if(!Array.isArray(p.look)||p.look.length>LOOK_MAX)fail(`${p.id} 的 look 须为不超过 ${LOOK_MAX} 项的数组`);
    for(const item of p.look) {
      if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['source','text','when'].includes(k)))fail(`${p.id} 的摘录只含 source、text、when`);
      if(typeof item.source!=='string'||typeof item.text!=='string'||!item.text.trim()||item.text.length>LOOK_TEXT_MAX)fail(`${p.id} 的摘录需要 source 与不超过 ${LOOK_TEXT_MAX} 字的 text`);
      if(item.when!==undefined&&(typeof item.when!=='string'||!item.when.trim()||item.when.length>40))fail(`${p.id} 的 when 须为不超过 40 字的文字`);
    }
  }
  return /** @type {LookProfile[]} */(profiles);
}

/* Place every quote in the story: the lines written from its source that share a run with it. The entry then carries
 * those lines' own text. Quotes whose source has no line in the story, or none like the quote, are listed in `notices`
 * and left out; nothing here fails.
 */
/** @param {LookProfile[]} profiles @param {Story} story @returns {{profiles:ResolvedLookProfile[],notices:LookNotice[]}} */
export function resolveLooks(profiles,story) {
  const lang=story.book.lang==='en'?'en':'zh',bySource=new Map();
  for(const [i,u] of story.units.entries())for(const id of u.source??[])bySource.set(id,[...(bySource.get(id)??[]),i]);
  /** @type {LookNotice[]} */
  const notices=[];
  const resolved=profiles.map(p=>{
    const look=[],taken=new Set();
    for(const item of p.look??[]) {
      const lines=bySource.get(item.source)??[];
      const hits=lines.map(i=>({i,run:quoteRun(story.units[i].text,item.text,lang)})).filter(h=>h.run>0);
      if(!hits.length) {
        notices.push({id:p.id,source:item.source,text:item.text,reason:lines.length?'该来源的正文里没有相近的句子':'正文里没有这个来源'});
        continue;
      }
      // Within a line only the sentences the quote touches are kept, so two quotes from one line stay apart.
      const parts=hits.flatMap(h=>{
        const sentences=splitUnits(story.units[h.i].text.replace(/\s*\r?\n\s*/g,' '),lang).map(s=>({text:s.text.trim(),run:quoteRun(s.text,item.text,lang)}));
        const kept=sentences.filter(s=>s.run>0);
        return kept.length?kept:[{text:story.units[h.i].text,run:h.run}];
      });
      const units=hits.map(h=>h.i),text=parts.map(s=>s.text).join(lang==='en'?' ':''),key=text+'\n'+(item.when??'');
      if(taken.has(key))continue;
      taken.add(key);
      look.push({text,...(item.when?{when:item.when.trim()}:{}),units,weight:parts.reduce((n,s)=>n+s.run,0)});
    }
    return {id:p.id,look,...(p.note?{note:p.note.trim()}:{})};
  });
  return {profiles:resolved,notices};
}

// What a packet shows of an entity's looks.
/** @param {ResolvedLookProfile|undefined} profile */
export function lookFields(profile) {
  const look=(profile?.look??[]).map(l=>({text:l.text,...(l.when?{when:l.when}:{})}));
  return {...(look.length?{look}:{}),...(profile?.note?{note:profile.note}:{})};
}

const spoken=(/** @type {Unit} */ u)=>['dialogue','thought'].includes(u.kind)&&u.effect===u.block.effect;

/* Stage ranges where the narration describes a character who is in the scene: the reader sees the portrait while reading
 * the description, before the character has spoken. A long description gets the stage to itself; a short one brings
 * the character on beside whoever is there (`join`). Only looks of the usual appearance count (no `when`), in present
 * scenes, in narration, for characters who speak in that scene block (or are named in it, when nobody speaks there).
 * The director's own ranges win where they overlap.
 */
/** @param {Story} story @param {string} chapterId @param {ResolvedLookProfile[]} profiles @param {StageRecord[]} [own] @returns {StageRecord[]} */
export function lookStages(story,chapterId,profiles,own=[]) {
  const lang=story.book.lang==='en'?'en':'zh',position=new Map(story.units.map((u,i)=>[u.id,i]));
  const covered=(/** @type {number} */ i)=>own.some(s=>i>=/** @type {number} */(position.get(s.from))&&i<=/** @type {number} */(position.get(s.to)));
  const speakers=new Map();
  // In a block where nobody speaks (text kept as narration), the characters it names count instead.
  const speaksIn=(/** @type {Unit} */ u,/** @type {string} */ id)=>{
    const key=u.block.index;
    if(!speakers.has(key)) {
      const block=story.units.filter(x=>x.block.index===key);
      const spoke=new Set(block.filter(x=>spoken(x)&&x.speakerId).map(x=>x.speakerId));
      speakers.set(key,spoke.size?spoke:new Set(block.flatMap(x=>x.runs.map(r=>r.characterId)).filter(Boolean)));
    }
    return speakers.get(key).has(id);
  };
  /** @type {Map<number,{cast:string[],long:boolean}>} */
  const at=new Map();
  for(const p of profiles) {
    if(story.entities.get(p.id)?.kind!=='character')continue;
    for(const l of p.look)if(!l.when)for(const i of l.units) {
      const u=story.units[i];
      if(u.chapter.id!==chapterId||u.block.kind!=='scene'||u.block.effect!=='none'||u.effect!=='none'||u.kind!=='narration')continue;
      if(covered(i)||!speaksIn(u,p.id))continue;
      const entry=at.get(i)??{cast:[],long:false};
      if(!entry.cast.includes(p.id)&&entry.cast.length<3)entry.cast.push(p.id);
      entry.long||=l.weight>=LONG[lang];
      at.set(i,entry);
    }
  }
  /** @type {{start:number,end:number,block:number,cast:string[],long:boolean}[]} */
  const runs=[];
  for(const i of [...at.keys()].sort((a,b)=>a-b)) {
    const e=/** @type {{cast:string[],long:boolean}} */(at.get(i)),u=story.units[i];
    const open=runs.at(-1);
    if(open&&open.end===i-1&&open.block===u.block.index&&open.long===e.long&&open.cast.join()===e.cast.join())open.end=i;
    else runs.push({start:i,end:i,block:u.block.index,cast:e.cast,long:e.long});
  }
  return runs.map(r=>({from:story.units[r.start].id,to:story.units[r.end].id,cast:r.cast,...(r.long?{}:{join:true}),auto:true}));
}

// A chapter record with its look ranges renewed: earlier ones dropped, the current ones added in reading order.
/** @param {DirectorRecord} doc @param {Story} story @param {ResolvedLookProfile[]} profiles @returns {DirectorRecord} */
export function withLookStages(doc,story,profiles) {
  const own=(doc.stages??[]).filter(s=>!s.auto);
  const position=new Map(story.units.map((u,i)=>[u.id,i]));
  const stages=[...own,...lookStages(story,doc.chapterId,profiles,own)]
    .sort((a,b)=>/** @type {number} */(position.get(a.from))-/** @type {number} */(position.get(b.from)));
  const {stages:_,...rest}=doc;
  return /** @type {DirectorRecord} */(stages.length?{...rest,stages}:rest);
}
