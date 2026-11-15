// @ts-check
/** @import {Story} from '../types/story.js' */
/** @import {AvatarCrop,CharacterImages,CharacterSlots,Flip,ImageMap,Portrait} from '../types/assets.js' */
import {validateImages} from './backgrounds.js';
import {REFERENCE} from './figure-layout.js';
import {isPortraitShape} from './portrait-shape.js';
export {isPortraitShape};

/** @param {unknown} value @returns {value is Record<string,any>} */
const record=value=>!!value && typeof value==='object' && !Array.isArray(value);
/** @param {object} target @param {string} key @param {unknown} value */
const define=(target,key,value)=>Object.defineProperty(target,key,{value,enumerable:true,writable:true,configurable:true});
/* Character images v5: each look of a character (the default one and each variant) has one transparent standing
 * portrait; the square avatar is cut from it, by a saved crop or around the head. */
export const CHARACTER_IMAGES_VERSION=5;
/** @param {string} bookId @returns {CharacterImages} */
export function emptyCharacterImages(bookId) {
  return {version:CHARACTER_IMAGES_VERSION,bookId,bindings:{},images:{}};
}

// Source-image pixel coordinates. Keeping the original makes every crop reversible.
/** @param {any} crop @param {{width:number,height:number}} image @returns {AvatarCrop} */
export function validateAvatarCrop(crop,image) {
  if(!record(crop) || !['x','y','size'].every(key=>Number.isFinite(crop[key])) || crop.x<0 || crop.y<0 || crop.size<=0 || crop.x+crop.size>image.width || crop.y+crop.size>image.height)
    throw new Error('头像裁切范围须为原图内的正方形。');
  return {x:crop.x,y:crop.y,size:crop.size};
}
/** @param {{type:string,width:number,height:number}} image */
export function validatePortraitImage(image) {
  if(!['image/png','image/webp'].includes(image.type)||!isPortraitShape(image.width,image.height))
    throw new Error('立绘须为约 2:3 的 PNG 或 WebP 图片。');
}
// A portrait may be mirrored while it stands on the left or on the right of the stage, or never ('none').
// Portraits are drawn turned toward the viewer's right, so an absent flip mirrors them on the right to face the middle.
/** @type {Flip[]} */
export const FLIPS=['none','left','right'];
/** @type {Flip} */
export const DEFAULT_FLIP='right';
/* The square avatar cut from a portrait: the saved crop, else a head-and-shoulders square, from a little above the
 * hair to about the collarbone (AVATAR_HEADS head heights tall), with a tall portrait taken as the standard cowboy shot;
 * other images give their top square. */
const AVATAR_HEADS=5/3,AVATAR_HEADROOM=.2;
/** @param {{width:number,height:number}} image @param {{crop?:AvatarCrop}} [portrait] @returns {AvatarCrop} */
export function portraitAvatarCrop(image,{crop}={}) {
  if(crop)return {...crop};
  const {width,height}=image;
  if(height<=width)return {x:(width-height)/2,y:0,size:height};
  const span=REFERENCE.head*height,size=Math.min(width,span*AVATAR_HEADS);
  return {x:(width-size)/2,y:Math.max(0,REFERENCE.top*height-span*AVATAR_HEADROOM),size};
}
/** @param {CharacterSlots} slots @returns {Portrait[]} */
export const characterPortraits=slots=>[slots.standing,...Object.values(slots.variants??{})].filter(p=>!!p);
/** @param {Story} story @param {string} characterId @param {string} variantId */
const variantOf=(story,characterId,variantId)=>story.variantArt?.definitions.get(variantId)?.entityId===characterId;

// Head positions (figure) from older manifests are no longer used: they are read and dropped.
/** @param {unknown} portrait @param {ImageMap} images @param {()=>never} fail @returns {Portrait} */
function validatePortrait(portrait,images,fail) {
  if(!record(portrait)||Object.keys(portrait).some(k=>!['imageId','figure','flip','crop'].includes(k))||!Object.hasOwn(images,portrait.imageId))fail();
  if(portrait.flip!==undefined&&!FLIPS.includes(portrait.flip))fail();
  const image=images[portrait.imageId];
  validatePortraitImage(image);
  return {imageId:portrait.imageId,...(portrait.flip?{flip:portrait.flip}:{}),
    ...(portrait.crop!==undefined?{crop:validateAvatarCrop(portrait.crop,image)}:{})};
}

/** @param {any} data @param {Story} story @returns {CharacterImages} */
export function validateCharacterImages(data,story) {
  /** @returns {never} */
  const fail=()=>{throw new Error('角色图片清单无效或与作品不匹配。');};
  if(!record(data) || data.version!==CHARACTER_IMAGES_VERSION || data.bookId!==story.book.id || !record(data.bindings))fail();
  const images=validateImages(data.images),bindings={};
  for(const [id,slots] of Object.entries(data.bindings)) {
    if(story.entities.get(id)?.kind!=='character' || !record(slots) || Object.keys(slots).some(k=>!['standing','variants'].includes(k)))fail();
    /** @type {CharacterSlots} */
    const value={};
    if(slots.standing!==undefined)value.standing=validatePortrait(slots.standing,images,fail);
    if(slots.variants!==undefined) {
      if(!record(slots.variants))fail();
      const variants={};
      for(const [variantId,portrait] of Object.entries(slots.variants)) {
        if(!variantOf(story,id,variantId))fail();
        define(variants,variantId,validatePortrait(portrait,images,fail));
      }
      if(Object.keys(variants).length)value.variants=variants;
    }
    if(!characterPortraits(value).length)fail();
    define(bindings,id,value);
  }
  return {version:CHARACTER_IMAGES_VERSION,bookId:data.bookId,bindings,images};
}
/** @param {CharacterImages} data @returns {CharacterImages} */
export function pruneCharacterImages(data) {
  const used=new Set(Object.values(data.bindings).flatMap(slots=>characterPortraits(slots).map(p=>p.imageId)));
  return {...data,images:Object.fromEntries(Object.entries(data.images).filter(([id])=>used.has(id)))};
}
// Bindings for removed characters or variants drop out; a stored manifest of another version is unusable.
/** @param {any} data @param {Story} story @returns {CharacterImages} */
export function reconcileCharacterImages(data,story) {
  if(!data||data.version!==CHARACTER_IMAGES_VERSION)return emptyCharacterImages(story.book.id);
  const bindings={};
  for(const [id,slots] of Object.entries(data.bindings || {})) {
    if(story.entities.get(id)?.kind!=='character'||!record(slots))continue;
    const variants=Object.fromEntries(Object.entries(slots.variants??{}).filter(([key])=>variantOf(story,id,key)));
    /** @type {CharacterSlots} */
    const value={...(slots.standing?{standing:slots.standing}:{}),...(Object.keys(variants).length?{variants}:{})};
    if(characterPortraits(value).length)define(bindings,id,value);
  }
  return validateCharacterImages(pruneCharacterImages({...data,bindings}),story);
}

/* Binds (or with a null image removes) one look's portrait; the default look when variantId is null.
 * Rebinding the same image keeps its flip and crop unless new ones are given. */
/**
 * @param {CharacterImages} data @param {Story} story @param {string} characterId @param {string|null} imageKey
 * @param {string|null} [variantId] @param {{flip?:Flip|null,crop?:AvatarCrop|null}} [options]
 * @returns {CharacterImages}
 */
export function bindCharacterPortrait(data,story,characterId,imageKey,variantId=null,{flip=null,crop=null}={}) {
  if(story.entities.get(characterId)?.kind!=='character')throw new Error('人物图片只能绑定到本作品的角色。');
  if(variantId!==null&&!variantOf(story,characterId,variantId))throw new Error('差分不属于该人物。');
  if(imageKey!==null&&!Object.hasOwn(data.images,imageKey))throw new Error('立绘原图不存在。');
  if(flip!==null&&!FLIPS.includes(flip))throw new Error('立绘翻转须为 none、left 或 right。');
  const slots={...data.bindings[characterId]},variants={...slots.variants};
  const previous=variantId===null?slots.standing:variants[variantId],kept=previous?.imageId===imageKey?previous:undefined;
  /** @type {Portrait|null} */
  let portrait=null;
  if(imageKey!==null) {
    validatePortraitImage(data.images[imageKey]);
    const side=flip??kept?.flip;
    const square=crop?validateAvatarCrop(crop,data.images[imageKey]):kept?.crop;
    portrait={imageId:imageKey,...(side?{flip:side}:{}),...(square?{crop:square}:{})};
  }
  if(variantId===null) {if(portrait)slots.standing=portrait;else delete slots.standing;}
  else if(portrait)variants[variantId]=portrait;
  else delete variants[variantId];
  /** @type {CharacterSlots} */
  const value={...(slots.standing?{standing:slots.standing}:{}),...(Object.keys(variants).length?{variants}:{})};
  const next={...data,bindings:{...data.bindings}};
  if(characterPortraits(value).length)define(next.bindings,characterId,value);else delete next.bindings[characterId];
  return validateCharacterImages(pruneCharacterImages(next),story);
}

// A variant look falls back on the default one. The caller supplies the disclosed Cast IDs, never all declared characters.
/** @param {CharacterImages|null} data @param {string} characterId @param {Set<string>} visibleCharacterIds @param {string|null} [variantId] */
function resolvePortrait(data,characterId,visibleCharacterIds,variantId=null) {
  if(!data||!visibleCharacterIds.has(characterId)||!Object.hasOwn(data.bindings,characterId))return null;
  const slots=data.bindings[characterId],portrait=(variantId?slots.variants?.[variantId]:null)??slots.standing;
  const image=portrait&&data.images[portrait.imageId];
  return portrait&&image?{...portrait,image}:null;
}
/** @param {CharacterImages|null} data @param {string} characterId @param {Set<string>} visibleCharacterIds @param {string|null} [variantId] */
export function resolveCharacterAvatar(data,characterId,visibleCharacterIds,variantId=null) {
  const portrait=resolvePortrait(data,characterId,visibleCharacterIds,variantId);
  return portrait?{imageId:portrait.imageId,crop:portraitAvatarCrop(portrait.image,portrait),image:portrait.image}:null;
}
// The standing portrait (kind 'standing'), or with includeStanding false the avatar cut from it.
/**
 * @param {CharacterImages|null} data @param {string} characterId @param {Set<string>} visibleCharacterIds
 * @param {string|null} [variantId] @param {{includeStanding?:boolean}} [options]
 */
export function resolveCharacterImage(data,characterId,visibleCharacterIds,variantId=null,{includeStanding=true}={}) {
  const portrait=includeStanding?resolvePortrait(data,characterId,visibleCharacterIds,variantId):null;
  return portrait?{...portrait,kind:'standing'}:resolveCharacterAvatar(data,characterId,visibleCharacterIds,variantId);
}
