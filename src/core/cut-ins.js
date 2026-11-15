// @ts-check
/** @import {Story} from '../types/story.js' */
/** @import {CutIn,CutInArt,CutInUse,DirectorRecord} from '../types/director.js' */
// Image definitions are global; uses bind inclusive ranges to immutable units.
/**
 * @param {{cutIns?:unknown,cutInUses?:unknown}} doc @param {Story} story @param {string} chapterId
 * @param {DirectorRecord[]} [previous] @returns {{cutIns:CutIn[],cutInUses:CutInUse[]}}
 */
export function validateCutIns(doc,story,chapterId,previous=[]) {
  const definitions=doc.cutIns??[],uses=doc.cutInUses??[];
  if(!Array.isArray(definitions)||definitions.length>128||!Array.isArray(uses)||uses.length>128)throw new Error('cutIns 与 cutInUses 须为数组，最多各 128 条。');
  const known=new Map(previous.flatMap(d=>(d.cutIns??[]).map(c=>[c.id,c]))),fresh=new Set();
  const cutIns=definitions.map(c=>{
    if(!c||typeof c.id!=='string'||!/^[\w.-]{1,160}$/.test(c.id)||known.has(c.id))throw new Error('Cut-in id 须为全书唯一稳定 ID；复用使用 cutInUses，不重复定义。');
    const limits=/** @type {const} */([['prompt',20000],['reason',2000]]);
    for(const [key,max] of limits)if(typeof c[key]!=='string'||!c[key].trim()||c[key].length>max)throw new Error(`Cut-in ${key} 无效。`);
    const result={id:c.id,reason:c.reason.trim(),prompt:c.prompt.trim()};
    known.set(c.id,result);fresh.add(c.id);return result;
  });
  const positions=new Map(story.units.map((u,i)=>[u.id,i])),occupied=new Set(),used=new Set();
  const cutInUses=uses.map(use=>{
    if(!use||!known.has(use.cutInId))throw new Error('Cut-in 使用了尚未定义的图片 ID。');
    const start=positions.get(use.from),end=positions.get(use.to);
    if(start===undefined||end===undefined||end<start||story.units.slice(start,end+1).some(u=>u.chapter.id!==chapterId))throw new Error('Cut-in 起止单元须属于本章，且顺序有效。');
    for(let i=start;i<=end;i++){if(occupied.has(i))throw new Error('同章 Cut-in 显示范围不可重叠。');occupied.add(i);}
    used.add(use.cutInId);return {cutInId:use.cutInId,from:use.from,to:use.to};
  });
  if([...fresh].some(id=>!used.has(id)))throw new Error('新增 Cut-in 须在本章安排显示范围。');
  return {cutIns,cutInUses};
}
/** @param {Story} story @param {DirectorRecord[]} docs @returns {CutInArt} */
export function compileCutIns(story,docs) {
  const positions=new Map(story.units.map((u,i)=>[u.id,i]));
  // Records passed validation, so every range end names a unit.
  const at=(/** @type {string} */ id)=>/** @type {number} */(positions.get(id));
  return {images:new Map(docs.flatMap(d=>(d.cutIns??[]).map(c=>[c.id,{...c,chapterId:d.chapterId}]))),
    uses:docs.flatMap(d=>(d.cutInUses??[]).map(u=>({...u,chapterId:d.chapterId,start:at(u.from),end:at(u.to)})))};
}
/** @param {Story|null|undefined} story @param {number} index */
export function activeCutIn(story,index) {
  const use=story?.cutInArt?.uses.find(u=>index>=u.start&&index<=u.end);
  return use?story?.cutInArt?.images.get(use.cutInId):null;
}
