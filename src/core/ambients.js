// @ts-check
/** @import {Story,Unit} from '../types/story.js' */
/** @import {Ambient,AmbientArt,AmbientBlocks,DirectorRecord,Generation} from '../types/director.js' */
const AMBIENT_ID=/^[\w.-]{1,160}$/;

// One definition as the design or a chapter writes it.
/** @param {any} value @returns {Ambient} */
export function validateAmbientDefinition(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.id!=='string'||!AMBIENT_ID.test(value.id))
    throw new Error('氛围图 id 须为稳定 ID（字母、数字、下划线、点或连字符）。');
  if(typeof value.name!=='string'||!value.name.trim()||value.name.length>80)throw new Error(`氛围图 ${value.id} 需要 name（80 字以内）。`);
  if(typeof value.prompt!=='string'||!value.prompt.trim()||value.prompt.length>20000)throw new Error(`氛围图 ${value.id} 需要有效的 prompt。`);
  return {id:value.id,name:value.name.trim(),prompt:value.prompt.trim()};
}

/* Definitions are global and immutable; a chapter defines only the ones it shows first, names its default and may give
 * single blocks another one. Reusing an earlier ambient repeats its ID only. */
/**
 * @param {{ambients?:unknown,ambient?:unknown,ambientBlocks?:unknown}} doc @param {Story} story @param {string} chapterId
 * @param {DirectorRecord[]} previous @param {Generation} generation
 * @returns {{ambients:Ambient[],ambient?:string,ambientBlocks:AmbientBlocks[]}}
 */
export function validateAmbients(doc,story,chapterId,previous,generation) {
  const definitions=doc.ambients??[],overrides=doc.ambientBlocks??[];
  if(!Array.isArray(definitions)||definitions.length>128||!Array.isArray(overrides)||overrides.length>128)
    throw new Error('ambients 与 ambientBlocks 须为数组，最多各 128 条。');
  if(!generation.ambients) {
    if(definitions.length||overrides.length||doc.ambient!==undefined)throw new Error('氛围背景关闭时 ambients 与 ambientBlocks 须为 []，并省略 ambient。');
    return {ambients:[],ambientBlocks:[]};
  }
  const known=new Set(previous.flatMap(d=>(d.ambients??[]).map(a=>a.id))),fresh=new Set();
  const ambients=definitions.map(raw=>{
    const ambient=validateAmbientDefinition(raw);
    if(known.has(ambient.id))throw new Error(`氛围图 ${ambient.id} 已定义；复用时只写它的 ID，不重复定义。`);
    known.add(ambient.id);fresh.add(ambient.id);return ambient;
  });
  if(typeof doc.ambient!=='string'||!known.has(doc.ambient))throw new Error('每章需要 ambient：本章默认氛围图的 ID（已定义或本章 ambients 中定义）。');
  const blocks=new Map(story.blocks.filter(b=>b.chapterId===chapterId).map(b=>[b.id,b])),seen=new Set(),used=new Set([doc.ambient]);
  const ambientBlocks=overrides.map(entry=>{
    if(!entry||typeof entry!=='object'||!known.has(entry.ambient))throw new Error('ambientBlocks 使用了尚未定义的氛围图 ID。');
    if(entry.ambient===doc.ambient)throw new Error('ambientBlocks 只写与本章默认氛围图不同的块。');
    if(!Array.isArray(entry.blocks)||!entry.blocks.length)throw new Error('ambientBlocks 每条需要 blocks。');
    for(const id of entry.blocks) {
      if(!blocks.has(id))throw new Error(`ambientBlocks 的块须属于本章：${id}`);
      if(seen.has(id))throw new Error(`块 ${id} 在 ambientBlocks 中重复。`);
      seen.add(id);
    }
    used.add(entry.ambient);return {ambient:entry.ambient,blocks:[...entry.blocks]};
  });
  if([...fresh].some(id=>!used.has(id)))throw new Error('本章新定义的氛围图须用作本章默认或在 ambientBlocks 中使用。');
  return {ambients,ambient:doc.ambient,ambientBlocks};
}

/** @param {DirectorRecord[]} docs @returns {AmbientArt} */
export function compileAmbients(docs) {
  return {
    images:new Map(docs.flatMap(d=>d.ambients.map(a=>[a.id,{...a,chapterId:d.chapterId}]))),
    chapters:new Map(docs.flatMap(d=>d.ambient?[[d.chapterId,d.ambient]]:[])),
    blocks:new Map(docs.flatMap(d=>d.ambientBlocks.flatMap(entry=>entry.blocks.map(id=>[id,entry.ambient])))),
  };
}

// The ambients behind a unit: its block's own, then its chapter's default. Documents keep the scene before them.
/** @param {Story|null|undefined} story @param {Unit|{chapter:{id:string},block:{id?:string}}} unit @returns {string[]} */
export function ambientsOf(story,unit) {
  const art=story?.ambientArt;if(!art)return [];
  const context=/** @type {Unit} */(unit).backgroundContext;
  const blockId=context?.blockId??unit.block.id,chapterId=context?.chapterId??unit.chapter.id;
  return [blockId?art.blocks.get(blockId):undefined,art.chapters.get(chapterId)].filter(id=>id!==undefined);
}
