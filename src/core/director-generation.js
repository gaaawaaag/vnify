// @ts-check
/** @import {Generation} from '../types/director.js' */
/** @import {DirectorSettings} from '../types/production.js' */
// Selected controls become the effective per-request image scope.
export const DIRECTOR_IMAGE_FLAGS=['ambients','locationBackgrounds','cgs','cutIns','standing','characterVariants','locationVariants'];

/** @param {DirectorSettings} settings @returns {Generation} */
export function directorGeneration(settings) {
  const backgrounds=settings.backgrounds!==false,standing=settings.standing!==false;
  const locationBackgrounds=backgrounds&&settings.locationBackgrounds!==false;
  return {
    backgrounds,
    ambients:backgrounds&&settings.ambients!==false,
    locationBackgrounds,
    cgs:backgrounds&&settings.cgs!==false,
    cutIns:settings.cutIns===true,
    standing,
    // Variants are off unless asked for, and only for image kinds that are made.
    characterVariants:standing&&settings.characterVariants===true,
    locationVariants:locationBackgrounds&&settings.locationVariants===true,
  };
}

// The title card belongs to the whole-book design, so chapter records do not carry it.
export const titleCardEnabled=(/** @type {DirectorSettings} */ settings)=>settings.backgrounds!==false&&settings.titleCard!==false;
// The end card's picture, also from the whole-book design, is made only when asked for.
export const endCardEnabled=(/** @type {DirectorSettings} */ settings)=>settings.backgrounds!==false&&settings.endCard===true;

/** @param {any} value @returns {Generation} */
export function validateDirectorGeneration(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Director 需要 generation。');
  for(const key of ['backgrounds',...DIRECTOR_IMAGE_FLAGS])if(typeof value[key]!=='boolean')throw new Error(`Director 制作用途 ${key} 须为布尔值。`);
  if(!value.backgrounds&&['ambients','locationBackgrounds','cgs'].some(k=>value[k]))throw new Error('背景总开关关闭时须关闭各背景用途。');
  if(value.characterVariants&&!value.standing)throw new Error('人物差分需要开启人物立绘。');
  if(value.locationVariants&&!value.locationBackgrounds)throw new Error('地点差分需要开启地点背景。');
  return /** @type {Generation} */(Object.fromEntries(['backgrounds',...DIRECTOR_IMAGE_FLAGS].map(key=>[key,value[key]])));
}
