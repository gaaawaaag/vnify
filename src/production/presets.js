// @ts-check
/** @import {Density,ImageKind,KindChoice,Preset,PresetFile,DirectorSettings,TransparencyMethod} from '../types/production.js' */
import {SEARCH_KINDS} from './image-search.js';

/* Production presets: settings chosen before a work is made, kept in presets.json at the production environment's root.
 * Two built-in presets can be edited and restored but not removed; a work copies the preset it starts with into its
 * notes, so later edits never change a work already begun. */
export const PRESETS_VERSION=1;
export const IMAGE_KINDS=/** @type {const} */(['cover','endCard','ambient','location','cg','closeup','standing','characterVariants','locationVariants']);
// Kinds whose number has a density; the cover, the end card and the standing portraits are made as the story needs them.
export const DENSITY_KINDS=new Set(['ambient','location','cg','closeup','characterVariants','locationVariants']);
export const RATIOS=Object.freeze({landscape:['16:9','3:2','4:3'],portrait:['9:16','2:3','3:4']});
// The cover follows the book's orientation: a wide 16:9 picture, or a 2:3 book cover for portrait books.
/** @param {string|undefined} ratio */
export const coverRatio=ratio=>RATIOS.portrait.includes(ratio??'')?'2:3':'16:9';
const LIMITS={text:4000,notes:2000,name:40,presets:32};
// The image uses a production preset can mount an image service preset for (as in a work's 生图方案).
export const DRAWING_USES=/** @type {const} */(['background','cg','cutin','cover','standing','variant']);

/** @param {boolean} on @param {Density} [density] @returns {KindChoice} */
const kind=(on,density='medium')=>({on,density,notes:''});
// sound.voice: off, portraits (the director writes voice portraits) or assign (the agent also assigns voices from the library);
// sound.effects: off or full (the sound director writes sounds with search words, the agent binds files), at a density;
// sound.music: off, prompts (the design writes the track list and the sound director the cues) or full (the agent also
// finds or generates the tracks), with musicDensity for how many tracks and cues.
// sound.effectSources / musicSources: every source in the order the agent tries them, each ticked or not: the local
// library, Freesound, then generating with an audio preset (effectPreset / musicPreset); generateLimit caps generated
// effects per work.
export const SOUND_SOURCES=/** @type {const} */(['local','freesound','generate']);
export const VOICE_SOURCES=/** @type {const} */(['fish','elevenlabs','gemini']);
/** @typedef {import('../types/production.js').SoundSource} SoundSource */
/** @typedef {import('../types/production.js').VoiceSource} VoiceSource */
/** @template {string} T @param {readonly T[]} all @param {readonly T[]} on @returns {{id:T,on:boolean}[]} */
const choicesOn=(all,on)=>[...on.map(id=>({id,on:true})),...all.filter(id=>!on.includes(id)).map(id=>({id,on:false}))];
/** @param {SoundSource[]} on @returns {{id:SoundSource,on:boolean}[]} */
const sourcesOn=on=>choicesOn(SOUND_SOURCES,on);
/** @param {VoiceSource[]} on @returns {{id:VoiceSource,on:boolean}[]} */
const voiceSourcesOn=on=>choicesOn(VOICE_SOURCES,on);
/** @returns {Preset['sound']} */
const DEFAULT_SOUND=()=>({voice:'off',voiceSources:voiceSourcesOn([...VOICE_SOURCES]),effects:'off',density:'medium',music:'off',musicDensity:'medium',
  musicPreset:'',effectPreset:'',notes:'',effectSources:sourcesOn(['local','freesound']),musicSources:sourcesOn(['local','generate']),generateLimit:10});
/** A source list as saved: every source once, ticked or not. Older files listed only the ticked ones, by name, and called
 * generated effects elevenlabs.
 * @template {string} T @param {any} list @param {readonly T[]} all @param {(item:string)=>string} [map] @returns {{id:T,on:boolean}[]|null} */
function orderedList(list,all,map=item=>item) {
  if(!Array.isArray(list))return null;
  if(list.every(item=>typeof item==='string')) {
    const ids=list.map(map);
    return ids.every(id=>all.includes(/** @type {any} */(id)))&&new Set(ids).size===ids.length?choicesOn(all,/** @type {T[]} */(ids)):null;
  }
  const ids=list.map(item=>item?.id);
  if(list.some(item=>typeof item?.on!=='boolean')||ids.length!==all.length||!all.every(id=>ids.includes(id)))return null;
  return list.map(item=>({id:item.id,on:item.on}));
}
/** @param {any} list */
const sourceList=list=>orderedList(list,SOUND_SOURCES,item=>item==='elevenlabs'?'generate':item);
/** @param {any} list */
const voiceSourceList=list=>orderedList(list,VOICE_SOURCES);
/** The ticked sources in order. @template {string} T @param {{id:T,on:boolean}[]} list @returns {T[]} */
export const sourcesInUse=list=>list.filter(item=>item.on).map(item=>item.id);
/** @type {Preset} */
const VISUAL_NOVEL={sound:DEFAULT_SOUND(),delivery:'prompts',style:'style',dossier:'detailed',terms:false,textNotes:'',orientation:'landscape',ratio:'16:9',
  styles:{background:{mode:'model',text:''},character:{mode:'model',text:''}},drawing:{mode:'agent',notes:'',uses:{}},transparency:'native',limit:null,
  kinds:{cover:kind(true),endCard:kind(false),ambient:kind(true),location:kind(true),cg:kind(true),closeup:kind(true,'few'),standing:kind(true),
    characterVariants:kind(false,'few'),locationVariants:kind(false,'few')}};
// A picture book shows its pictures where the backgrounds go: no standing portraits, no close-ups, more CG.
/** @type {Preset} */
const PICTURE_BOOK={...structuredClone(VISUAL_NOVEL),dossier:'simple',
  kinds:{...structuredClone(VISUAL_NOVEL.kinds),location:kind(true,'rich'),cg:kind(true,'rich'),closeup:kind(false),standing:kind(false)}};
/** @type {Readonly<Record<string,Preset>>} */
export const BUILT_IN_PRESETS=Object.freeze({'视觉小说':VISUAL_NOVEL,'绘本':PICTURE_BOOK});
export const DEFAULT_PRESET='视觉小说';
/** @returns {PresetFile} */
export const emptyPresetFile=()=>({version:PRESETS_VERSION,default:DEFAULT_PRESET,presets:structuredClone({...BUILT_IN_PRESETS})});

/** @param {unknown} value @param {readonly string[]} options */
const one=(value,options)=>typeof value==='string'&&options.includes(value);
/** @param {unknown} value @param {number} max */
const text=(value,max)=>typeof value==='string'&&value.length<=max;
/** @param {any} value @param {string} name @returns {Preset} */
export function validatePreset(value,name) {
  /** @param {string} what @returns {never} */
  const fail=what=>{throw new Error(`预设“${name}”的${what}无效。`);};
  if(!value||typeof value!=='object')fail('内容');
  if(!one(value.delivery,['text','prompts','images']))fail('交付结果');
  if(!one(value.style,['style','style-no-tags','style-original']))fail('正文风格');
  if(!one(value.dossier,['off','simple','detailed']))fail('人物资料');
  if(typeof value.terms!=='boolean'||value.terms&&value.dossier==='off')fail('世界词条');
  if(!text(value.textNotes,LIMITS.text))fail('自定义要求');
  if(!one(value.orientation,['landscape','portrait'])||!RATIOS[/** @type {'landscape'|'portrait'} */(value.orientation)].includes(value.ratio))fail('画面方向');
  for(const which of ['background','character']) {
    const style=value.styles?.[which];
    if(!style||!one(style.mode,['model','expand','fixed'])||!text(style.text,LIMITS.text))fail(which==='background'?'背景画风':'人物画风');
  }
  // How pictures are drawn (docs/prompt-formats.md): by the agent's host tool, with optional notes on how to write for it,
  // or with image service presets mounted per use. Older files had a subject requirement for the director: it becomes the notes.
  const old=value.subject?.mode==='custom'?String(value.subject.text??''):'';
  const drawing=value.drawing??{mode:'agent',notes:old,uses:{}};
  if(!drawing||!one(drawing.mode,['agent','presets'])||!text(drawing.notes,LIMITS.notes)||!drawing.uses||typeof drawing.uses!=='object'
    ||Object.entries(drawing.uses).some(([use,id])=>!DRAWING_USES.includes(/** @type {any} */(use))||typeof id!=='string'||!/^[\w-]{1,64}$/.test(id)))fail('生图方式');
  // Older files may say 'model': a solid background either way, removed after drawing.
  if(!one(value.transparency,['native','cutout','model']))fail('立绘背景');
  if(value.limit!==null&&!(Number.isInteger(value.limit)&&value.limit>0&&value.limit<=100000))fail('图片总数');
  // Sound came later: a file without it reads no voices. Effects that were only search words are now full effects.
  const sound={...DEFAULT_SOUND(),...value.sound};
  if(sound.effects==='queries')sound.effects='full';
  const voiceSources=voiceSourceList(sound.voiceSources),effectSources=sourceList(sound.effectSources),musicSources=sourceList(sound.musicSources);
  if(!one(sound.voice,['off','portraits','assign'])||!voiceSources||!one(sound.effects,['off','full'])||!one(sound.density,['few','medium','rich'])
    ||!one(sound.music,['off','prompts','full'])||!one(sound.musicDensity,['few','medium','rich'])
    ||typeof sound.musicPreset!=='string'||sound.musicPreset.length>64||typeof sound.effectPreset!=='string'||sound.effectPreset.length>64
    ||!text(sound.notes,LIMITS.notes)||!effectSources||!musicSources
    ||!Number.isInteger(sound.generateLimit)||sound.generateLimit<0||sound.generateLimit>200)return fail('声音');
  if(!value.kinds||typeof value.kinds!=='object')fail('图片种类');
  /** @type {Record<string,KindChoice>} */
  const kinds={};
  for(const id of IMAGE_KINDS) {
    // The end card came later: a file without it has it off.
    const choice=id==='endCard'&&value.kinds[id]===undefined?kind(false):value.kinds[id];
    if(!choice||typeof choice.on!=='boolean'||!one(choice.density,['few','medium','rich'])||!text(choice.notes,LIMITS.notes)
      ||choice.search!==undefined&&(typeof choice.search!=='boolean'||!SEARCH_KINDS.has(id)))fail(`图片种类 ${id}`);
    kinds[id]={on:choice.on,density:choice.density,notes:choice.notes,...(choice.search?{search:true}:{})};
  }
  return {delivery:value.delivery,style:value.style,dossier:value.dossier,terms:value.terms,textNotes:value.textNotes,
    orientation:value.orientation,ratio:value.ratio,
    styles:{background:{mode:value.styles.background.mode,text:value.styles.background.text},
      character:{mode:value.styles.character.mode,text:value.styles.character.text}},
    drawing:{mode:drawing.mode,notes:drawing.notes,uses:{...drawing.uses}},
    transparency:value.transparency==='native'?'native':'cutout',limit:value.limit,kinds:/** @type {Record<ImageKind,KindChoice>} */(kinds),
    sound:{voice:sound.voice,voiceSources,effects:sound.effects,density:sound.density,music:sound.music,musicDensity:sound.musicDensity,
      musicPreset:sound.musicPreset,effectPreset:sound.effectPreset,notes:sound.notes,effectSources,musicSources,generateLimit:sound.generateLimit}};
}
/* A preset file as saved; a missing file gives the built-ins. Built-in presets missing from the file come back,
 * so they can be restored but never lost. */
/** @param {any} value @returns {PresetFile} */
export function validatePresetFile(value) {
  if(value==null)return emptyPresetFile();
  if(typeof value!=='object'||value.version!==PRESETS_VERSION||!value.presets||typeof value.presets!=='object')throw new Error('预设文件无效。');
  const names=Object.keys(value.presets);
  if(names.length>LIMITS.presets)throw new Error(`预设最多 ${LIMITS.presets} 套。`);
  /** @type {Record<string,Preset>} */
  const presets={};
  for(const name of names) {
    if(!name.trim()||name.length>LIMITS.name||name!==name.trim())throw new Error(`预设名称无效：${name}`);
    presets[name]=validatePreset(value.presets[name],name);
  }
  for(const [name,preset] of Object.entries(BUILT_IN_PRESETS))if(!presets[name])presets[name]=structuredClone(preset);
  if(typeof value.default!=='string'||!presets[value.default])throw new Error('默认预设不存在。');
  return {version:PRESETS_VERSION,default:value.default,presets};
}

/* The director project's options for a preset: switches and densities per kind, the optional book-wide image limit. */
/** @param {Preset} preset @returns {DirectorSettings&{transparencyMethod:TransparencyMethod}} */
export function directorOptions(preset) {
  const k=preset.kinds,on=(/** @type {ImageKind} */ id)=>k[id].on;
  // A fixed style is attached by the program; a direction is written out by the director; model styles are its own.
  return {
    protocolVersion:13,enabled:true,titleCard:on('cover'),endCard:on('cover')&&on('endCard'),ambients:on('ambient'),locationBackgrounds:on('location'),cgs:on('cg'),
    cutIns:on('closeup'),
    density:{ambients:k.ambient.density,locations:k.location.density,cgs:k.cg.density,cutIns:k.closeup.density,
      characterVariants:k.characterVariants.density,locationVariants:k.locationVariants.density},
    ...(preset.limit?{imageLimit:preset.limit}:{}),ratio:preset.ratio,
    standing:on('standing'),
    characterVariants:on('standing')&&on('characterVariants'),locationVariants:on('location')&&on('locationVariants'),
    styleModes:{background:preset.styles.background.mode,character:preset.styles.character.mode},
    backgroundStyle:preset.styles.background.mode==='model'?'':preset.styles.background.text,
    characterStyle:preset.styles.character.mode==='model'?'':preset.styles.character.text,
    // native: the prompt asks for a transparent background; cutout: a flat colour, removed after drawing.
    transparencyMethod:preset.transparency==='native'?'native':'cutout',
    // Voice portraits come with the whole-book design.
    ...(preset.sound.voice!=='off'?{voicePortraits:true}:{}),
    // The track list comes with the whole-book design too, as many tracks as the music density asks.
    ...(preset.sound.music!=='off'?{musicTracks:true,musicDensity:preset.sound.musicDensity}:{}),
  };
}
// The project's soundOptions for the sound director packets; null when the preset makes no sounds.
/** @param {Preset} preset */
export const soundOptionsOf=preset=>preset.sound.effects==='off'&&preset.sound.music==='off'?null
  :{density:preset.sound.density,notes:preset.sound.notes,effects:preset.sound.effects!=='off',music:preset.sound.music!=='off',
    ...(preset.sound.music!=='off'?{musicDensity:preset.sound.musicDensity}:{})};
// The kinds whose pictures the agent first looks for in the photo libraries; null when none.
/** @param {Preset} preset */
export const imageSearchOf=preset=>{
  const kinds=[...SEARCH_KINDS].filter(id=>preset.kinds[/** @type {ImageKind} */(id)].on&&preset.kinds[/** @type {ImageKind} */(id)].search);
  return kinds.length?{kinds}:null;
};
// The work's first 生图方案 when the preset mounts image service presets; null when the agent draws.
/** @param {Preset} preset */
export const imageSchemeOf=preset=>preset.drawing.mode==='presets'?{uses:{...preset.drawing.uses}}:null;
