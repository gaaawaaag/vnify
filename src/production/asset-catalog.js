// @ts-check
/** @import {Story} from '../types/story.js' */
/** @import {DirectorRecord} from '../types/director.js' */
/** @import {Backgrounds,CharacterImages} from '../types/assets.js' */
/** @import {ImageTask} from '../types/production.js' */
import {planImageJobs} from './image-jobs.js';
import {imageTaskIds} from './image-tasks.js';
import {emptyBackgrounds} from '../reader/backgrounds.js';
import {emptyCharacterImages} from '../reader/character-images.js';
import {portraitRegistry} from '../core/portrait-prompts.js';
import {variantAt} from '../core/variants.js';

/* Every image a work can have, bound or not, grouped the way the asset manager shows them: the cover, ambients,
 * locations and characters (each with its variants), CG and Cut-ins. Planning against empty assets lists every target
 * with its composed prompt; the bindings then say which already have a picture. Characters and locations the director
 * gave no image are listed too, so a picture can still be bound to them. */

/** @typedef {'cover'|'ambient'|'location'|'character'|'cg'|'cutin'} Category */
/** @typedef {{kind:'cover'}|{kind:'endCard'}|{kind:'ambient'|'cg'|'cutin'|'variant'|'character',id:string}|{kind:'location',locations:string[]}} EditRef */

/** @param {any} task */
const targetOf=task=>task.purpose==='title-card'||task.purpose==='end-card'?{purpose:task.purpose}
  :task.purpose==='standing'?{purpose:'standing',characterId:task.characterId,...(task.variantId?{variantId:task.variantId}:{})}
  :{purpose:task.purpose,refs:task.refs};

/**
 * @param {{story:Story,docs:DirectorRecord[],backgrounds:Backgrounds,characterImages:CharacterImages,generation:any,prompts:Map<string,string>,
 *   formatted?:Map<string,{format:string,prompts:Map<string,{text:string,source:string}>}>}} loaded
 */
export function assetCatalog({story,docs,backgrounds,characterImages,generation,prompts,formatted=new Map()}) {
  const empty={backgrounds:emptyBackgrounds(story.book.id),characterImages:emptyCharacterImages(story.book.id)};
  const tasks=planImageJobs(story,docs,empty,'all',generation);
  const chapterTitle=new Map(story.chapters.map(c=>[c.id,c.title]));
  const label=(/** @type {string} */ id)=>story.entities.get(id)?.label??id;
  const registry=portraitRegistry(story,docs,generation);
  const variants=new Map(docs.flatMap(d=>(d.variants??[]).map(v=>[v.id,v])));
  const backgroundsOf=docs.flatMap(d=>d.backgrounds);
  const imageInfo=(/** @type {any} */ images,/** @type {string|null|undefined} */ id)=>{
    const image=id?images[id]:null;
    return image?{imageId:/** @type {string} */(id),type:image.type,width:image.width,height:image.height}:null;
  };
  /** @param {ImageTask} task */
  const boundOf=task=>{
    const t=/** @type {any} */(task);
    if(t.purpose==='title-card')return imageInfo(backgrounds.images,backgrounds.bindings.titleCard);
    if(t.purpose==='end-card')return imageInfo(backgrounds.images,backgrounds.bindings.endCard);
    if(t.purpose==='standing'){
      const slots=characterImages.bindings[t.characterId],portrait=/** @type {any} */(t.variantId?slots?.variants?.[t.variantId]:slots?.standing);
      const info=imageInfo(characterImages.images,portrait?.imageId);
      return info&&{...info,...(portrait.crop?{crop:portrait.crop}:{}),...(portrait.flip?{flip:portrait.flip}:{})};
    }
    const ref=t.refs[0];
    return imageInfo(backgrounds.images,/** @type {any} */(backgrounds.bindings)[ref.scope]?.[ref.id]);
  };
  /** @param {ImageTask} task @param {string} name @param {any} description @param {EditRef} edit */
  const image=(task,name,description,edit)=>{
    const t=/** @type {any} */(task),key=imageTaskIds(task)[0];
    return {key,name,...(t.variantId?{variantId:t.variantId}:{}),target:targetOf(t),bound:boundOf(task),description,edit,
      prompt:t.prompt,...(t.editPrompt?{editPrompt:t.editPrompt}:{}),
      sent:prompts.get(key)??null,...(t.editPrompt?{sentEdit:prompts.get(`${key}#edit`)??null}:{}),
      // The agent's rewrites for each image service preset: {presetId: {format, prompt?, edit?}}, each {text, source}.
      formatted:Object.fromEntries([...formatted].flatMap(([id,f])=>{
        const prompt=f.prompts.get(key),edit=f.prompts.get(`${key}#edit`);
        return prompt||edit?[[id,{format:f.format,...(prompt?{prompt}:{}),...(edit?{edit}:{})}]]:[];
      })),
      aspectRatio:t.aspectRatio??'2:3',side:['standing','cg','title-card','end-card'].includes(t.purpose)?'character':'background'};
  };
  const blocksIn=(/** @type {(unit:any)=>boolean} */ test)=>{
    const counts=new Map(),seen=new Set();
    for(const unit of story.units)if(!seen.has(unit.block.id)&&test(unit)){seen.add(unit.block.id);counts.set(unit.chapter.id,(counts.get(unit.chapter.id)??0)+1);}
    return [...counts].map(([chapter,n])=>`${chapterTitle.get(chapter)} · ${n} 块`);
  };
  /** @type {any[]} */
  const entries=[];
  const variantImages=new Map();
  for(const task of tasks) {
    const t=/** @type {any} */(task);
    if(t.variantId) {
      const v=/** @type {any} */(variants.get(t.variantId));
      const description=v.prompt!==undefined?{kind:'prompt',prompt:v.prompt}:{kind:'look',face:v.face??'',body:v.body??''};
      const img=image(task,v.name,description,{kind:'variant',id:v.id});
      // A character variant's own stature; null keeps the default look's. Places have none.
      variantImages.set(t.variantId,v.prompt===undefined?{...img,stature:v.stature??null}:img);
      continue;
    }
    if(t.purpose==='title-card')entries.push({key:'title-card',cat:'cover',name:'封面',chapterId:t.chapterId,
      images:[image(task,'封面',{kind:'prompt',prompt:story.titleCard?.prompt??''},{kind:'cover'})]});
    else if(t.purpose==='end-card')entries.push({key:'end-card',cat:'cover',name:'结尾图',chapterId:t.chapterId,
      images:[image(task,'结尾图',{kind:'prompt',prompt:story.endCard?.prompt??''},{kind:'endCard'})]});
    else if(t.purpose==='cg') {
      const cg=docs.flatMap(d=>d.cgs).find(c=>c.id===t.cgId);
      const at=story.units.findIndex(u=>u.id===t.from);
      // The director's cast, each with the variant worn at the CG's start (its portrait is the reference picture).
      const cast=t.cast.map((/** @type {any} */ c)=>({id:c.id,label:label(c.id),look:c.look,variantId:variantAt(story,c.id,at)}));
      entries.push({key:`cg:${t.cgId}`,cat:'cg',name:cg?.reason??t.cgId,chapterId:t.chapterId,uses:[`${chapterTitle.get(t.chapterId)} · ${t.from} – ${t.to}`],
        cast,images:[image(task,'默认',{kind:'prompt',prompt:cg?.prompt??''},{kind:'cg',id:t.cgId})]});
    } else if(t.purpose==='cut-in') {
      const cut=docs.flatMap(d=>d.cutIns).find(c=>c.id===t.cutInId);
      const uses=docs.flatMap(d=>d.cutInUses.filter(u=>u.cutInId===t.cutInId).map(u=>`${chapterTitle.get(d.chapterId)} · ${u.from} – ${u.to}`));
      entries.push({key:`cutin:${t.cutInId}`,cat:'cutin',name:cut?.reason??t.cutInId,chapterId:t.chapterId,uses,
        images:[image(task,'默认',{kind:'prompt',prompt:cut?.prompt??''},{kind:'cutin',id:t.cutInId})]});
    } else if(t.purpose==='standing') {
      const design=registry.get(t.characterId);
      entries.push({key:`character:${t.characterId}`,cat:'character',entityId:t.characterId,name:label(t.characterId),chapterId:t.chapterId,
        images:[{...image(task,'默认',{kind:'look',face:design?.face??'',body:design?.body??''},{kind:'character',id:t.characterId}),
          stature:design?.stature??null}]});
    } else if(t.refs[0].scope==='ambients') {
      for(const ref of t.refs) {
        const ambient=docs.flatMap(d=>d.ambients??[]).find(a=>a.id===ref.id);
        const uses=docs.flatMap(d=>[...(d.ambient===ref.id?[`${chapterTitle.get(d.chapterId)} · 默认`]:[]),
          ...(d.ambientBlocks??[]).filter(b=>b.ambient===ref.id).map(b=>`${chapterTitle.get(d.chapterId)} · ${b.blocks.length} 块`)]);
        entries.push({key:`ambient:${ref.id}`,cat:'ambient',name:ambient?.name??ref.id,chapterId:t.chapterId,uses,
          images:[image(/** @type {ImageTask} */({...task,refs:[ref]}),ambient?.name??ref.id,{kind:'prompt',prompt:ambient?.prompt??''},{kind:'ambient',id:ref.id})]});
      }
    } else {
      const locations=t.refs.map((/** @type {any} */ r)=>r.id),bg=backgroundsOf.find(b=>b.locations.some(id=>locations.includes(id)));
      entries.push({key:`location:${locations[0]}`,cat:'location',entityId:locations[0],locations,name:label(locations[0]),
        shared:locations.slice(1).map(label),chapterId:t.chapterId,uses:blocksIn(u=>locations.includes(u.block.loc)),
        images:[image(task,'默认',{kind:'prompt',prompt:bg?.prompt??''},{kind:'location',locations})]});
    }
  }
  // Variants sit under their character or location, after the default.
  for(const [id,img] of variantImages) {
    const v=/** @type {any} */(variants.get(id)),owner=entries.find(e=>e.cat==='character'?e.entityId===v.entityId:e.cat==='location'&&e.locations.includes(v.entityId));
    if(owner)owner.images.push(img);
  }
  // Characters and locations without a director image can still take a picture.
  const firstChapter=(/** @type {string} */ id)=>story.units.find(u=>u.speakerId===id||u.block.pov===id||u.block.loc===id
    ||u.runs.some(r=>r.characterId===id))?.chapter.id??story.chapters[0].id;
  const listed=new Set(entries.flatMap(e=>e.cat==='location'?e.locations:e.cat==='character'?[e.entityId]:[]));
  for(const entity of story.entities.values()) {
    if(listed.has(entity.id)||(entity.kind!=='character'&&entity.kind!=='location'))continue;
    const character=entity.kind==='character',chapterId=firstChapter(entity.id);
    const task=/** @type {ImageTask} */(character?{purpose:'standing',characterId:entity.id,chapterId,chapterTitle:'',prompt:'',aspectRatio:'2:3'}
      :{purpose:'background',refs:[{scope:'locations',id:entity.id}],chapterId,chapterTitle:'',prompt:'',aspectRatio:generation.ratio??'16:9'});
    const img={...image(task,'默认',null,character?{kind:'character',id:entity.id}:{kind:'location',locations:[entity.id]}),prompt:null};
    entries.push({key:`${entity.kind}:${entity.id}`,cat:character?'character':'location',entityId:entity.id,...(character?{}:{locations:[entity.id]}),
      name:entity.label,chapterId,noDirector:true,...(character?{}:{uses:blocksIn(u=>u.block.loc===entity.id)}),images:[img]});
  }
  const order=new Map(story.chapters.map((c,i)=>[c.id,i]));
  const cats=['cover','ambient','location','character','cg','cutin'];
  entries.sort((a,b)=>cats.indexOf(a.cat)-cats.indexOf(b.cat)||(order.get(a.chapterId)??0)-(order.get(b.chapterId)??0));
  return entries.map(e=>({...e,chapterTitle:chapterTitle.get(e.chapterId)??''}));
}
