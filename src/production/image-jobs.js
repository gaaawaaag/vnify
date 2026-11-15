// @ts-check
/** @import {Chapter,Story} from '../types/story.js' */
/** @import {Cg,DirectorRecord,Generation,VariantDefinition} from '../types/director.js' */
/** @import {AvatarCrop,BackgroundScope,Backgrounds,CharacterImages,Flip,StoredImage} from '../types/assets.js' */
/** @import {BackgroundTask,BindTarget,DirectorSettings,ImageTask,Reference,TransparencyMethod} from '../types/production.js' */
/** @import {Unit} from '../types/story.js' */
/** @typedef {{backgrounds:Backgrounds,characterImages:CharacterImages}} Assets */
/** @typedef {DirectorSettings&{transparencyMethod?:TransparencyMethod}} JobSettings */
// Plans missing images from Director records and binds finished images into asset manifests.
import {portraitRegistry} from '../core/portrait-prompts.js';
import {composeImagePrompt,referencePrompt,variantEditPrompt,castPrompt} from '../core/image-prompts.js';
import {defaultColor} from '../core/colors.js';
import {pruneBackgrounds,validateBackgrounds} from '../reader/backgrounds.js';
import {bindCharacterPortrait} from '../reader/character-images.js';
import {directorImagePrompt} from '../core/director.js';
import {directorGeneration,titleCardEnabled} from '../core/director-generation.js';
import {coverRatio} from './presets.js';

// A shared master design can bind an already made image to another compatible
// location. Keep explicit/manual bindings; only fill missing targets.
/** @param {Backgrounds} data @param {Story} story @param {DirectorRecord[]} directors @returns {Backgrounds} */
export function reuseBackgroundMasters(data,story,directors) {
  const byPrompt=new Map();
  for(const doc of directors)for(const bg of doc.backgrounds)for(const location of bg.locations){
    const id=data.bindings.locations[location];
    const prompt=directorImagePrompt(doc,bg.prompt);
    if(id&&data.images[id]&&!byPrompt.has(prompt))byPrompt.set(prompt,id);
  }
  const next=structuredClone(data);
  for(const doc of directors)for(const bg of doc.backgrounds){
    const id=byPrompt.get(directorImagePrompt(doc,bg.prompt));
    if(!id)continue;
    for(const location of bg.locations) {
      if(Object.hasOwn(next.bindings.locations,location)&&next.bindings.locations[location]!==null)continue;
      Object.defineProperty(next.bindings.locations,location,{value:id,enumerable:true,writable:true,configurable:true});
    }
  }
  return validateBackgrounds(pruneBackgrounds(next),story);
}

/**
 * @param {Chapter} chapter @param {DirectorRecord[]} docs @param {Generation} selected @param {Assets} assets @param {Set<string>} claimed
 * @returns {ImageTask[]}
 */
function backgroundTasks(chapter,docs,selected,assets,claimed) {
  /** @type {Map<string,BackgroundTask>} */
  const groups=new Map();
  for(const doc of docs) {
    /** @type {{prompt:string,scope:BackgroundScope,ids:string[]}[]} */
    const entries=[
      // An ambient is drawn in the chapter that defines it; later chapters reuse the image.
      ...(selected.ambients
        ?doc.ambients.map(a=>({prompt:directorImagePrompt(doc,a.prompt,'ambient'),scope:/** @type {const} */('ambients'),ids:[a.id]})):[]),
      ...(selected.locationBackgrounds
        ?doc.backgrounds.map(b=>({prompt:directorImagePrompt(doc,b.prompt),scope:/** @type {const} */('locations'),ids:b.locations})):[]),
    ];
    for(const entry of entries) {
      const refs=entry.ids.filter(id=>!assets.backgrounds.bindings[entry.scope][id]&&!claimed.has(`${entry.scope}:${id}`))
        .map(id=>({scope:entry.scope,id}));
      if(!refs.length)continue;
      for(const ref of refs)claimed.add(`${ref.scope}:${ref.id}`);
      let task=groups.get(entry.prompt);
      if(!task){task={purpose:'background',chapterId:chapter.id,chapterTitle:chapter.title,prompt:entry.prompt,refs:[]};groups.set(entry.prompt,task);}
      task.refs.push(...refs);
    }
  }
  return [...groups.values()];
}

// Each variant is drawn in the chapter whose states first use it.
/** @param {DirectorRecord[]} docs @returns {Map<string,string>} */
function variantFirstUse(docs) {
  const first=new Map();
  for(const doc of docs)for(const s of doc.states??[])if(s.variant&&!first.has(s.variant))first.set(s.variant,doc.chapterId);
  return first;
}
// Portraits are transparent: asked of the tool directly, or drawn on a flat color and cut out afterwards.
/** @param {JobSettings} settings @returns {'transparent'|'cutout'} */
const transparency=settings=>settings.transparencyMethod==='cutout'?'cutout':'transparent';
/** @param {JobSettings} settings */
const portraitRequest=settings=>transparency(settings)==='cutout'
  ?{transparentBackground:false,removeBackground:true}:{transparentBackground:true};

// A variant is best made by editing the bound default image (editPrompt with that reference, so the task waits for it);
// prompt is the variant's full design for tools without image editing.
const WAITING='默认图尚未绑定；先完成默认图，再以它为参考编辑差分。';
/**
 * @param {Story} story @param {DirectorRecord} doc @param {VariantDefinition} variant @param {string} purpose
 * @param {Map<string,any>} defaults @param {JobSettings} generation @returns {string}
 */
function variantPrompt(story,doc,variant,purpose,defaults,generation) {
  if(variant.prompt!==undefined)return directorImagePrompt(doc,variant.prompt);
  const base=defaults.get(variant.entityId)??{};
  const fields=[variant.face??base.face,variant.body??base.body];
  const color=story.entities.get(variant.entityId)?.color||defaultColor(variant.entityId);
  return composeImagePrompt(doc,fields.filter(Boolean).join('\n'),purpose,color,transparency(generation));
}
/**
 * @param {Story} story @param {DirectorRecord[]} docs @param {Chapter} chapter @param {Map<string,string>} firstUse @param {Generation} selected
 * @param {Assets} assets @param {JobSettings} generation @param {Map<string,any>} defaults @returns {ImageTask[]}
 */
function variantTasks(story,docs,chapter,firstUse,selected,assets,generation,defaults) {
  const tasks=[],base={chapterId:chapter.id,chapterTitle:chapter.title};
  const reference=id=>id?{referenceImageId:id}:{blockedReason:WAITING};
  for(const doc of docs)for(const variant of doc.variants??[]) {
    if(firstUse.get(variant.id)!==chapter.id)continue;
    const kind=story.entities.get(variant.entityId)?.kind;
    if(kind==='location') {
      if(!selected.locationVariants||assets.backgrounds.bindings.variants?.[variant.id])continue;
      tasks.push({purpose:'background',...base,variantId:variant.id,prompt:variantPrompt(story,doc,variant,'background',defaults,generation),
        editPrompt:variantEditPrompt(variant),
        refs:[{scope:'variants',id:variant.id}],...reference(assets.backgrounds.bindings.locations[variant.entityId])});
      continue;
    }
    if(!selected.characterVariants)continue;
    const color=story.entities.get(variant.entityId)?.color||defaultColor(variant.entityId);
    const slots=assets.characterImages.bindings[variant.entityId],editPrompt=variantEditPrompt(variant,transparency(generation),color);
    if(!selected.standing||slots?.variants?.[variant.id]||!editPrompt)continue;
    tasks.push({purpose:'standing',characterId:variant.entityId,variantId:variant.id,...base,
      prompt:variantPrompt(story,doc,variant,'standing',defaults,generation),editPrompt,
      ...portraitRequest(generation),aspectRatio:'2:3',...reference(slots?.standing?.imageId)});
  }
  return tasks;
}

// Counts represent image requests, not the number of locations sharing an image.
// scope is 'all' or {chapterIds}: a subset still plans each image in the chapter that first needs it.
/**
 * @param {Story} story @param {DirectorRecord[]} directors @param {Assets} assets
 * @param {'all'|{chapterIds:string[]}} [scope] @param {JobSettings} [generation] @returns {ImageTask[]}
 */
export function planImageJobs(story,directors,assets,scope='all',generation={}) {
  const selected=directorGeneration(generation);
  const chapterOrder=new Map(story.chapters.map((c,i)=>[c.id,i])),order=(/** @type {string} */ id)=>/** @type {number} */(chapterOrder.get(id));
  const docs=directors.filter(d=>chapterOrder.has(d.chapterId)).slice().sort((a,b)=>order(a.chapterId)-order(b.chapterId));
  const registry=portraitRegistry(story,docs,generation);
  const cutIns=new Map(docs.flatMap(d=>d.cutIns.map(c=>[c.id,{...c,prompt:directorImagePrompt(d,c.prompt,'cut-in')}])));
  const claimed=new Set(),plannedCutIns=new Set(),plannedPortraits=new Set();
  /** @type {ImageTask[]} */
  const tasks=[];
  const unitsByChapter=new Map(story.chapters.map(c=>[c.id,/** @type {Unit[]} */([])])),firstUse=variantFirstUse(docs);
  for(const unit of story.units)unitsByChapter.get(unit.chapter.id)?.push(unit);
  const selectedChapters=scope==='all'?null:new Set(scope.chapterIds);
  for(const chapter of story.chapters){
    if(selectedChapters&&!selectedChapters.has(chapter.id))continue;
    const chapterDocs=docs.filter(d=>d.chapterId===chapter.id),chapterTasks=[];
    // The cover uses the shared art styles, so it waits for the first saved chapter record.
    if(chapter===story.chapters[0]&&titleCardEnabled(generation)&&story.titleCard&&docs[0]&&!assets.backgrounds.bindings.titleCard)
      chapterTasks.push({purpose:'title-card',chapterId:chapter.id,chapterTitle:chapter.title,
        prompt:directorImagePrompt(docs[0],story.titleCard.prompt,'title-card')});
    if(selected.backgrounds)chapterTasks.push(...backgroundTasks(chapter,chapterDocs,selected,assets,claimed));
    if(selected.cgs)for(const doc of chapterDocs)for(const cg of doc.cgs){
      if(assets.backgrounds.bindings.cgs?.[cg.id])continue;
      chapterTasks.push({purpose:'cg',chapterId:chapter.id,chapterTitle:chapter.title,cgId:cg.id,prompt:directorImagePrompt(doc,cg.prompt,'cg'),
        refs:[{scope:'cgs',id:cg.id}],from:cg.from,to:cg.to,cast:cg.cast??[]});
    }
    if(selected.cutIns)for(const doc of chapterDocs)for(const use of doc.cutInUses){
      const cut=cutIns.get(use.cutInId);
      if(!cut||assets.backgrounds.bindings.cutIns?.[cut.id]||plannedCutIns.has(cut.id))continue;
      plannedCutIns.add(cut.id);
      chapterTasks.push({purpose:'cut-in',chapterId:chapter.id,chapterTitle:chapter.title,cutInId:cut.id,prompt:cut.prompt,refs:[{scope:'cutIns',id:cut.id}]});
    }
    if(selected.standing){
      const characters=new Set();
      for(const unit of unitsByChapter.get(chapter.id)??[]) {
        for(const id of [unit.speakerId,unit.block.pov,...unit.runs.map(r=>r.characterId)])if(id)characters.add(id);
      }
      for(const doc of chapterDocs)for(const c of doc.characters)characters.add(c.characterId);
      for(const id of characters){
        const slots=Object.hasOwn(assets.characterImages.bindings,id)?assets.characterImages.bindings[id]:null;
        const design=registry.get(id);
        if(!design||slots?.standing||plannedPortraits.has(id))continue;
        plannedPortraits.add(id);
        chapterTasks.push({purpose:'standing',characterId:id,chapterId:chapter.id,chapterTitle:chapter.title,prompt:design.prompt,
          ...portraitRequest(generation),aspectRatio:'2:3'});
      }
    }
    chapterTasks.push(...variantTasks(story,docs,chapter,firstUse,selected,assets,generation,registry));
    tasks.push(...chapterTasks);
  }
  // Backgrounds, ambients and CG take the project's ratio; the cover follows its orientation (16:9 or 2:3), a Cut-in is
  // square, a portrait 2:3.
  for(const task of tasks)if(task.purpose!=='standing')
    task.aspectRatio=task.purpose==='title-card'?coverRatio(generation.ratio):task.purpose==='cut-in'?'1:1':generation.ratio??'16:9';
  const backgroundsByPrompt=new Map();
  return tasks.filter(task=>{
    if(task.purpose!=='background')return true;
    const existing=backgroundsByPrompt.get(task.prompt);
    if(existing){existing.refs.push(...task.refs);return false;}
    backgroundsByPrompt.set(task.prompt,task);return true;
  });
}

// Whether a CG over body units from…to shows any of the source paragraphs a highlight reference covers.
// Source IDs end in their paragraph number.
const sourceNumber=(/** @type {string} */ id)=>Number(/** @type {RegExpExecArray} */(/\d+$/.exec(id))[0]);
/** @param {Story} story @param {string} from @param {string} to @param {{from:string,to:string}} ref */
function covers(story,from,to,ref) {
  const start=story.units.findIndex(u=>u.id===from),end=story.units.findIndex(u=>u.id===to),low=sourceNumber(ref.from),high=sourceNumber(ref.to);
  return start>=0&&story.units.slice(start,end+1).some(u=>u.source.some(id=>sourceNumber(id)>=low&&sourceNumber(id)<=high));
}

/* A reference is usable once it names something the jobs can draw: a character or place in the story (a look other than
 * the default needs the variantId the director gave it), a Cut-in the director defined, or a highlight a CG covers.
 * The rest wait, with a reason. */
/** @param {Reference[]} references @param {Story} story @param {DirectorRecord[]} docs */
export function sortReferences(references,story,docs) {
  const variants=new Map(docs.flatMap(d=>(d.variants??[]).map(v=>[v.id,v.entityId])));
  const cutIns=new Set(docs.flatMap(d=>d.cutIns.map(c=>c.id))),cgs=docs.flatMap(d=>d.cgs);
  const usable=[],unused=[];
  for(const ref of references) {
    const kind=ref.entityId===undefined?undefined:story.entities.get(ref.entityId)?.kind;
    const reason=ref.kind==='highlight'?!cgs.some(cg=>covers(story,cg.from,cg.to,ref))&&'还没有覆盖这段正文的 CG；导演在此安排 CG 后会作为构图参考。'
      :ref.cutInId!==undefined?!cutIns.has(ref.cutInId)&&'导演尚未定义这个 Cut-in。'
      :ref.entityId===undefined?'待对应 Cut-in：写上导演定义的 cutInId。'
      :kind!=='character'&&kind!=='location'?'正文没有这个人物或地点；登记的 ID 不同时改写 entityId。'
      :ref.variantId!==undefined?variants.get(ref.variantId)!==ref.entityId&&'导演尚未为该实体定义这个差分。'
      :ref.stage!==undefined&&ref.stage!=='默认'&&'非默认形象：导演登记对应差分后写上 variantId。';
    const named=Object.fromEntries(['refId','entityId','variantId','cutInId','stage'].filter(k=>ref[k]!==undefined).map(k=>[k,ref[k]]));
    if(reason)unused.push({file:ref.file,...named,reason});
    else usable.push(ref);
  }
  return {usable,unused};
}

/* references: [{file, entityId, variantId?} | {file, cutInId}] supplied by the user for characters, places and Cut-ins.
 * A job that has some gets them with a referencePrompt; prompt stays text-only, so the agent can use either.
 * Variant jobs use only references made for that variant: a default reference may show another age or outfit.
 * A CG's prompt names its cast @1–@3 (the director's list, never guessed from the text): the prompt lists them by look,
 * the referencePrompt also by picture, one per cast member who has a reference. */
/** @param {ImageTask[]} tasks @param {Story} story @param {Reference[]} [references] @returns {ImageTask[]} */
export function attachReferences(tasks,story,references=[]) {
  const find=(entityId,variantId)=>references.filter(r=>r.entityId!==undefined&&r.entityId===entityId&&(r.variantId??null)===(variantId??null));
  return tasks.map(task=>{
    if(task.purpose==='cg'){
      const cast=task.cast.map(c=>({name:story.entities.get(c.id)?.label??c.id,look:c.look})),pictures=task.cast.map(c=>find(c.id)[0]??null);
      const scene=references.filter(r=>r.kind==='highlight'&&covers(story,task.from,task.to,r)),found=[...pictures.filter(r=>r!==null),...scene];
      const prompt=castPrompt(task.prompt,cast);
      if(!found.length)return {...task,prompt};
      let n=0;
      const labelled=castPrompt(task.prompt,cast.map((c,i)=>({...c,label:pictures[i]?`image ${++n}`:null})));
      return {...task,prompt,references:found.map(r=>({file:r.file,...Object.fromEntries(['entityId','refId'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]))})),
        referencePrompt:scene.length?referencePrompt('scene',labelled):labelled};
    }
    let found=[],kind;
    if(task.purpose==='standing'){found=find(task.characterId,task.variantId);kind='character';}
    else if(task.purpose==='background'&&task.variantId){
      found=references.filter(r=>r.variantId===task.variantId);kind='location';
    }else if(task.purpose==='background'){
      found=task.refs.filter(r=>r.scope==='locations').flatMap(r=>find(r.id));kind='location';
    }
    else if(task.purpose==='cut-in'){found=references.filter(r=>r.cutInId===task.cutInId);kind='object';}
    if(!found.length)return task;
    const names=[...new Set(found.filter(r=>r.entityId!==undefined).map(r=>story.entities.get(r.entityId)?.label??r.entityId))];
    const named=r=>Object.fromEntries(['entityId','variantId',...(r.kind==='highlight'?['refId']:[])].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));
    return {...task,references:found.map(r=>({file:r.file,...named(r)})),
      referencePrompt:referencePrompt(kind,task.prompt,names)};
  });
}

// Binds a finished image to the task's target; an existing binding is kept unless replace is set.
/** @typedef {{replace?:boolean,crop?:AvatarCrop|null,flip?:Flip|null}} BindOptions */
/**
 * @overload
 * @param {CharacterImages} data @param {Story} story @param {Extract<BindTarget,{characterId:string}>} task
 * @param {StoredImage} image @param {string} id @param {BindOptions} [options] @returns {CharacterImages}
 */
/**
 * @overload
 * @param {Backgrounds} data @param {Story} story @param {Exclude<BindTarget,{characterId:string}>} task
 * @param {StoredImage} image @param {string} id @param {BindOptions} [options] @returns {Backgrounds}
 */
/** @param {any} data @param {Story} story @param {BindTarget} task @param {StoredImage} image @param {string} id @param {BindOptions} [options] */
export function bindGeneratedImage(data,story,task,image,id,{replace=false,crop=null,flip=null}={}) {
  if(task.purpose==='standing'){
    const variant=task.variantId??null,slots=data.bindings[task.characterId],bound=variant?slots?.variants?.[variant]:slots?.standing;
    if(bound&&!replace)return data;
    return bindCharacterPortrait({...data,images:{...data.images,[id]:image}},story,task.characterId,id,variant,{flip,crop});
  }
  const next=structuredClone(data);next.images[id]=image;
  if(task.purpose==='title-card'){
    if(replace||!next.bindings.titleCard)next.bindings.titleCard=id;
    return validateBackgrounds(pruneBackgrounds(next),story);
  }
  for(const ref of task.refs)if(replace||!next.bindings[ref.scope][ref.id])
    Object.defineProperty(next.bindings[ref.scope],ref.id,{value:id,enumerable:true,writable:true,configurable:true});
  return validateBackgrounds(pruneBackgrounds(next),story);
}
