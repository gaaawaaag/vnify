// @ts-check
/** @import {Story} from '../types/story.js' */
/** @import {CastMember,Cg,CgRecord,DirectorRecord} from '../types/director.js' */
// CG ranges refer to immutable body unit IDs, inclusive at both ends.
export const CAST_LIMIT=3;
// A CG's main characters, at most three: the prompt names them @1–@3, each at least once; their portraits go along as references.
/** @param {unknown} value @param {string} prompt @param {Story} story @returns {CastMember[]} */
function validateCast(value,prompt,story) {
  if(!Array.isArray(value)||value.length>CAST_LIMIT)throw new Error(`CG cast 须为数组，最多 ${CAST_LIMIT} 人。`);
  const ids=new Set();
  const cast=value.map(member=>{
    if(!member||typeof member.id!=='string'||story.entities.get(member.id)?.kind!=='character')throw new Error(`CG cast 的 id 须为人物 ID：${JSON.stringify(member?.id)}。`);
    if(ids.has(member.id))throw new Error(`CG cast 重复列出 ${member.id}。`);
    ids.add(member.id);
    if(typeof member.look!=='string'||!member.look.trim()||member.look.length>4000)throw new Error(`CG cast 的 ${member.id} 需要 look。`);
    return {id:member.id,look:member.look.trim()};
  });
  const used=new Set([...prompt.matchAll(/@(\d+)/g)].map(m=>Number(m[1])));
  for(const n of used)if(n<1||n>cast.length)throw new Error(`CG prompt 里的 @${n} 在 cast 中没有对应人物。`);
  cast.forEach((member,i)=>{if(!used.has(i+1))throw new Error(`CG prompt 须用 @${i+1} 写出 ${member.id} 在画面中做什么。`);});
  return cast;
}

/** @param {unknown} value @param {Story} story @param {string} chapterId @returns {Cg[]} */
export function validateCgs(value,story,chapterId) {
  if(!Array.isArray(value)||value.length>128)throw new Error('Director cgs 须为数组，最多 128 条。');
  const occupied=new Set(),ids=new Set();
  return value.map(cg=>{
    if(!cg||typeof cg.id!=='string'||!cg.id.startsWith(`${chapterId}.`)||!/^[\w.-]+$/.test(cg.id)||cg.id.length>160||ids.has(cg.id))throw new Error('CG id 须以章节 ID 加点开头，且不重复。');
    ids.add(cg.id);
    const start=story.units.findIndex(u=>u.id===cg.from),end=story.units.findIndex(u=>u.id===cg.to);
    if(start<0||end<start||story.units.slice(start,end+1).some(u=>u.chapter.id!==chapterId))throw new Error('CG 起止单元须属于本章，且顺序有效。');
    for(let i=start;i<=end;i++){if(occupied.has(i))throw new Error('同章 CG 显示范围不可重叠。');occupied.add(i);}
    const limits=/** @type {const} */([['prompt',20000],['reason',2000]]);
    for(const [key,limit] of limits)if(typeof cg[key]!=='string'||!cg[key].trim()||cg[key].length>limit)throw new Error(`CG ${key} 无效。`);
    // Retain legacy evidence arrays as metadata; they do not constrain CG timing.
    // CGs written before cast existed have none: their prompt describes everyone, and no portraits go along.
    const cast=cg.cast===undefined?undefined:validateCast(cg.cast,cg.prompt,story);
    return {id:cg.id,from:cg.from,to:cg.to,...(Array.isArray(cg.evidence)?{evidence:[...cg.evidence]}:{}),reason:cg.reason.trim(),...(cast?{cast}:{}),prompt:cg.prompt.trim()};
  });
}
/** @param {Story} story @param {DirectorRecord[]} directors @returns {Map<string,CgRecord>} */
export function compileCgs(story,directors) {
  const positions=new Map(story.units.map((u,i)=>[u.id,i]));
  // Records passed validation, so every range end names a unit.
  const at=(/** @type {string} */ id)=>/** @type {number} */(positions.get(id));
  return new Map(directors.flatMap(doc=>(doc.cgs??[]).map(cg=>[cg.id,{...cg,chapterId:doc.chapterId,start:at(cg.from),end:at(cg.to)}])));
}
/** @param {Story|null|undefined} story @param {number} index */
export function activeCg(story,index) {
  return [...(story?.cgs?.values()??[])].find(cg=>index>=cg.start&&index<=cg.end)??null;
}
