// @ts-check
import {imageUse,presetName,apiSecret,canEdit,referenceLimit,refLabel,REFERENCE_IMAGES} from './image-presets.js';
import {castPrompt,characterBackgroundPrompt} from '../core/image-prompts.js';
import {chosenPrompt} from './prompt-formats.js';
import * as novelai from './generators/novelai.js';
import * as comfyui from './generators/comfyui.js';
import * as openai from './generators/openai.js';
import {decodePng,encodePng} from './png.js';
import {removeBackground} from './cutout.js';
import {imageType} from '../reader/backgrounds.js';
import {imageSize} from './image-size.js';
import {isPortraitShape} from '../reader/portrait-shape.js';

/* Draws one catalog image with a preset: the prompt the asset manager shows (hand-written or composed) with the
 * preset's fixed prompts, the size for its shape, a seed; a variant is drawn from its default picture when the preset
 * can (NovelAI image-to-image with the default's seed, a ComfyUI edit workflow, or an API edit). An API takes no seed. A portrait that does not come back
 * transparent loses its background (the program, or a background-removal preset) and is cut to exactly 2:3. */

const randomSeed=()=>Math.floor(Math.random()*4294967295);
/** @param {string} text @param {any} preset */
const withFixed=(text,preset)=>!preset.positive?text:preset.positiveAt==='before'?`${preset.positive}, ${text}`:`${text}, ${preset.positive}`;
// ComfyUI keys may carry one request header for a cloud server, written as "Name: value".
/** @param {string} line */
export const headerOf=line=>{const at=line.indexOf(':');return at>0?{[line.slice(0,at).trim()]:line.slice(at+1).trim()}:{};};

export {canEdit};

/* A portrait for a preset that draws transparent pictures itself: the composed background sentence asks for transparency
 * (not the flat colour a cutout work was written with), and the preset's transparent wording, when it has one, takes its
 * place around the whole prompt. A prompt already in that wording (hand-written, or rewritten by the agent) is left as it is. */
/** @param {any} preset @param {string} prompt */
export function transparentPrompt(preset,prompt) {
  if(!preset.transparent)return prompt;
  const wrap=preset.format.transparent,flat=characterBackgroundPrompt('cutout'),clear=characterBackgroundPrompt('transparent');
  let text=prompt.replace(flat,wrap?'':clear);
  if(wrap)text=text.replace(clear,'');
  text=text.replace(/\n{3,}/g,'\n\n').trim();
  if(!wrap)return text;
  const [before,after]=wrap.split('{prompt}');
  if(before.trim()&&text.includes(before.trim()))return text;
  return `${before}${text}${after}`;
}

/**
 * What a job will send, worked out before anything runs (also shown as 生成信息). cast: a CG's main characters in the
 * director's order, named @1–@3 in its prompt; picture: their portrait can go along. The preset takes as many portraits as
 * it can, in order; the rest are drawn from their look alone. references: the names whose portraits are sent.
 * @param {{preset:any,asset:any,image:any,base?:{seed?:number|null}|null,cast?:{name:string,look:string,picture?:boolean}[]}} job
 */
export function planDrawing({preset,asset,image,base=null,cast=[]}) {
  const edit=!!image.variantId&&!!base&&canEdit(preset);
  const chosen=chosenPrompt(preset,image,edit),{source,pending}=chosen;
  if(!chosen.prompt)throw new Error('这张图没有提示词：导演没有为它写画面描述，只能上传图片。');
  const limit=edit?0:referenceLimit(preset);
  let count=0;
  const members=cast.map(c=>({name:c.name,look:c.look,label:c.picture&&count<limit?refLabel(preset,++count)??'':null}));
  const named=members.filter(m=>m.label!==null).map(m=>m.name);
  const prompt=castPrompt(chosen.prompt,members);
  const [width,height]=preset.sizes[image.aspectRatio]??preset.sizes['1:1'];
  const seed=preset.source==='openai'?null:edit&&preset.source==='novelai'&&Number.isInteger(base?.seed)?/** @type {number} */(base?.seed)
    :preset.seed==='random'?randomSeed():preset.seed;
  const portrait=asset.cat==='character',fixed=withFixed(prompt,preset);
  return {use:imageUse(asset,image),mode:edit?'edit':named.length?'reference':'generate',references:named,prompt:portrait?transparentPrompt(preset,fixed):fixed,negative:preset.negative,width,height,seed,
    ratio:image.aspectRatio,portrait,preset:preset.id,presetName:presetName(preset),source,pending};
}


/* NovelAI draws only at multiples of 64, so an image-to-image base (a portrait cut to exactly 2:3, or any uploaded
 * picture) is resized to the preset's size for its shape, over white where it is transparent. */
/** @param {Uint8Array} bytes @param {number} width @param {number} height */
export function novelaiBase(bytes,width,height) {
  if(imageType(bytes)!=='image/png')throw new Error('以默认图图生图需要 PNG 默认图；可改为“按差分设计重新生成”。');
  const source=decodePng(bytes),data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const sx=Math.min(source.width-1,(x+.5)*source.width/width-.5),sy=Math.min(source.height-1,(y+.5)*source.height/height-.5);
    const x0=Math.max(0,Math.floor(sx)),y0=Math.max(0,Math.floor(sy)),x1=Math.min(source.width-1,x0+1),y1=Math.min(source.height-1,y0+1),fx=sx-x0,fy=sy-y0;
    const at=(/** @type {number} */ px,/** @type {number} */ py)=>(py*source.width+px)*4,out=(y*width+x)*4;
    for(let c=0;c<4;c++) {
      const v=(source.data[at(x0,y0)+c]*(1-fx)+source.data[at(x1,y0)+c]*fx)*(1-fy)+(source.data[at(x0,y1)+c]*(1-fx)+source.data[at(x1,y1)+c]*fx)*fy;
      data[out+c]=Math.round(v);
    }
    const a=data[out+3]/255;
    for(let c=0;c<3;c++)data[out+c]=Math.round(data[out+c]*a+255*(1-a));
    data[out+3]=255;
  }
  return encodePng({width,height,data});
}

// A transparent portrait sent as a reference goes over white, so its empty area is not read as black; other pictures as they are.
/** @param {Uint8Array} bytes */
function onWhite(bytes) {
  if(imageType(bytes)!=='image/png')return bytes;
  const picture=decodePng(bytes),data=new Uint8Array(picture.data);
  for(let i=0;i<data.length;i+=4){const a=data[i+3]/255;for(let c=0;c<3;c++)data[i+c]=Math.round(data[i+c]*a+255*(1-a));data[i+3]=255;}
  return encodePng({width:picture.width,height:picture.height,data});
}

/* Whether a portrait still has a background: most of its border is not clear. Read from the PNG itself, so it does not matter
 * how a transparent picture was made (NovelAI V5, a workflow that removes it, an upload). null when it cannot be read. */
/** @param {Uint8Array} bytes @returns {boolean|null} */
export function hasBackground(bytes) {
  const type=imageType(bytes);
  if(type==='image/jpeg')return true;
  if(type!=='image/png')return null;
  const {width,height,data}=decodePng(bytes);
  let opaque=0,count=0;
  // A transparent border is clear; a half-transparent haze (an edit that kept a faded backdrop) still counts as background.
  const look=(/** @type {number} */ x,/** @type {number} */ y)=>{count++;if(data[(y*width+x)*4+3]>16)opaque++;};
  for(let x=0;x<width;x+=Math.max(1,width>>6)){look(x,0);look(x,height-1);}
  for(let y=0;y<height;y+=Math.max(1,height>>6)){look(0,y);look(width-1,y);}
  return opaque>count/2;
}

// A PNG portrait is cut to the largest exact 2:3 box in the middle; other formats close to 2:3 are kept as drawn.
/** @param {Uint8Array} bytes */
function exactPortrait(bytes) {
  const {width,height}=imageSize(bytes);
  if(width*3===height*2)return bytes;
  if(imageType(bytes)!=='image/png') {
    if(isPortraitShape(width,height))return bytes;
    throw new Error(`立绘须为约 2:3（这张是 ${width}×${height}），只有 PNG 能自动裁成 2:3。`);
  }
  const k=Math.min(Math.floor(width/2),Math.floor(height/3)),w=2*k,h=3*k,x=Math.floor((width-w)/2),y=Math.floor((height-h)/2);
  const source=decodePng(bytes),data=new Uint8Array(w*h*4);
  for(let row=0;row<h;row++)data.set(source.data.subarray(((y+row)*width+x)*4,((y+row)*width+x+w)*4),row*w*4);
  return encodePng({width:w,height:h,data});
}

/**
 * @param {{preset:any,cutout:any,asset:any,image:any,base?:{bytes:Uint8Array,seed?:number|null}|null,
 *   cast?:{name:string,look:string,bytes?:Uint8Array|null}[],keys:Record<string,string>,signal?:AbortSignal,mark?:(stage:string)=>void}} job
 * cutout: 'program' or a background-removal preset, for a portrait that does not come back transparent.
 * mark: called as each stage ends, for the queue's timing log.
 * cast: a CG's main characters, each with the portrait to send when there is one; the preset takes as many as it can.
 */
export async function drawImage({preset,cutout,asset,image,base=null,cast=[],keys,signal,mark=()=>{}}) {
  const plan=planDrawing({preset,asset,image,base,cast:cast.map(c=>({name:c.name,look:c.look,picture:!!c.bytes}))});
  const pictures=cast.flatMap(c=>c.bytes?[c.bytes]:[]).slice(0,plan.references.length).map(onWhite);
  let bytes;
  if(preset.source==='novelai') {
    if(!keys.novelai)throw new Error('还没有填写 NovelAI 密钥（生图服务页）。');
    const edit=plan.mode==='edit'&&base?{image:novelaiBase(base.bytes,plan.width,plan.height),width:plan.width,height:plan.height}:null;
    const result=await novelai.generate({key:keys.novelai,preset,prompt:plan.prompt,negative:plan.negative,width:plan.width,height:plan.height,seed:plan.seed,
      base:edit,signal});
    bytes=result.image;
    mark('生成');
  } else if(preset.source==='openai') {
    const key=keys[apiSecret(preset.openai.url)]??'';
    bytes=await openai.generate({key,preset,prompt:plan.prompt,width:plan.width,height:plan.height,ratio:plan.ratio,
      images:plan.mode==='edit'&&base?[base.bytes]:pictures,signal});
    mark('生成');
  } else {
    const c=preset.comfyui,mode=plan.mode,workflow=mode==='edit'?c.edit:mode==='reference'?c.reference:c.generate;
    if(!workflow)throw new Error('这个 ComfyUI 预设还没有生图工作流。');
    const images=mode==='edit'&&base?{image:base.bytes}:Object.fromEntries(pictures.map((p,i)=>[REFERENCE_IMAGES[i],p]));
    // A reference workflow with more loaders than the cast has portraits loses the extra loaders.
    const unused=mode==='reference'?REFERENCE_IMAGES.filter(f=>c.referenceMap[f]&&!images[f]):[];
    bytes=await comfyui.run({url:c.url,workflow,map:mode==='edit'?c.editMap:mode==='reference'?c.referenceMap:c.generateMap,headers:headerOf(keys.comfyui??''),signal,images,unused,mark,
      values:{prompt:plan.prompt,negative:plan.negative,seed:plan.seed??randomSeed(),width:plan.width,height:plan.height}});
  }
  imageType(bytes);
  // A portrait that came back on a solid colour loses it as the scheme says; 'none' leaves it for later.
  const removing=plan.portrait&&cutout!=='none'&&hasBackground(bytes)===true;
  if(plan.portrait&&cutout!=='none')mark('检查背景');
  if(removing){bytes=await removeWith(cutout,bytes,keys,signal,stage=>mark(`去背·${stage}`));mark('去背');}
  if(plan.portrait){bytes=exactPortrait(bytes);mark('裁成 2:3');}
  const {width,height}=imageSize(bytes);
  return {bytes,...plan,width,height,cutoutWith:removing?(cutout==='program'?'program':presetName(cutout)):null};
}

/** A bound portrait on a solid colour, without it, cut to exactly 2:3. @param {any} cutout @param {Uint8Array} bytes @param {Record<string,string>} keys @param {AbortSignal} [signal] */
export async function cutoutPortrait(cutout,bytes,keys,signal) {
  if(hasBackground(bytes)===false)throw new Error('这张立绘已经是透明背景。');
  return exactPortrait(await removeWith(cutout,bytes,keys,signal));
}
/** @param {any} cutout @param {Uint8Array} bytes @param {Record<string,string>} keys @param {AbortSignal} [signal] @param {(stage:string)=>void} [mark] */
export async function removeWith(cutout,bytes,keys,signal,mark) {
  if(cutout==='program') {
    if(imageType(bytes)!=='image/png')throw new Error('程序去背只接受 PNG。');
    return encodePng(removeBackground(decodePng(bytes)).image);
  }
  if(cutout.source==='novelai') {
    if(!keys.novelai)throw new Error('还没有填写 NovelAI 密钥（生图服务页）。');
    return novelai.removeBackground({key:keys.novelai,image:bytes,...imageSize(bytes),signal});
  }
  if(cutout.source!=='comfyui')throw new Error('这个预设不能去背。');
  if(!cutout.comfyui.edit)throw new Error('去背预设还没有去背工作流。');
  return comfyui.run({url:cutout.comfyui.url,workflow:cutout.comfyui.edit,map:cutout.comfyui.editMap,images:{image:bytes},values:{seed:randomSeed(),...imageSize(bytes)},
    headers:headerOf(keys.comfyui??''),signal,mark});
}
