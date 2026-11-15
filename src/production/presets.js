// @ts-check
/** @import {Density,ImageKind,KindChoice,Preset,PresetFile,DirectorSettings,TransparencyMethod} from '../types/production.js' */

/* Production presets: settings chosen before a work is made, kept in presets.json at the production environment's root.
 * Two built-in presets can be edited and restored but not removed; a work copies the preset it starts with into its
 * notes, so later edits never change a work already begun. */
export const PRESETS_VERSION=1;
export const IMAGE_KINDS=/** @type {const} */(['cover','ambient','location','cg','closeup','standing','characterVariants','locationVariants']);
// Kinds whose number has a density; the cover and the standing portraits are made as the story needs them.
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
/** @type {Preset} */
const VISUAL_NOVEL={delivery:'prompts',style:'style',dossier:'detailed',terms:false,textNotes:'',orientation:'landscape',ratio:'16:9',
  styles:{background:{mode:'model',text:''},character:{mode:'model',text:''}},drawing:{mode:'agent',notes:'',uses:{}},transparency:'native',limit:null,
  kinds:{cover:kind(true),ambient:kind(true),location:kind(true),cg:kind(true),closeup:kind(true,'few'),standing:kind(true),
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
  if(!value.kinds||typeof value.kinds!=='object')fail('图片种类');
  /** @type {Record<string,KindChoice>} */
  const kinds={};
  for(const id of IMAGE_KINDS) {
    const choice=value.kinds[id];
    if(!choice||typeof choice.on!=='boolean'||!one(choice.density,['few','medium','rich'])||!text(choice.notes,LIMITS.notes))fail(`图片种类 ${id}`);
    kinds[id]={on:choice.on,density:choice.density,notes:choice.notes};
  }
  return {delivery:value.delivery,style:value.style,dossier:value.dossier,terms:value.terms,textNotes:value.textNotes,
    orientation:value.orientation,ratio:value.ratio,
    styles:{background:{mode:value.styles.background.mode,text:value.styles.background.text},
      character:{mode:value.styles.character.mode,text:value.styles.character.text}},
    drawing:{mode:drawing.mode,notes:drawing.notes,uses:{...drawing.uses}},
    transparency:value.transparency==='native'?'native':'cutout',limit:value.limit,kinds:/** @type {Record<ImageKind,KindChoice>} */(kinds)};
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
    protocolVersion:13,enabled:true,titleCard:on('cover'),ambients:on('ambient'),locationBackgrounds:on('location'),cgs:on('cg'),
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
  };
}
// The work's first 生图方案 when the preset mounts image service presets; null when the agent draws.
/** @param {Preset} preset */
export const imageSchemeOf=preset=>preset.drawing.mode==='presets'?{uses:{...preset.drawing.uses}}:null;
