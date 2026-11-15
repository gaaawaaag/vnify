// Stage ranges: the director names who stands on stage for a stretch of one scene, where the speaking rule would put
// the wrong people up (a long passage about one character, someone present who never speaks, a busy room).
// Each record is {from,to,cast}: body units of one scene block in the chapter, and 0–3 characters from left to right.
// `join:true` adds the cast to whoever is standing instead of replacing them; `auto:true` marks a range the program
// added where the narration describes a character.

// @ts-check
/** @import {Story} from '../types/story.js' */
/** @import {DirectorRecord,Generation,StageRange,StageRecord} from '../types/director.js' */

export const STAGE_CAST_MAX=3;

/** @param {any} doc @param {Story} story @param {string} chapterId @param {Generation} generation @returns {{stages?:StageRecord[]}} */
export function validateStages(doc,story,chapterId,generation) {
  const stages=doc.stages??[];
  if(!Array.isArray(stages)||stages.length>512)throw new Error('stages 须为数组。');
  if(!generation.standing&&stages.length)throw new Error('人物立绘关闭时 stages 须为 []。');
  const positions=new Map(story.units.map((u,i)=>[u.id,i]));
  /** @type {[number,number][]} */
  const spans=[];
  const result=stages.map(s=>{
    if(!s||typeof s!=='object'||Array.isArray(s))throw new Error('镜头区间须为对象。');
    if(Object.keys(s).some(k=>!['from','to','cast','join','auto'].includes(k)))throw new Error('镜头区间只含 from、to、cast，以及可选的 join、auto。');
    if((s.join!==undefined&&s.join!==true)||(s.auto!==undefined&&s.auto!==true))throw new Error('镜头区间的 join、auto 只能为 true。');
    const start=positions.get(s.from),end=positions.get(s.to);
    if(start===undefined||end===undefined||end<start)throw new Error(`镜头区间的起止单元无效：${s.from}—${s.to}。`);
    const first=story.units[start],last=story.units[end];
    if(first.chapter.id!==chapterId)throw new Error(`镜头区间须在本章内：${s.from}。`);
    if(first.block.index!==last.block.index||first.block.kind!=='scene')throw new Error(`镜头区间须在同一个 scene 内：${s.from}—${s.to}。`);
    if(spans.some(([a,b])=>start<=b&&a<=end))throw new Error(`镜头区间重叠：${s.from}—${s.to}。`);
    spans.push([start,end]);
    if(!Array.isArray(s.cast)||s.cast.length>STAGE_CAST_MAX)throw new Error(`镜头区间的 cast 须为 0—${STAGE_CAST_MAX} 个人物 ID。`);
    for(const id of s.cast)if(story.entities.get(id)?.kind!=='character')throw new Error(`镜头区间的 cast 须为人物：${id}`);
    if(new Set(s.cast).size!==s.cast.length)throw new Error(`镜头区间的 cast 有重复：${s.from}。`);
    return {from:s.from,to:s.to,cast:[...s.cast],...(s.join?{join:true}:{}),...(s.auto?{auto:true}:{})};
  });
  return result.length?{stages:result}:{};
}

// Book-wide ranges as unit indexes, in reading order.
/** @param {Story} story @param {DirectorRecord[]} docs @returns {StageRange[]} */
export function compileStages(story,docs) {
  const positions=new Map(story.units.map((u,i)=>[u.id,i]));
  const at=(/** @type {string} */ id)=>/** @type {number} */(positions.get(id));
  return docs.flatMap(doc=>(doc.stages??[]).map(s=>({start:at(s.from),end:at(s.to),cast:s.cast,...(s.join?{join:true}:{}),...(s.auto?{auto:true}:{})}))).sort((a,b)=>a.start-b.start);
}

// The stage range covering a reading position, if any.
/** @param {Story|null|undefined} story @param {number} index @returns {StageRange|null} */
export const stageRangeAt=(story,index)=>story?.stageRanges?.find(r=>index>=r.start&&index<=r.end)??null;
