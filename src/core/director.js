// @ts-check
/** @import {Story} from '../types/story.js' */
/** @import {ArtStyles,DirectorBackground,DirectorCharacter,DirectorRecord,Generation,TitleCard} from '../types/director.js' */
import {validateCutIns,compileCutIns} from './cut-ins.js';
import {validateAmbients,compileAmbients} from './ambients.js';
import {validateCgs,compileCgs} from './cgs.js';
import {validateVariants,compileVariants,checkStature} from './variants.js';
import {validateStages,compileStages} from './stages.js';
import {scriptLines} from './script-text.js';
import {validateDirectorGeneration} from './director-generation.js';
import {composeImagePrompt} from './image-prompts.js';

export const DIRECTOR_VERSION=13;

/**
 * @param {DirectorRecord} doc @param {string} prompt @param {string} [purpose] @param {string} [color]
 * @param {'transparent'|'cutout'} [mode] @returns {string}
 */
export function directorImagePrompt(doc,prompt,purpose='background',color,mode) {
  return composeImagePrompt(doc,prompt,purpose,color,mode);
}

// POV can be useful to the director before the reader is allowed to see its name.
/** @param {Story} story @param {number} end @returns {Map<string,{label:string}>} */
export function characterCandidates(story,end) {
  const known=new Map(story.units[end]?.revealed||[]);
  /** @type {Map<string,{label:string}>} */
  const candidates=new Map([...known].filter(([id])=>story.entities.get(id)?.kind==='character'));
  for(const unit of story.units.slice(0,end+1)) {
    const id=unit.block.pov,entity=story.entities.get(id);
    if(entity?.kind==='character'&&!candidates.has(id))candidates.set(id,{label:entity.label});
  }
  return candidates;
}

/** @param {any} value @returns {ArtStyles} */
export function validateArtStyles(value) {
  const invalid=!value||typeof value!=='object'||Array.isArray(value)
    ||['background','character'].some(key=>typeof value[key]!=='string'||value[key].length>4000);
  if(invalid)throw new Error('画风需要 background 与 character 文本（各最多 4000 字）。');
  // User styles are prompt text, including intentional whitespace and language.
  return {background:value.background,character:value.character};
}
export const sameArtStyles=(/** @type {ArtStyles} */ a,/** @type {ArtStyles} */ b)=>a.background===b.background&&a.character===b.character;
// Background style serves environments and cut-ins; character style serves people and CG.
/** @param {Generation} generation @param {ArtStyles} styles */
export function requireArtStyles(generation,styles) {
  const g=generation;
  if((g.ambients||g.locationBackgrounds||g.cutIns)&&!styles.background.trim())throw new Error('请填写背景画风。');
  if((g.standing||g.cgs)&&!styles.character.trim())throw new Error('请填写人物画风（CG 也使用此画风）。');
}

/* The book's styles: once fixed (by the user, the design or an earlier chapter) they stay; the director may repeat
 * them but not change a side it wrote. A side the user fixed is the user's text whatever the director wrote. */
/** @param {any} doc @param {Generation} generation @param {DirectorRecord[]} previous @param {any} context */
function directorArtStyles(doc,generation,previous,context) {
  const previousStyles=previous[0]?.artStyles;
  if(context?.artStyles&&previousStyles&&!sameArtStyles(validateArtStyles(context.artStyles),previousStyles)) {
    throw new Error('Director 已固定背景／人物画风，不接受改写。');
  }
  const userFixed=context?.fixedStyles??{},locked=context?.artStyles??previousStyles;
  const written=doc.artStyles&&typeof doc.artStyles==='object'&&!Array.isArray(doc.artStyles)?doc.artStyles:{};
  if(locked) {
    const artStyles=validateArtStyles(locked);
    requireArtStyles(generation,artStyles);
    if(['background','character'].some(side=>!(side in userFixed)&&written[side]!==undefined&&written[side]!==artStyles[side]))
      throw new Error('Director 已固定画风，不接受改写。');
    return artStyles;
  }
  const artStyles=validateArtStyles({background:userFixed.background??written.background??'',character:userFixed.character??written.character??''});
  requireArtStyles(generation,artStyles);
  return artStyles;
}

// A location keeps its first master design for the whole book; only new designs make new images.
/** @param {DirectorBackground[]} backgrounds @param {DirectorRecord[]} previous */
function newBackgroundImages(backgrounds,previous) {
  const bases=new Map(previous.flatMap(d=>d.backgrounds.flatMap(b=>b.locations.map(id=>[id,b.prompt]))));
  const prompts=new Set(bases.values());
  let count=0;
  for(const bg of backgrounds) {
    const fresh=bg.locations.some(id=>!bases.has(id));
    for(const id of bg.locations) {
      if(bases.has(id)&&bases.get(id)!==bg.prompt)throw new Error(`地点主图 ${id} 已有设计，须沿用；修订请明确更新原定义。`);
      bases.set(id,bg.prompt);
    }
    if(fresh&&!prompts.has(bg.prompt)){count++;prompts.add(bg.prompt);}
  }
  return count;
}

/* Images the records make, in chapter order: each new location master, ambient, CG, Cut-in and variant once, one
 * standing portrait per character; reserved counts images made outside the records (the cover). */
/** @param {DirectorRecord[]} docs @param {number} [reserved] */
export function bookImageCount(docs,reserved=0) {
  const people=new Set();let count=reserved;
  for(const [i,doc] of docs.entries()) {
    count+=newBackgroundImages(doc.backgrounds,docs.slice(0,i))+doc.ambients.length+doc.cgs.length+doc.cutIns.length+doc.variants.length;
    for(const c of doc.characters)people.add(c.characterId);
  }
  return count+people.size;
}

/** @param {any} doc @param {Story} story @param {string} chapterId @param {Generation} generation @returns {DirectorBackground[]} */
function validateBackgrounds(doc,story,chapterId,generation) {
  if(!Array.isArray(doc.backgrounds)||doc.backgrounds.length>128)throw new Error('Director backgrounds 须为数组，最多 128 条。');
  if(!Array.isArray(doc.omittedBlocks))throw new Error('Director omittedBlocks 须为数组；无省略块时使用 []。');
  if(!generation.locationBackgrounds&&(doc.backgrounds.length||doc.omittedBlocks.length)) {
    throw new Error('地点背景关闭时 backgrounds 与 omittedBlocks 须为 []。');
  }
  const blocks=story.blocks.filter(b=>b.chapterId===chapterId),byId=new Map(blocks.map(b=>[b.id,b]));
  const seen=new Set(),locations=new Set();
  const take=id=>{
    if(!byId.has(id)||seen.has(id))throw new Error(`Director 场景不属于本章或重复：${id}`);
    seen.add(id);
    return byId.get(id);
  };
  const backgrounds=doc.backgrounds.map(bg=>{
    const invalid=!bg||!Array.isArray(bg.locations)||!bg.locations.length||!Array.isArray(bg.blocks)||!bg.blocks.length
      ||typeof bg.prompt!=='string'||!bg.prompt.trim()||bg.prompt.length>20000;
    if(invalid)throw new Error('Director 背景提示词或关联无效。');
    for(const id of bg.locations) {
      if(locations.has(id)||!blocks.some(b=>b.loc===id))throw new Error(`Director 地点无效或重复：${id}`);
      locations.add(id);
    }
    const selected=bg.blocks.map(take);
    const mismatch=selected.some(b=>!b.loc||!bg.locations.includes(b.loc))||bg.locations.some(id=>!selected.some(b=>b.loc===id));
    if(mismatch)throw new Error('Director 地点与场景不匹配。');
    return {locations:[...bg.locations],blocks:[...bg.blocks],prompt:bg.prompt.trim()};
  });
  doc.omittedBlocks.forEach(take);
  if(generation.locationBackgrounds&&seen.size!==blocks.length)throw new Error('Director 未整理全部场景；省略的场景也须列入 omittedBlocks。');
  return backgrounds;
}

/** @param {any} doc @param {Story} story @param {string} chapterId @param {Generation} generation @returns {DirectorCharacter[]} */
function validateCharacters(doc,story,chapterId,generation) {
  if(!Array.isArray(doc.characters)||doc.characters.length>128)throw new Error('Director characters 须为数组，最多 128 人。');
  if(!generation.standing&&doc.characters.length)throw new Error('人物立绘关闭时 characters 须为 []。');
  const end=story.units.findLastIndex(u=>u.chapter.id===chapterId),candidates=characterCandidates(story,end);
  const people=new Set();
  // evidence／assumptions from older records are dropped: nothing reads them.
  return doc.characters.map(c=>{
    if(!c||typeof c.face!=='string'||!c.face.trim()||c.face.length>20000)throw new Error('人物需要非空 face（头脸）。');
    if(typeof c.body!=='string'||c.body.length>20000)throw new Error('人物需要 body（身体、衣着与站姿）；无额外细节时填写空字符串。');
    checkStature(c.stature);
    if(!candidates.has(c.characterId)||people.has(c.characterId))throw new Error('Director 人物无效、尚未在本章及前文出现或重复。');
    people.add(c.characterId);
    return {
      characterId:c.characterId,face:c.face.trim(),body:c.body.trim(),
      ...(c.stature!==undefined?{stature:c.stature}:{}),
    };
  });
}

/**
 * context: project settings in force while registering (generation, fixed art styles, variant limits, the book's
 * image limit with the images reserved outside the records).
 * @param {string|object} text @param {Story} story @param {string} chapterId
 * @param {DirectorRecord[]} [previous] @param {any} [context] @returns {DirectorRecord}
 */
export function validateDirector(text,story,chapterId,previous=[],context=null) {
  const doc=typeof text==='string'?JSON.parse(text):text;
  if(!doc||typeof doc!=='object'||Array.isArray(doc))throw new Error('Director 顶层须为 JSON 对象。');
  if(doc.version!==DIRECTOR_VERSION)throw new Error(`Director version 须为 ${DIRECTOR_VERSION}：收到 ${JSON.stringify(doc.version)??'缺失'}。`);
  if(doc.chapterId!==chapterId)throw new Error(`Director 章节不匹配：收到 ${JSON.stringify(doc.chapterId)??'缺失'}，本次应为 ${JSON.stringify(chapterId)}。`);
  if(!story.chapters.some(c=>c.id===chapterId))throw new Error(`Director 目标章节不存在于已验收正文：${chapterId}。`);
  const generation=validateDirectorGeneration(context?.generation??doc.generation);
  if(doc.generation&&context?.generation&&Object.keys(generation).some(key=>doc.generation[key]!==generation[key])) {
    throw new Error('Director 制作用途与项目设置不一致。');
  }
  if(doc.artStyle!==undefined||doc.avatars!==undefined||doc.busts!==undefined)throw new Error('Director 使用 artStyles 与 characters。');
  const artStyles=directorArtStyles(doc,generation,previous,context);
  const backgrounds=validateBackgrounds(doc,story,chapterId,generation);
  const cgs=validateCgs(doc.cgs,story,chapterId);
  if(!generation.cgs&&cgs.length)throw new Error('CG 关闭时 cgs 须为 []。');
  newBackgroundImages(backgrounds,previous);
  const result=/** @type {DirectorRecord} */({version:DIRECTOR_VERSION,chapterId,backgrounds,omittedBlocks:[...doc.omittedBlocks],cgs,generation,artStyles});
  if(doc.chapterBackground!==undefined)throw new Error('Director 使用 ambients 与 ambient，不写 chapterBackground。');
  Object.assign(result,validateAmbients(doc,story,chapterId,previous,generation));
  const hasCutIns=(doc.cutIns?.length??0)||(doc.cutInUses?.length??0);
  if(!generation.cutIns&&hasCutIns)throw new Error('Cut-in 关闭时 cutIns 与 cutInUses 须为 []。');
  if(generation.cutIns&&(!Array.isArray(doc.cutIns)||!Array.isArray(doc.cutInUses)))throw new Error('Cut-in 开启时须提供 cutIns 与 cutInUses 数组。');
  Object.assign(result,validateCutIns(doc,story,chapterId,previous));
  result.characters=validateCharacters(doc,story,chapterId,generation);
  Object.assign(result,validateVariants(doc,story,chapterId,previous,generation,context?.variantLimits??null));
  Object.assign(result,validateStages(doc,story,chapterId,generation));
  if(context?.imageLimit) {
    const total=bookImageCount([...previous,result],context.reservedImages??0);
    if(total>context.imageLimit)throw new Error(`全书图片将达到 ${total} 张，超过上限 ${context.imageLimit} 张；请复用已有图片或减少新图。`);
  }
  return result;
}

/** @param {string} raw @param {DirectorRecord[]} docs @param {TitleCard|null} [titleCard] */
export function embedDirectors(raw,docs,titleCard=null) {
  const cover=titleCard?`\n// @vn-title-card ${JSON.stringify({prompt:titleCard.prompt})}`:'';
  return raw+cover+docs.map(doc=>`\n// @vn-director ${JSON.stringify(doc)}`).join('');
}
/** @param {any} value @returns {TitleCard} */
export function validateTitleCard(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>k!=='prompt'))throw new Error('titleCard 须为 {prompt}。');
  if(typeof value.prompt!=='string'||!value.prompt.trim()||value.prompt.length>20000)throw new Error('titleCard 需要一条有效的英文画面描述。');
  return {prompt:value.prompt.trim()};
}
// After all records pass, attach the derived ambient, CG, cut-in, variant and stage indexes to this parsed story.
// The optional title card record carries the whole-book design's cover prompt.
/** @param {string} raw @param {Story} story @returns {DirectorRecord[]} */
export function readDirectors(raw,story) {
  const docs=[],seen=new Set();
  /** @type {ArtStyles|null} */
  let artStyles=null;
  story.titleCard=null;
  for(const {text:line,literal} of scriptLines(raw))if(!literal&&line.startsWith('// @vn-title-card ')) {
    if(story.titleCard)throw new Error('作品封面记录重复。');
    story.titleCard=validateTitleCard(JSON.parse(line.slice(18)));
  } else if(!literal&&line.startsWith('// @vn-director ')) {
    const value=JSON.parse(line.slice(16));
    const doc=validateDirector(value,story,value.chapterId,docs);
    if(artStyles&&!sameArtStyles(artStyles,doc.artStyles))throw new Error('Director 各章背景／人物画风不一致。');
    artStyles=doc.artStyles;
    if(seen.has(doc.chapterId))throw new Error('Director 章节重复。');
    seen.add(doc.chapterId);docs.push(doc);
  }
  story.ambientArt=compileAmbients(docs);
  story.cutInArt=compileCutIns(story,docs);
  story.cgs=compileCgs(story,docs);
  story.variantArt=compileVariants(story,docs);
  story.stageRanges=compileStages(story,docs);
  return docs;
}
