import {renderPrompt} from '../prompts/library.js';
import {lookFields} from './looks.js';
import {characterCandidates,validateArtStyles,sameArtStyles,validateDirector,bookImageCount,DIRECTOR_VERSION} from '../core/director.js';
export {validateDirector,embedDirectors,readDirectors} from '../core/director.js';
import {DIRECTOR_IMAGE_FLAGS,directorGeneration} from '../core/director-generation.js';
import {RATIOS} from '../production/presets.js';

// The canvas of backgrounds, ambients and CG as the packets name it, e.g. "9:16 portrait".
export const canvasOf=ratio=>`${ratio} ${RATIOS.portrait.includes(ratio)?'portrait':'landscape'}`;

// Densities of the kinds the project makes, as the packets state them.
export const usedDensity=(density,g)=>Object.fromEntries(Object.entries(density).filter(([key])=>({ambients:g.ambients,
  locations:g.locationBackgrounds,cgs:g.cgs,cutIns:g.cutIns,characterVariants:g.characterVariants,locationVariants:g.locationVariants})[key]));

// How many images of each kind the director makes, named in the packet; the prompts give each level's standard.
export const DENSITY_KEYS=['ambients','locations','cgs','cutIns','characterVariants','locationVariants'];
const DEFAULT_DENSITY={ambients:'medium',locations:'medium',cgs:'medium',cutIns:'few',characterVariants:'few',locationVariants:'few'};
export function directorDensity(value) {
  if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)))throw new Error('疏密设置无效。');
  const density={...DEFAULT_DENSITY};
  for(const [key,level] of Object.entries(value??{})) {
    if(!DENSITY_KEYS.includes(key)||!['few','medium','rich'].includes(level))throw new Error(`疏密设置 ${key} 须为 few、medium 或 rich。`);
    density[key]=level;
  }
  return density;
}

/* Each art style side (background, character) has a mode: `model` the director decides it, `expand` the director
 * writes it out from the user's direction, `fixed` the program uses the user's text and the director never writes it.
 * The text fields hold the fixed text or the direction. styleMode is shorthand: user = both fixed, model = both model. */
export const STYLE_SIDES=['background','character'];
const STYLE_TEXT={background:'backgroundStyle',character:'characterStyle'};
export const styleModesOf=settings=>settings.styleModes??(settings.styleMode==='user'?{background:'fixed',character:'fixed'}:{background:'model',character:'model'});
const styleSides=(settings,mode)=>Object.fromEntries(STYLE_SIDES.filter(side=>styleModesOf(settings)[side]===mode).map(side=>[side,settings[STYLE_TEXT[side]]??'']));
// The user's fixed styles by side, and the directions the director expands.
export const fixedStylesOf=settings=>styleSides(settings,'fixed');
export const styleDirectionsOf=settings=>styleSides(settings,'expand');
// Fixed text and directions must be given for every side the project needs.
function requireStyleInputs(generation,settings) {
  const g=generation,modes=styleModesOf(settings);
  if((g.ambients||g.locationBackgrounds||g.cutIns)&&modes.background!=='model'&&!settings.backgroundStyle?.trim())throw new Error('请填写背景画风。');
  if((g.standing||g.cgs)&&modes.character!=='model'&&!settings.characterStyle?.trim())throw new Error('请填写人物画风（CG 也使用此画风）。');
}

export function directorOptions(value={}) {
  if(!value||typeof value!=='object')throw new Error('Director 设置无效。');
  if(value.protocolVersion!==undefined&&value.protocolVersion!==DIRECTOR_VERSION)throw new Error(`导演设置需要 protocolVersion: ${DIRECTOR_VERSION}。`);
  if(value.enabled!==undefined&&typeof value.enabled!=='boolean')throw new Error('Director 开关无效。');
  if(value.backgrounds!==undefined&&typeof value.backgrounds!=='boolean')throw new Error('背景生图开关无效。');
  for(const key of [...DIRECTOR_IMAGE_FLAGS,'titleCard','endCard','voicePortraits','musicTracks']) {
    if(value[key]!==undefined&&typeof value[key]!=='boolean')throw new Error(`导演用途 ${key} 开关无效。`);
  }
  for(const key of ['maxImages','maxCutIns','maxVariants'])if(value[key]!==undefined)throw new Error(`${key} 已取消：改用 density 疏密档位与可选的 imageLimit 全书总数。`);
  if(value.musicDensity!==undefined&&!['few','medium','rich'].includes(value.musicDensity))throw new Error('musicDensity 须为 few、medium 或 rich。');
  const ratio=value.ratio??'16:9';
  if(![...RATIOS.landscape,...RATIOS.portrait].includes(ratio))throw new Error(`画面比例须为 ${[...RATIOS.landscape,...RATIOS.portrait].join('、')} 之一。`);
  const imageLimit=value.imageLimit??null;
  const subjectFormat=value.subjectFormat??'';
  if(typeof subjectFormat!=='string'||subjectFormat.length>2000)throw new Error('subjectFormat 须为不超过 2000 字的写法要求。');
  if(imageLimit!==null&&(!Number.isInteger(imageLimit)||imageLimit<1||imageLimit>100000))throw new Error('全书图片总数上限须为正整数。');
  if(value.styleMode!==undefined&&!['model','user','mixed'].includes(value.styleMode))throw new Error('画风来源须为 model 或 user。');
  if(value.styleMode==='mixed'&&!value.styleModes)throw new Error('画风来源 mixed 需要 styleModes。');
  if(value.styleModes!==undefined&&(!value.styleModes||typeof value.styleModes!=='object'
    ||Object.keys(value.styleModes).some(k=>!STYLE_SIDES.includes(k))||STYLE_SIDES.some(side=>!['model','expand','fixed'].includes(value.styleModes[side]))))
    throw new Error('styleModes 须为 {background,character}，各为 model、expand 或 fixed。');
  const options={
    enabled:value.enabled??false,protocolVersion:DIRECTOR_VERSION,
    backgrounds:value.backgrounds??true,
    ambients:value.ambients??true,locationBackgrounds:value.locationBackgrounds??true,cgs:value.cgs??true,titleCard:value.titleCard??true,endCard:value.endCard??false,
    cutIns:value.cutIns??false,
    standing:value.standing??true,
    characterVariants:value.characterVariants??false,locationVariants:value.locationVariants??false,
    density:directorDensity(value.density),imageLimit,ratio,subjectFormat:subjectFormat.trim(),
    ...(value.voicePortraits?{voicePortraits:true}:{}),...(value.musicTracks?{musicTracks:true,musicDensity:value.musicDensity??'medium'}:{}),
  };
  const styles=validateArtStyles({background:value.backgroundStyle??'',character:value.characterStyle??''});
  const styleModes=value.styleModes?{background:value.styleModes.background,character:value.styleModes.character}:styleModesOf(value);
  const same=styleModes.background===styleModes.character;
  const result={...options,styleModes,styleMode:same&&styleModes.background==='fixed'?'user':same&&styleModes.background==='model'?'model':'mixed',
    backgroundStyle:styles.background,characterStyle:styles.character};
  if(value.enabled)requireStyleInputs(directorGeneration(options),result);
  return result;
}

export const directorActive=value=>{
  const g=directorGeneration(value);
  return !!value.enabled&&['ambients','locationBackgrounds','cgs','cutIns','standing'].some(k=>g[k]);
};

// artStyles: the book's styles once fixed (both sides given by the user, or chosen by the design or an earlier chapter).
export function directorContext(settings,artStyles=null) {
  const fixedStyles=fixedStylesOf(settings),user=STYLE_SIDES.every(side=>side in fixedStyles)?/** @type {any} */(fixedStyles):null;
  return {generation:directorGeneration(settings),artStyles:user??artStyles,fixedStyles,imageLimit:settings.imageLimit??null};
}
// What the packets say about styles still to be written: the sides the director writes, with any direction to expand.
export function styleRequest(settings) {
  const modes=styleModesOf(settings),directions=styleDirectionsOf(settings);
  return Object.fromEntries(STYLE_SIDES.filter(side=>modes[side]!=='fixed').map(side=>[side,side in directions?{direction:directions[side]}:{}]));
}

export function validateDirectorSelection(doc,settings,artStyle=null) {
  const options=directorOptions(settings),expected=directorGeneration(options);
  if(Object.keys(expected).some(k=>doc.generation[k]!==expected[k]))throw new Error('Director 结果与本次制作用途不一致。');
  const fixed=artStyle??directorContext(options).artStyles;
  if(fixed&&!sameArtStyles(fixed,doc.artStyles))throw new Error('Director 已固定背景／人物画风，不接受改写。');
  for(const [side,text] of Object.entries(fixedStylesOf(options)))if(doc.artStyles[side]!==text)throw new Error('Director 画风与固定画风不一致。');
  return doc;
}

/** @param {any} settings @param {string} [lang] the work's language; its fragment variants and language note apply */
export function directorTaskRules(settings,lang) {
  const g=directorGeneration(settings),part=id=>renderPrompt(id,{},lang);
  const rules=[part('lang.output'),part('director11.task')].filter(Boolean);
  if(g.ambients||g.locationBackgrounds||g.cgs)rules.push(part('director11.background'));
  if(g.ambients)rules.push(part('director11.ambient'));
  if(g.locationBackgrounds)rules.push(part('director11.locations'));
  if(g.cgs)rules.push(part('director11.cg'));
  if(g.cutIns)rules.push(part('director11.cut-in'));
  if(g.standing)rules.push(part('director11.characters'));
  if(g.characterVariants||g.locationVariants)rules.push(part('director11.variants'));
  // The standard of each density level, once any kind with a density is made.
  if(Object.keys(usedDensity(directorDensity(settings.density),g)).length)rules.push(part('director11.density'));
  if(g.standing)rules.push(part('director11.staging'));
  if(g.standing||g.locationBackgrounds)rules.push(part('director11.design-conflicts'));
  return rules.join('\n\n');
}

function relevantDetails(details,relevantCharacters) {
  try {
    const value=JSON.parse(details);
    return JSON.stringify({...value,
      characters:value.characters?.filter(c=>relevantCharacters.has(c.id)),
      existingEventsInTarget:value.existingEventsInTarget?.filter(e=>relevantCharacters.has(e.characterId))});
  } catch {
    return details; // Plain dossier text is passed through as supplied.
  }
}

// The book's image limit as the packets state it: how many images are allowed and already registered.
export function imageLimitText(settings,used) {
  const limit=settings.imageLimit;
  return limit?renderPrompt('director11.image-limit',{limit,used,left:Math.max(0,limit-used)}):'';
}

// Definitions so far (book design ones not yet used included) and lasting states at chapter start.
function variantPacketInput(prior,design) {
  const defined=prior.flatMap(d=>(d.variants??[]).map(v=>({...v,chapterId:d.chapterId}))),ids=new Set(defined.map(v=>v.id));
  const designed=(design?.variants??[]).filter(v=>!ids.has(v.id)).map(v=>({...v,fromDesign:true}));
  const lasting=new Map();
  for(const doc of prior)for(const s of doc.states??[]) {
    if(s.to===undefined&&Object.hasOwn(s,'variant'))lasting.set(s.entityId,{entityId:s.entityId,variant:s.variant,since:s.from});
  }
  const main=(design?.characters??[]).filter(c=>c.main).map(c=>c.characterId);
  return renderPrompt('director11.variants-input',{variants:JSON.stringify([...defined,...designed]),
    states:JSON.stringify([...lasting.values()].filter(s=>s.variant)),main:JSON.stringify(main)});
}

// The schema's artStyles: only the sides the director writes.
export const styleSchema=request=>Object.fromEntries(Object.keys(request).map(side=>[side,side==='background'?'English background style':'English character and CG style']));
// Style rules: fixed styles, or styles to decide; sides the user fixed or gave a direction for are named.
export function styleRules(locked,settings) {
  // The user's own way of writing object descriptions goes with the style rules into every packet.
  const subject=settings.subjectFormat?'\n\n'+renderPrompt('director11.subject-format',{format:settings.subjectFormat}):'';
  if(locked)return renderPrompt('director11.style-fixed')+subject;
  const request=styleRequest(settings),plain=STYLE_SIDES.every(side=>side in request&&!request[side].direction);
  return renderPrompt('director11.style-model')+(plain?'':'\n\n'+renderPrompt('director11.style-sides',
    {sides:JSON.stringify(Object.fromEntries(STYLE_SIDES.map(side=>[side,side in request?request[side].direction!==undefined?{mode:'expand',direction:request[side].direction}:{mode:'model'}:{mode:'fixed'}])))}))+subject;
}

// Ambients defined so far, book design ones not yet shown included, for reuse by ID.
function ambientPacketInput(prior,design) {
  const defined=prior.flatMap(d=>d.ambients.map(a=>({...a,chapterId:d.chapterId}))),ids=new Set(defined.map(a=>a.id));
  const designed=(design?.ambients??[]).filter(a=>!ids.has(a.id)).map(a=>({...a,fromDesign:true}));
  return renderPrompt('director11.ambient-input',{ambients:JSON.stringify([...defined,...designed])});
}

// Characters a lasting `present:false` keeps off stage when this chapter starts (such as a first-person narrator).
function stagingPacketInput(prior) {
  const off=new Map();
  for(const doc of prior)for(const s of doc.states??[]) {
    if(s.to===undefined&&Object.hasOwn(s,'present'))if(s.present)off.delete(s.entityId);else off.set(s.entityId,s.from);
  }
  return renderPrompt('director11.staging-input',{offstage:JSON.stringify([...off].map(([entityId,since])=>({entityId,since})))});
}

// imagesUsed: images the book has registered so far (all saved chapters and the cover), against its image limit.
// One unit per line, tab-separated: unit ID, kind, speaker ID (empty for none), text; a document's later lines are indented.
/** @param {{id:string,kind:string,speakerId:string|null,text:string}} u */
export const unitLine=u=>[u.id,u.kind,u.speakerId??'',u.text.replace(/\r?\n/g,'\n\t\t\t')].join('\t');
export function directorPacket(story,chapterId,details='',previous=[],settings={},selectedArtStyles=null,visualProfiles=null,design=null,imagesUsed=0) {
  const g=directorGeneration(settings),render=renderPrompt,density=directorDensity(settings.density);
  const blocks=story.blocks.filter(b=>b.chapterId===chapterId),units=story.units.filter(u=>u.chapter.id===chapterId);
  const end=story.units.lastIndexOf(units.at(-1)),order=new Map(story.chapters.map((c,i)=>[c.id,i]));
  const prior=[];
  const earlier=previous.map(d=>typeof d==='string'?JSON.parse(d):d).filter(d=>order.get(d.chapterId)<order.get(chapterId));
  for(const doc of earlier.sort((a,b)=>order.get(a.chapterId)-order.get(b.chapterId)))prior.push(validateDirector(doc,story,doc.chapterId,prior));
  const unitCharacters=units.flatMap(u=>[u.speakerId,u.block.pov,...u.runs.map(r=>r.characterId)]);
  const relevantCharacters=new Set(unitCharacters.filter(id=>story.entities.get(id)?.kind==='character'));
  const characters=[...characterCandidates(story,end)].filter(([id])=>relevantCharacters.has(id))
    .map(([id,state])=>({id,label:state.label,pov:blocks.some(b=>b.pov===id)}));
  const locations=new Set(blocks.map(b=>b.loc).filter(Boolean)),relevant=new Set([...relevantCharacters,...locations]);
  const profiles=new Map((visualProfiles??[]).map(e=>[e.id,e]));
  const entities=[...story.entities.values()].filter(e=>relevant.has(e.id))
    .map(e=>({id:e.id,kind:e.kind,label:e.label,...lookFields(profiles.get(e.id))}));
  const masters=new Map(),designs=new Map();
  // The whole-book design comes first; designs saved by earlier chapters refine it.
  for(const bg of design?.backgrounds??[])for(const id of bg.locations)if(locations.has(id))masters.set(id,{locationId:id,prompt:bg.prompt});
  for(const c of design?.characters??[])if(relevantCharacters.has(c.characterId))designs.set(c.characterId,{...c});
  for(const doc of prior) {
    for(const bg of doc.backgrounds)for(const id of bg.locations)if(locations.has(id))masters.set(id,{locationId:id,prompt:bg.prompt});
    for(const c of doc.characters)if(relevantCharacters.has(c.characterId))designs.set(c.characterId,{...designs.get(c.characterId),...c});
  }
  const fixed=directorContext(settings,selectedArtStyles??prior[0]?.artStyles).artStyles;
  const needs={cutIns:g.cutIns,ambients:g.ambients,
    locationBackgrounds:g.locationBackgrounds,cgs:g.cgs,characters:g.standing,
    characterVariants:g.characterVariants,locationVariants:g.locationVariants,staging:g.standing,
    density:usedDensity(density,g),...(g.ambients||g.locationBackgrounds||g.cgs?{canvas:canvasOf(settings.ratio??'16:9')}:{})};
  const request=styleRequest(settings);
  const schema={version:DIRECTOR_VERSION,chapterId,...(!fixed?{artStyles:styleSchema(request)}:{}),
    ...(g.ambients?{ambients:[],ambient:'ambient ID',ambientBlocks:[]}:{}),
    backgrounds:[],omittedBlocks:[],characters:[],cgs:[],cutIns:[],cutInUses:[],
    ...(g.characterVariants||g.locationVariants?{variants:[]}:{}),...(g.characterVariants||g.locationVariants||g.standing?{states:[]}:{}),...(g.standing?{stages:[]}:{}),
    ...(g.standing||g.locationBackgrounds?{designConflicts:[]}:{})};
  const blockInput=blocks.map(b=>[`@block ${b.id} kind=${b.kind}`
    +['loc','time','pov','effect'].map(k=>b[k]&&b[k]!=='none'?` ${k}=${b[k]}`:'').join(''),
  ...units.filter(u=>u.block.id===b.id).map(unitLine)].join('\n')).join('\n\n');
  const requestText=render('director11.request',{
    bookTitle:JSON.stringify(story.book.title),chapterId,styleMode:settings.styleMode??'model',styles:JSON.stringify(fixed),needs:JSON.stringify(needs),
    blocks:blockInput,entities:JSON.stringify(entities),details:relevantDetails(details,relevantCharacters),
    characters:JSON.stringify(characters),designs:JSON.stringify(needs.characters?[...designs.values()]:[]),
    backgrounds:JSON.stringify(g.locationBackgrounds?[...masters.values()]:[]),
  });
  const ambientInput=g.ambients?'\n\n'+ambientPacketInput(prior,design):'';
  const cutInInput=g.cutIns?'\n\n'+render('director11.cut-in-input',{cutIns:JSON.stringify(prior.flatMap(d=>d.cutIns))}):'';
  const variantInput=g.characterVariants||g.locationVariants?'\n\n'+variantPacketInput(prior,design):'';
  const stagingInput=g.standing?'\n\n'+stagingPacketInput(prior):'';
  return styleRules(fixed,settings)+'\n\n'+requestText+ambientInput+cutInInput+variantInput+stagingInput
    +'\n\n'+render('director11.output',{schema:JSON.stringify(schema),limit:imageLimitText(settings,imagesUsed)});
}
