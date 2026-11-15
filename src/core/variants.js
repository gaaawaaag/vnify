// Variants: another complete look of a character or location, used by Director state records.
// Definitions enter the chapter record of first use; states point at body units of that chapter.
// A state without `to` lasts until the entity's next such state, across chapters;
// a state with `to` covers that range of its chapter and then gives way to the lasting state.
// A state carries `variant` (which look), `present` (whether a character stands on stage) or both;
// each field forms its own timeline, so a presence-only record never changes the look and vice versa.

// @ts-check
/** @import {Story,Unit,EntityKind} from '../types/story.js' */
/** @import {DirectorRecord,Generation,StateRecord,Timeline,VariantArt,VariantDefinition,VariantLimits} from '../types/director.js' */

export const VARIANT_LIMITS=Object.freeze({main:4,other:1,location:2});
// Without registration limits (reading a finished work) only sanity caps apply.
const SANITY={perEntity:16,perChapter:128};
const ID=/^[\w.-]{1,160}$/;

const text=(/** @type {unknown} */ value,/** @type {number} */ max)=>typeof value==='string'&&!!value.trim()&&value.length<=max;
export const unitLocation=(/** @type {Unit} */ unit)=>unit.backgroundContext?.loc??unit.block.loc;

/* stature: how tall a character stands on stage against an ordinary adult (1). Children and notably short or tall
 * people get one on their design or on the variant that shows them at another age; a variant without it keeps the design's. */
export const STATURE_RANGE=[0.7,1.1];
/** @param {unknown} value */
export function checkStature(value) {
  if(value!==undefined&&(typeof value!=='number'||!(value>=STATURE_RANGE[0]&&value<=STATURE_RANGE[1])))
    throw new Error(`stature 须为 ${STATURE_RANGE[0]}–${STATURE_RANGE[1]} 的数字（普通成人为 1）。`);
}
// One definition: characters override face and/or body, locations give a full prompt.
/** @param {any} v @param {Map<string,EntityKind>} kinds @param {Generation} generation @returns {VariantDefinition} */
export function validateVariantDefinition(v,kinds,generation) {
  if(!v||typeof v!=='object'||Array.isArray(v)||typeof v.id!=='string'||!ID.test(v.id))throw new Error('差分 id 须为全书唯一稳定 ID。');
  const kind=kinds.get(v.entityId);
  if(kind!=='character'&&kind!=='location')throw new Error(`差分 ${v.id} 的 entityId 须为人物或地点：${v.entityId}`);
  if(kind==='character'&&!generation.characterVariants)throw new Error('人物差分关闭时不能定义人物差分。');
  if(kind==='location'&&!generation.locationVariants)throw new Error('地点差分关闭时不能定义地点差分。');
  if(!text(v.name,60))throw new Error(`差分 ${v.id} 需要简短 name（最多 60 字）。`);
  if(!text(v.reason,2000))throw new Error(`差分 ${v.id} 需要 reason。`);
  const base={id:v.id,entityId:v.entityId,name:v.name.trim(),reason:v.reason.trim()};
  if(kind==='location') {
    if(v.face!==undefined||v.body!==undefined||!text(v.prompt,20000))throw new Error(`地点差分 ${v.id} 只写完整 prompt。`);
    return {...base,prompt:v.prompt.trim()};
  }
  if(v.prompt!==undefined)throw new Error(`人物差分 ${v.id} 写 face／body，不写 prompt。`);
  const fields=['face','body'].filter(key=>v[key]!==undefined);
  if(fields.some(key=>!text(v[key],20000))||!fields.length)throw new Error(`人物差分 ${v.id} 需要非空 face 或 body。`);
  checkStature(v.stature);
  return {...base,...Object.fromEntries(fields.map(key=>[key,v[key].trim()])),...(v.stature!==undefined?{stature:v.stature}:{})};
}

/* limits (registration only): {main:Set, designIds:Set}.
 * Per-entity counts include earlier chapters; local definitions (not from the book design) carry the chapter prefix. */
/**
 * @param {{variants?:unknown,states?:unknown}} doc @param {Story} story @param {string} chapterId @param {DirectorRecord[]} previous
 * @param {Generation} generation @param {VariantLimits|null} [limits] @returns {{variants:VariantDefinition[],states:StateRecord[]}}
 */
export function validateVariants(doc,story,chapterId,previous=[],generation,limits=null) {
  const definitions=doc.variants??[],states=doc.states??[];
  if(!Array.isArray(definitions)||!Array.isArray(states)||definitions.length>SANITY.perChapter||states.length>1024)throw new Error('variants 与 states 须为数组。');
  const enabled=generation.characterVariants||generation.locationVariants;
  if(!enabled&&definitions.length)throw new Error('差分关闭时 variants 须为 []。');
  if(!enabled&&!generation.standing&&states.length)throw new Error('差分与人物立绘都关闭时 states 须为 []。');
  if(enabled&&(!Array.isArray(doc.variants)||!Array.isArray(doc.states)))throw new Error('差分开启时须提供 variants 与 states 数组。');
  const kinds=new Map([...story.entities.values()].map(e=>[e.id,e.kind]));
  const known=new Map(previous.flatMap(d=>(d.variants??[]).map(v=>[v.id,v]))),fresh=new Set(),counts=new Map();
  for(const v of known.values())counts.set(v.entityId,(counts.get(v.entityId)??0)+1);
  const variants=definitions.map(raw=>{
    const v=validateVariantDefinition(raw,kinds,generation);
    if(known.has(v.id))throw new Error(`差分 ${v.id} 已定义；复用只写 states。`);
    known.set(v.id,v);fresh.add(v.id);
    const count=(counts.get(v.entityId)??0)+1;counts.set(v.entityId,count);
    const cap=!limits?SANITY.perEntity:kinds.get(v.entityId)==='location'?VARIANT_LIMITS.location
      :limits.main.has(v.entityId)?VARIANT_LIMITS.main:VARIANT_LIMITS.other;
    if(count>cap)throw new Error(`${v.entityId} 的差分超过上限 ${cap}。`);
    if(limits&&!limits.designIds.has(v.id)) {
      if(!v.id.startsWith(`${chapterId}.`))throw new Error(`章节新增的差分 ID 须以 ${chapterId}. 开头：${v.id}`);
    }
    return v;
  });
  // Overlap and lasting-start checks run per entity and per field: `variant` and `present` are separate timelines.
  const positions=new Map(story.units.map((u,i)=>[u.id,i])),used=new Set();
  /** @type {Map<string,[number,number][]>} */
  const ranged=new Map();
  /** @type {Map<string,Set<number>>} */
  const lasting=new Map();
  const result=states.map(s=>{
    if(!s||typeof s!=='object'||Array.isArray(s))throw new Error('状态记录须为对象。');
    if(Object.keys(s).some(k=>!['entityId','from','to','variant','present'].includes(k)))throw new Error('状态记录只含 entityId、from、to、variant、present。');
    const kind=kinds.get(s.entityId),fields=['variant','present'].filter(k=>Object.hasOwn(s,k));
    if(kind!=='character'&&kind!=='location')throw new Error(`状态记录的 entityId 须为人物或地点：${s.entityId}`);
    if(!fields.length)throw new Error(`${s.entityId} 的状态记录需要 variant 或 present。`);
    if(Object.hasOwn(s,'variant')) {
      if(kind==='character'?!generation.characterVariants:!generation.locationVariants)throw new Error(`${s.entityId} 所属类型的差分已关闭。`);
      if(s.variant!==null&&(known.get(s.variant)?.entityId!==s.entityId))throw new Error(`状态记录引用的差分不存在或不属于 ${s.entityId}：${s.variant}`);
    }
    if(Object.hasOwn(s,'present')) {
      if(kind!=='character')throw new Error(`present 只用于人物：${s.entityId}`);
      if(!generation.standing)throw new Error('人物立绘关闭时状态记录不写 present。');
      if(typeof s.present!=='boolean')throw new Error(`${s.entityId} 的 present 须为 true 或 false。`);
    }
    const start=positions.get(s.from),end=s.to===undefined?start:positions.get(s.to);
    if(start===undefined||end===undefined||end<start||story.units.slice(start,end+1).some(u=>u.chapter.id!==chapterId)) {
      throw new Error('状态记录的起止单元须属于本章，且顺序有效。');
    }
    if(kind==='location'&&[start,end].some(i=>unitLocation(story.units[i])!==s.entityId))throw new Error(`地点状态的起止单元须位于 ${s.entityId}。`);
    for(const field of fields) {
      const key=`${s.entityId}\n${field}`;
      if(s.to!==undefined) {
        const spans=ranged.get(key)??[];
        if(spans.some(([a,b])=>start<=b&&a<=end))throw new Error(`${s.entityId} 的区间状态（${field}）在本章重叠。`);
        spans.push([start,end]);ranged.set(key,spans);
      } else {
        const starts=lasting.get(key)??new Set();
        if(starts.has(start))throw new Error(`${s.entityId} 在同一单元有两条持续状态（${field}）。`);
        starts.add(start);lasting.set(key,starts);
      }
    }
    if(s.variant)used.add(s.variant);
    return {entityId:s.entityId,from:s.from,...(s.to!==undefined?{to:s.to}:{}),...Object.fromEntries(fields.map(k=>[k,s[k]]))};
  });
  for(const [key,starts] of lasting)for(const start of starts) {
    if((ranged.get(key)??[]).some(([a,b])=>start>=a&&start<=b))throw new Error(`${key.split('\n')[0]} 的持续状态不能从区间状态内部开始。`);
  }
  if([...fresh].some(id=>!used.has(id)))throw new Error('新增差分须在本章的状态记录中使用。');
  return {variants,states:result};
}

// Book-wide index after every chapter record passed: definitions, per-entity timelines and first use.
/** @param {Story} story @param {DirectorRecord[]} docs @returns {VariantArt} */
export function compileVariants(story,docs) {
  const positions=new Map(story.units.map((u,i)=>[u.id,i]));
  /** @type {VariantArt} */
  const art={definitions:new Map(),timelines:new Map(),presence:new Map(),firstUse:new Map(),statures:new Map()};
  const {definitions,timelines,presence,firstUse,statures}=art;
  // Records passed validation, so every range end names a unit.
  const at=(/** @type {string} */ id)=>/** @type {number} */(positions.get(id));
  /** @type {<T>(lines:Map<string,Timeline<T>>,s:StateRecord,value:T)=>void} */
  const add=(lines,s,value)=>{
    const start=at(s.from),end=s.to===undefined?null:at(s.to);
    if(!lines.has(s.entityId))lines.set(s.entityId,{lasting:[],ranged:[]});
    const line=/** @type {Timeline<any>} */(lines.get(s.entityId));
    if(end===null)line.lasting.push({start,value});else line.ranged.push({start,end,value});
  };
  for(const doc of docs) {
    for(const v of doc.variants??[])definitions.set(v.id,{...v,chapterId:doc.chapterId});
    for(const c of doc.characters??[])if(c.stature!==undefined)statures.set(c.characterId,c.stature);
    for(const s of doc.states??[]) {
      if(Object.hasOwn(s,'variant'))add(timelines,s,s.variant);
      if(Object.hasOwn(s,'present'))add(presence,s,s.present);
      const start=at(s.from),first=s.variant?firstUse.get(s.variant):undefined;
      if(s.variant&&!(first!==undefined&&first<=start))firstUse.set(s.variant,start);
    }
  }
  for(const line of [...timelines.values(),...presence.values()]){line.lasting.sort((a,b)=>a.start-b.start);line.ranged.sort((a,b)=>a.start-b.start);}
  return art;
}
// The stature a character shows in a look: the variant's, else the design's, else an ordinary adult's.
/** @param {Story|null|undefined} story @param {string} characterId @param {string|null} [variantId] @returns {number} */
export function statureOf(story,characterId,variantId=null) {
  const art=story?.variantArt,variant=variantId?art?.definitions.get(variantId):null;
  return variant?.stature??art?.statures.get(characterId)??1;
}

// The entity's variant ID at a reading position, or null for its default look.
/** @template T @param {Timeline<T>|undefined} line @param {number} index @returns {T|null} */
function timelineAt(line,index) {
  if(!line)return null;
  const range=line.ranged.find(r=>index>=r.start&&index<=r.end);
  if(range)return range.value;
  /** @type {T|null} */
  let current=null;
  for(const state of line.lasting){if(state.start>index)break;current=state.value;}
  return current;
}
/** @type {(story:Story|null|undefined,entityId:string,index:number)=>string|null} */
export const variantAt=(story,entityId,index)=>timelineAt(story?.variantArt?.timelines.get(entityId),index);

/* The director's word on whether a character stands on stage: true inside a `present:true` range,
 * false inside a `present:false` range or after a lasting `present:false`; null leaves it to the speaking rule
 * (a lasting `present:true` hands the character back to that rule). */
/** @param {Story|null|undefined} story @param {string} entityId @param {number} index @returns {boolean|null} */
export function presenceAt(story,entityId,index) {
  const line=story?.variantArt?.presence.get(entityId);
  const range=line?.ranged.find(r=>index>=r.start&&index<=r.end);
  if(range)return range.value;
  return timelineAt(line&&{ranged:[],lasting:line.lasting},index)===false?false:null;
}
// Characters the director placed or removed somewhere in the book.
export const presenceIds=(/** @type {Story|null|undefined} */ story)=>[...(story?.variantArt?.presence.keys()??[])];

// Variants a reader at this position has already met; later ones and their prompts stay hidden.
/** @param {Story|null|undefined} story @param {number} index @param {string|null} [entityId] */
export function reachedVariants(story,index,entityId=null) {
  const art=story?.variantArt;
  if(!art)return [];
  return [...art.definitions.values()].filter(v=>(!entityId||v.entityId===entityId)&&(art.firstUse.get(v.id)??Infinity)<=index);
}
