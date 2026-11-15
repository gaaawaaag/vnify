// @ts-check
/** @import {Story,Unit} from '../types/story.js' */
/** @import {DirectorRecord} from '../types/director.js' */
/** @import {Backgrounds,ImageMap,ImageType} from '../types/assets.js' */
import {directorImagePrompt} from '../core/director.js';
import {ambientsOf} from '../core/ambients.js';
// Background bindings are separate from story semantics and the .vn.txt grammar.
export const BACKGROUNDS_VERSION = 8;
export const IMAGE_LIMIT = 20 * 1024 * 1024;
// A guard against malformed packages, not a budget: how many images a book holds is the director's density setting.
export const IMAGES_PER_KIND = 4096;
export const IMAGE_TYPES = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp' };
const SCOPES = ['ambients','locations','cgs','cutIns','variants'];
// Location variants only; character variants live in the character image manifest.
const locationVariant=(story,id)=>story.entities.get(story.variantArt?.definitions.get(id)?.entityId)?.kind==='location';
/** @param {string} bookId @returns {Backgrounds} */
export function emptyBackgrounds(bookId) {
  return { version:BACKGROUNDS_VERSION, bookId, bindings:{ book:null, titleCard:null, ambients:{}, locations:{}, cgs:{}, cutIns:{}, variants:{} }, images:{} };
}
/** @param {Backgrounds|null} data @param {Unit} unit @param {Story|null} [story] */
export function resolveBackground(data, unit, story=null) {
  return backgroundCandidates(data,unit,story)[0]?.id??null;
}
/* A location's current variant image comes first; without it the location master, the block's ambient, the chapter's
 * default ambient and the book follow. Ambients need the story's director index. */
/**
 * @param {Backgrounds|null} data @param {Unit|{chapter:{id:string},block:{id?:string,loc:string|null},backgroundContext?:undefined}|undefined} unit
 * @param {Story|null} [story] @param {string|null} [variantId]
 * @returns {{id:string,kind:'location'|'fallback',locationId:string|null}[]}
 */
export function backgroundCandidates(data,unit,story=null,variantId=null) {
  if (!data || !unit) return [];
  const loc=unit.backgroundContext?.loc ?? unit.block.loc;
  const seen=new Set(),variant=loc&&variantId?data.bindings.variants?.[variantId]:null;
  const ambients=ambientsOf(story,unit).map(id=>data.bindings.ambients[id]);
  return [variant,loc&&data.bindings.locations[loc],...ambients,data.bindings.book].flatMap((id,i)=>{
    if(!id||seen.has(id)||!Object.hasOwn(data.images,id))return [];
    seen.add(id);return [{id,kind:i<2?'location':'fallback',locationId:i<2?loc:null}];
  });
}
/** Which way a work's pictures face: the larger count of wide and tall pictures (wide on a tie); null when none faces
 * either way, as in a text-only work. @param {Iterable<{width:number,height:number}>} images
 * @returns {'landscape'|'portrait'|null} */
export function imageOrientation(images) {
  let wide=0,tall=0;
  for(const {width,height} of images){if(width>height)wide++;else if(height>width)tall++;}
  return !wide&&!tall?null:tall>wide?'portrait':'landscape';
}
/** @param {any} width @param {any} height */
export function validateDimensions(width,height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1) throw new Error('图片宽高必须为正整数。');
  if (width>8192 || height>8192 || width*height>33554432) throw new Error('图片不能超过 8192 像素边长或 3200 万像素。');
}
/** @param {Uint8Array} bytes @returns {ImageType} */
export function imageType(bytes) {
  if (bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'image/png';
  if (String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP') return 'image/webp';
  throw new Error('请选择 PNG、JPEG 或 WebP 图片。');
}
/** @param {Blob} blob @returns {Promise<{blob:Blob,width:number,height:number,type:ImageType}>} */
export async function inspectImage(blob) {
  if (!(blob instanceof Blob) || !blob.size || blob.size>IMAGE_LIMIT) throw new Error('单张图片须在 20 MB 以内。');
  const type=imageType(new Uint8Array(await blob.slice(0,16).arrayBuffer()));
  const typed=blob.slice(0,blob.size,type);
  const url=URL.createObjectURL(typed);
  try {
    const img=new Image(); img.src=url;
    await img.decode();
    validateDimensions(img.naturalWidth,img.naturalHeight);
    return { blob:typed, width:img.naturalWidth, height:img.naturalHeight, type };
  } finally { URL.revokeObjectURL(url); }
}
/** @param {Backgrounds} data @returns {Backgrounds} */
export function pruneBackgrounds(data) {
  const used=new Set([data.bindings.book,data.bindings.titleCard,...SCOPES.flatMap(scope=>Object.values(data.bindings[scope]))]);
  return {...data,images:Object.fromEntries(Object.entries(data.images).filter(([id])=>used.has(id)))};
}
/* Shared raster metadata validation; decoding and content hashes are checked at ingestion.
 * An image carries its bytes (blob) while it is made or packaged, or its address on the shelf (src) while it is read. */
/** @param {any} value @returns {ImageMap} */
export function validateImages(value) {
  const fail=()=>{throw new Error('图片清单无效。');};
  if(!value || typeof value!=='object' || Array.isArray(value))fail();
  if(Object.keys(value).length>IMAGES_PER_KIND)throw new Error(`每类资产最多支持 ${IMAGES_PER_KIND} 张图片。`);
  /** @type {ImageMap} */
  const images={};
  for(const [id,img] of Object.entries(value)) {
    if(!/^[a-f0-9]{64}$/.test(id) || !img || !Object.hasOwn(IMAGE_TYPES,img.type) || typeof img.name!=='string' || img.name.length>255)fail();
    const {blob,src}=img;
    if(blob!==undefined&&(!(blob instanceof Blob)||!blob.size||blob.size>IMAGE_LIMIT))fail();
    if(src!==undefined&&typeof src!=='string')fail();
    validateDimensions(img.width,img.height);
    images[id]={name:img.name,type:img.type,width:img.width,height:img.height,...(blob?{blob}:{}),...(src?{src}:{})};
  }
  return images;
}
/** @param {any} data @param {Story} story @returns {Backgrounds} */
export function validateBackgrounds(data,story) {
  const fail=()=>{throw new Error('背景清单无效或与作品不匹配。');};
  const record=v=>v && typeof v==='object' && !Array.isArray(v);
  if (!data || data.version!==BACKGROUNDS_VERSION || data.bookId!==story.book.id || !record(data.bindings) || !record(data.images)) fail();
  if (SCOPES.some(scope=>!record(data.bindings[scope]))) fail();
  const images=validateImages(data.images);
  const reference=id=>{if(id!==null && (typeof id!=='string' || !Object.hasOwn(images,id))) fail();return id;};
  const known={
    ambients:key=>story.ambientArt?.images.has(key),
    locations:key=>story.entities.get(key)?.kind==='location',
    cgs:key=>story.cgs?.has(key),
    cutIns:key=>story.cutInArt?.images.has(key),
    variants:key=>locationVariant(story,key),
  };
  // The title card is the opening image and future shelf cover, never a reading background.
  const bindings=/** @type {Backgrounds['bindings']} */({book:reference(data.bindings.book),titleCard:reference(data.bindings.titleCard??null)});
  for(const scope of SCOPES) {
    bindings[scope]={};
    for(const [key,id] of Object.entries(data.bindings[scope])) {
      if(!known[scope](key)) fail();
      Object.defineProperty(bindings[scope],key,{value:reference(id),enumerable:true,writable:true,configurable:true});
    }
  }
  return {version:BACKGROUNDS_VERSION,bookId:data.bookId,bindings,images};
}
// A shorter manuscript with the same stable book ID can reuse its surviving bindings.
/** @param {any} data @param {Story} story @returns {Backgrounds} */
export function reconcileBackgrounds(data,story) {
  if(!data) return emptyBackgrounds(story.book.id);
  if(data.version!==BACKGROUNDS_VERSION) return emptyBackgrounds(story.book.id);
  const keep={
    ambients:id=>story.ambientArt?.images.has(id),
    locations:id=>story.entities.get(id)?.kind==='location',
    cgs:id=>story.cgs?.has(id),
    cutIns:id=>story.cutInArt?.images.has(id),
    variants:id=>locationVariant(story,id),
  };
  const bindings={...data.bindings};
  for(const scope of SCOPES)bindings[scope]=Object.fromEntries(Object.entries(data.bindings[scope]??{}).filter(([id])=>keep[scope](id)));
  return validateBackgrounds(pruneBackgrounds({...data,bindings}),story);
}
/** @param {Blob} blob @returns {Promise<string>} */
export async function imageId(blob) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
}

// Background prompts the reader may see at this position: ambients of chapters and locations already reached.
/** @param {Story} story @param {number} index @param {DirectorRecord[]} directors @param {'locations'|'ambients'} [scope] @returns {Map<string,string>} */
export function visibleBackgroundPrompts(story, index, directors, scope='locations') {
  const chapters = new Map(story.chapters.map((chapter, i) => [chapter.id, i]));
  // Every record's chapter is a chapter of this story.
  const position = (/** @type {string} */ id) => /** @type {number} */ (chapters.get(id));
  const current = position(story.units[index].chapter.id);
  const known = new Set(story.units.slice(0, index + 1).map(unit => unit.block.loc));
  const result = new Map();
  for (const doc of [...directors].sort((a,b) => position(a.chapterId)-position(b.chapterId))) {
    if (position(doc.chapterId) > current) continue;
    if (scope==='ambients') {
      for(const ambient of doc.ambients)result.set(ambient.id,directorImagePrompt(doc,ambient.prompt,'ambient'));
      continue;
    }
    for (const background of doc.backgrounds) for (const id of background.locations) if (known.has(id)) result.set(id, directorImagePrompt(doc,background.prompt));
  }
  return result;
}
