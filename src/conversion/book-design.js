import {renderPrompt} from '../prompts/library.js';
import {lookFields} from './looks.js';
import {validateArtStyles,sameArtStyles,requireArtStyles,characterCandidates} from '../core/director.js';
import {directorGeneration,titleCardEnabled,endCardEnabled} from '../core/director-generation.js';
import {validateTitleCard} from '../core/director.js';
import {checkBlurb} from '../core/blurb.js';
import {validateVariantDefinition,VARIANT_LIMITS,checkStature} from '../core/variants.js';
import {validateAmbientDefinition} from '../core/ambients.js';
import {coverRatio} from '../production/presets.js';
import {directorDensity,usedDensity,imageLimitText,fixedStylesOf,styleRequest,styleSchema,styleRules,canvasOf} from './director.js';

/* Whole-book design: one request after registration fixes the art styles, the
 * main characters' looks, the common locations' master images and recurring ambients. Chapter
 * directors receive it as existing designs and may then run concurrently.
 * It is production state only and never enters the reading copy. */

const text=(value,max=20000)=>typeof value==='string'&&!!value.trim()&&value.length<=max;

export function validateDesign(raw,entities,settings,fixedStyles=null) {
  let doc;try{doc=typeof raw==='string'?JSON.parse(raw):raw;}catch{throw new Error('全书设计不是有效 JSON。');}
  if(!doc||typeof doc!=='object'||Array.isArray(doc))throw new Error('全书设计顶层须为 JSON 对象。');
  const g=directorGeneration(settings),kinds=new Map(entities.map(e=>[e.id,e.kind]));
  // Sides the user fixed are the user's text; other sides fixed by earlier records may not be rewritten.
  const userFixed=fixedStylesOf(settings),written=doc.artStyles&&typeof doc.artStyles==='object'?doc.artStyles:{};
  let artStyles=fixedStyles;
  if(fixedStyles) {
    if(['background','character'].some(side=>!(side in userFixed)&&written[side]!==undefined&&written[side]!==fixedStyles[side]))
      throw new Error('画风已固定，全书设计不能改写。');
  } else {
    artStyles=validateArtStyles({background:userFixed.background??written.background??'',character:userFixed.character??written.character??''});
    requireArtStyles(g,artStyles);
  }
  if(!Array.isArray(doc.characters)||!Array.isArray(doc.backgrounds))throw new Error('全书设计须包含 characters 与 backgrounds 数组。');
  const people=new Set();
  const characters=g.standing?doc.characters.map(c=>{
    if(kinds.get(c?.characterId)!=='character'||people.has(c.characterId))throw new Error(`全书设计人物无效或重复：${c?.characterId}`);
    if(!text(c.face))throw new Error(`全书设计人物 ${c.characterId} 需要 face（头脸）。`);
    if(typeof c.body!=='string'||c.body.length>20000)throw new Error(`全书设计人物 ${c.characterId} 需要 body（身体、衣着与站姿），无额外细节时填写空字符串。`);
    if(c.main!==undefined&&typeof c.main!=='boolean')throw new Error(`全书设计人物 ${c.characterId} 的 main 须为布尔值。`);
    checkStature(c.stature);
    people.add(c.characterId);
    return {characterId:c.characterId,face:c.face.trim(),body:c.body.trim(),
      ...(c.main&&g.characterVariants?{main:true}:{}),...(c.stature!==undefined?{stature:c.stature}:{})};
  }):[];
  const places=new Set();
  const backgrounds=g.locationBackgrounds?doc.backgrounds.map(bg=>{
    if(!Array.isArray(bg?.locations)||!bg.locations.length||!text(bg.prompt))throw new Error('全书设计地点主图需要 locations 与 prompt。');
    for(const id of bg.locations) {
      if(kinds.get(id)!=='location'||places.has(id))throw new Error(`全书设计地点无效或重复：${id}`);
      places.add(id);
    }
    return {locations:[...bg.locations],prompt:bg.prompt.trim()};
  }):[];
  const ambients=designAmbients(doc.ambients,g);
  const variants=designVariants(doc.variants,kinds,g,characters);
  const result={artStyles,characters,backgrounds,...(ambients.length?{ambients}:{}),...(variants.length?{variants}:{})};
  const cover=titleCardEnabled(settings),ending=endCardEnabled(settings);
  // Everything the design registers is drawn once; together it must leave room within the book's image limit.
  const planned=(cover?1:0)+(ending?1:0)+new Set(backgrounds.map(b=>b.prompt)).size+characters.length+ambients.length+variants.length;
  if(settings.imageLimit&&planned>settings.imageLimit)throw new Error(`全书设计登记了 ${planned} 张图，超过全书上限 ${settings.imageLimit} 张。`);
  // A blurb, asked for when the text has none, is kept for the reading copy.
  const blurb=doc.blurb===undefined?'':checkBlurb(doc.blurb);
  // Voice portraits, asked for by the preset: the narrator, other characters and characters by ID.
  let voices=null;
  if(settings.voicePortraits&&doc.voices!==undefined) {
    if(!doc.voices||typeof doc.voices!=='object'||Array.isArray(doc.voices))throw new Error('全书设计的 voices 须为 {角色: 声音画像}。');
    voices={};
    for(const [role,portrait] of Object.entries(doc.voices)) {
      if(!['narrator','other'].includes(role)&&kinds.get(role)!=='character')throw new Error(`全书设计的声音画像人物无效：${role}`);
      if(typeof portrait!=='string'||portrait.length>1000)throw new Error(`全书设计 ${role} 的声音画像须为文字（最多 1000 字）。`);
      if(portrait.trim())voices[role]=portrait.trim();
    }
  }
  // The track list, asked for by the preset: each track's ID, name and English description for music generation.
  let music=null;
  if(settings.musicTracks&&doc.music!==undefined) {
    if(!Array.isArray(doc.music)||doc.music.length>16)throw new Error('全书设计的 music 须为数组，最多 16 首。');
    const ids=new Set();
    music=doc.music.map((/** @type {any} */ track)=>{
      if(!track||typeof track.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(track.id)||ids.has(track.id))throw new Error(`全书设计的曲目 ID 无效或重复：${track?.id}`);
      if(typeof track.name!=='string'||!track.name.trim()||track.name.length>200)throw new Error(`全书设计的曲目 ${track.id} 需要名称。`);
      if(typeof track.prompt!=='string'||!track.prompt.trim()||track.prompt.length>4000)throw new Error(`全书设计的曲目 ${track.id} 需要英文描述。`);
      ids.add(track.id);
      return {id:track.id,name:track.name.trim(),prompt:track.prompt.trim()};
    });
  }
  const designed={...result,...(blurb?{blurb}:{}),...(voices?{voices}:{}),...(music?{music}:{}),...(ending?{endCard:validateTitleCard(doc.endCard,'endCard')}:{})};
  if(!cover)return designed;
  return {...designed,titleCard:validateTitleCard(doc.titleCard)};
}

// Ambients the book returns to; a chapter that shows one brings its definition in.
function designAmbients(value,generation) {
  if(value===undefined||!generation.ambients)return [];
  if(!Array.isArray(value)||value.length>128)throw new Error('全书设计 ambients 须为数组，最多 128 条。');
  const ids=new Set();
  return value.map(raw=>{
    const ambient=validateAmbientDefinition(raw);
    if(ids.has(ambient.id))throw new Error(`全书设计氛围图 ID 重复：${ambient.id}`);
    ids.add(ambient.id);return ambient;
  });
}

// Foreseeable variants without ranges; chapters bring them in through their states.
function designVariants(value,kinds,generation,characters) {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>256)throw new Error('全书设计 variants 须为数组。');
  const main=new Set(characters.filter(c=>c.main).map(c=>c.characterId)),ids=new Set(),counts=new Map();
  return value.map(raw=>{
    const v=validateVariantDefinition(raw,kinds,generation);
    if(ids.has(v.id))throw new Error(`全书设计差分 ID 重复：${v.id}`);
    ids.add(v.id);
    const count=(counts.get(v.entityId)??0)+1,cap=kinds.get(v.entityId)==='location'?VARIANT_LIMITS.location
      :main.has(v.entityId)?VARIANT_LIMITS.main:VARIANT_LIMITS.other;
    counts.set(v.entityId,count);
    if(count>cap)throw new Error(`${v.entityId} 的差分超过上限 ${cap}。`);
    return v;
  });
}

// Design input from a converted script (agent CLI): names are the labels the story reveals,
// chapters count the chapters whose units speak, show or are set at the entity.
export function storyDesignEntities(story,visualProfiles=[]) {
  const profiles=new Map(visualProfiles.map(p=>[p.id,p])),names=new Map(),chapters=new Map();
  for(const u of story.units) {
    for(const [id,state] of u.revealed){if(!names.has(id))names.set(id,new Set());names.get(id).add(state.label);}
    for(const id of [u.speakerId,u.block.pov,u.block.loc,...u.runs.map(r=>r.characterId)].filter(id=>id&&id!=='none')) {
      if(!chapters.has(id))chapters.set(id,new Set());
      chapters.get(id).add(u.chapter.id);
    }
  }
  const entities=[...story.entities.values()].filter(e=>['character','location'].includes(e.kind)).map(e=>({id:e.id,kind:e.kind,label:e.label,
    names:[...(names.get(e.id)??[])].filter(label=>label!==e.label),...lookFields(profiles.get(e.id)),chapters:chapters.get(e.id)?.size??0}));
  return {chapterCount:story.chapters.length,entities};
}

/* designConflicts in a chapter draft: where this chapter's text plainly contradicts a look it was given (a designed or
 * earlier character, a location master). They are production notes for fixing the design and never enter the record. */
export function readDesignConflicts(value,story,chapterId) {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>64)throw new Error('designConflicts 须为数组，最多 64 条。');
  const units=new Set(story.units.filter(u=>u.chapter.id===chapterId).map(u=>u.id));
  return value.map(c=>{
    if(!['character','location'].includes(story.entities.get(c?.entityId)?.kind))throw new Error(`designConflicts 需要人物或地点 entityId：${c?.entityId}`);
    if(!units.has(c.unit))throw new Error(`designConflicts 的 unit 须为本章单元 ID：${c.unit}`);
    if(!text(c.note,500))throw new Error('designConflicts 需要不超过 500 字的 note，写原文的描写与设计的出入。');
    return {entityId:c.entityId,unit:c.unit,note:c.note.trim()};
  });
}

// How many tracks the list has at each music density.
/** @type {Record<string,string>} */
const MUSIC_TRACKS={few:'2 到 4 首：只覆盖全书最主要的几种气氛',medium:'4 到 8 首',rich:'6 到 12 首：主要人物、地点或反复出现的情境可以有各自的曲子'};

/* blurb: whether the text still lacks a blurb (none from the original book), so the design writes one. */
export function designPacket({book,entities,chapterCount,settings,fixedStyles,blurb=false}) {
  const g=directorGeneration(settings),density=directorDensity(settings.density);
  const part=(/** @type {string} */ id)=>renderPrompt(id,{},book.lang);
  const rules=[part('lang.output'),part('design.task'),styleRules(fixedStyles,settings)].filter(Boolean);
  if(g.standing)rules.push(part('director11.characters'));
  if(g.ambients||g.locationBackgrounds)rules.push(part('director11.background'));
  if(g.ambients)rules.push(part('design.ambients'));
  const cover=titleCardEnabled(settings),ending=endCardEnabled(settings);
  if(cover)rules.push(part('design.title-card'));
  if(ending)rules.push(part('design.end-card'));
  if(blurb)rules.push(part('design.blurb'));
  if(settings.voicePortraits)rules.push(part('design.voices'));
  if(settings.musicTracks)rules.push(part('design.music'));
  const variants=g.characterVariants||g.locationVariants;
  if(variants)rules.push(part('design.variants'));
  if(Object.keys(usedDensity(density,g)).length)rules.push(part('director11.density'));
  // The cover names its own canvas, which follows the book's orientation.
  const needs={characters:g.standing,ambients:g.ambients,locationBackgrounds:g.locationBackgrounds,titleCard:cover&&canvasOf(coverRatio(settings.ratio)),
    ...(ending?{endCard:canvasOf(coverRatio(settings.ratio))}:{}),
    characterVariants:g.characterVariants,locationVariants:g.locationVariants,density:usedDensity(density,g),...(blurb?{blurb:true}:{}),...(settings.voicePortraits?{voices:true}:{}),...(settings.musicTracks?{music:MUSIC_TRACKS[settings.musicDensity??'medium']}:{}),
    ...(g.ambients||g.locationBackgrounds?{canvas:canvasOf(settings.ratio??'16:9')}:{})};
  return rules.join('\n\n')+'\n\n---\n'+renderPrompt('design.request',{bookTitle:JSON.stringify(book.title),chapterCount,
    styles:JSON.stringify(fixedStyles),needs:JSON.stringify(needs),entities:JSON.stringify(entities)})
    +renderPrompt('design.output',{artStyles:fixedStyles?'':`"artStyles":${JSON.stringify(styleSchema(styleRequest(settings)))},`})
    +(g.ambients?'\n'+renderPrompt('design.output-ambients'):'')+(cover?'\n'+renderPrompt('design.output-title-card'):'')+(ending?'\n'+renderPrompt('design.output-end-card'):'')+(blurb?'\n'+renderPrompt('design.output-blurb'):'')
    +(settings.voicePortraits?'\n'+renderPrompt('design.output-voices'):'')+(settings.musicTracks?'\n'+renderPrompt('design.output-music'):'')+(variants?'\n'+renderPrompt('design.output-variants'):'')
    +(settings.imageLimit?'\n'+imageLimitText(settings,0):'');
}

/* Brings a chapter result in line with the design and with chapters saved before
 * it. Concurrent chapters cannot see each other, so the first design of a place
 * wins, a new cut-in whose ID is already taken becomes a reuse, design ambients and variants are defined where first
 * used, and designed characters that appear
 * in this chapter for the first time are added with the design's look. */
export function alignDirector(doc,previous,design,story,chapterId) {
  const result=structuredClone(doc);
  const masters=new Map((design?.backgrounds??[]).flatMap(bg=>bg.locations.map(id=>[id,bg.prompt])));
  for(const d of previous)for(const bg of d.backgrounds??[])for(const id of bg.locations)if(!masters.has(id))masters.set(id,bg.prompt);
  for(const bg of Array.isArray(result.backgrounds)?result.backgrounds:[]) {
    const known=[...new Set((bg?.locations??[]).filter(id=>masters.has(id)).map(id=>masters.get(id)))];
    if(known.length===1)bg.prompt=known[0];
  }
  // Cut-in IDs describe the object, so a concurrent chapter defining a taken ID reuses that image.
  const taken=new Set(previous.flatMap(d=>(d.cutIns??[]).map(c=>c.id)));
  if(Array.isArray(result.cutIns))result.cutIns=result.cutIns.filter(cut=>!cut||!taken.has(cut.id));
  // Ambients: an earlier definition wins; a design ambient shown here for the first time is brought in.
  if(Array.isArray(result.ambients)) {
    const defined=new Set(previous.flatMap(d=>(d.ambients??[]).map(a=>a.id))),designed=new Map((design?.ambients??[]).map(a=>[a.id,a]));
    result.ambients=result.ambients.filter(a=>!a||!defined.has(a.id)).map(a=>designed.get(a?.id)??a);
    const present=new Set(result.ambients.map(a=>a?.id));
    const shown=[result.ambient,...(Array.isArray(result.ambientBlocks)?result.ambientBlocks.map(entry=>entry?.ambient):[])];
    for(const id of shown)if(designed.has(id)&&!defined.has(id)&&!present.has(id)){result.ambients.push(designed.get(id));present.add(id);}
  }
  // Variants: an earlier definition wins; a design variant used here for the first time is brought in.
  if(Array.isArray(result.variants)&&Array.isArray(result.states)) {
    const defined=new Set(previous.flatMap(d=>(d.variants??[]).map(v=>v.id))),designed=new Map((design?.variants??[]).map(v=>[v.id,v]));
    result.variants=result.variants.filter(v=>!v||!defined.has(v.id)).map(v=>designed.get(v?.id)??v);
    const present=new Set(result.variants.map(v=>v?.id));
    for(const s of result.states)if(designed.has(s?.variant)&&!defined.has(s.variant)&&!present.has(s.variant)) {
      result.variants.push(designed.get(s.variant));present.add(s.variant);
    }
  }
  if(design&&Array.isArray(result.characters)) {
    const designed=new Set([...previous.flatMap(d=>d.characters.map(c=>c.characterId)),...result.characters.map(c=>c?.characterId)]);
    const end=story.units.findLastIndex(u=>u.chapter.id===chapterId),candidates=characterCandidates(story,end);
    const present=new Set(story.units.filter(u=>u.chapter.id===chapterId).flatMap(u=>[u.speakerId,u.block.pov,...u.runs.map(r=>r.characterId)]));
    for(const c of design.characters)if(!designed.has(c.characterId)&&candidates.has(c.characterId)&&present.has(c.characterId))
      result.characters.push({characterId:c.characterId,face:c.face,body:c.body,
        ...(c.stature!==undefined?{stature:c.stature}:{})});
  }
  return result;
}
