// @ts-check
/** @import {Backgrounds,CharacterImages,Extra,ImageMap,ImageRecord,PackageManifest,StoryBundle} from '../types/assets.js' */
import {readDirectors} from '../core/director.js';
import { readZip,writeZip } from '../core/zip-store.js';
import { emptyBackgrounds,validateBackgrounds,pruneBackgrounds,IMAGE_TYPES,imageType,imageId,IMAGES_PER_KIND,BACKGROUNDS_VERSION } from './backgrounds.js';
import {emptyCharacterImages,validateCharacterImages,pruneCharacterImages,CHARACTER_IMAGES_VERSION} from './character-images.js';
export const PACKAGE_VERSION=13;
import {emptyExtra,hasExtra,validateExtra} from '../core/extra.js';
import { parseScript } from '../core/parser.js';
import { compileCharacters } from './character-data.js';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
// Packaging needs every image's bytes; a manifest read from the shelf has addresses instead.
/** @param {ImageRecord} img */
function bytesOf(img) {
  if(!img.blob)throw new Error('作品包需要图片数据。');
  return img.blob.arrayBuffer().then(buffer=>new Uint8Array(buffer));
}
// The package's files as [path,bytes]; the library stores the same tree unpacked.
/**
 * @param {string} raw @param {Backgrounds} backgrounds
 * @param {{complete?:boolean,characterImages?:CharacterImages|null,extra?:Extra<ImageRecord>|null}} [options]
 * @returns {Promise<[string,Uint8Array][]>}
 */
export async function packageEntries(raw,backgrounds,{complete=true,characterImages=null,extra=null}={}) {
  const story=parseScript(raw);readDirectors(raw,story);
  const data=validateBackgrounds(pruneBackgrounds(backgrounds),story);
  const characters=pruneCharacterImages(validateCharacterImages(characterImages??emptyCharacterImages(story.book.id),story));
  /** @type {Extra<ImageRecord>} */
  const extras=extra?validateExtra(extra):emptyExtra();
  readDirectors(raw,story);
  compileCharacters(raw,story,{complete});
  const script=encoder.encode(raw);if(script.length>10*1024*1024)throw new Error('正文须在 10 MB 以内。');
  /** @type {PackageManifest} */
  const manifest={format:'vn-package',version:PACKAGE_VERSION,bookId:story.book.id,script:'story.vn.txt',complete,extra:hasExtra(extras)?'extra.json':null,
    backgrounds:{version:data.version,bindings:data.bindings,images:{}},
    characterImages:{version:characters.version,bindings:characters.bindings,images:{}}};
  /** @type {[string,Uint8Array][]} */
  const entries=[['story.vn.txt',script]];
  if(manifest.extra) {
    // extra.json carries the image metadata with paths; the bytes sit under assets/extra/.
    const images={};
    for(const [id,img] of Object.entries(extras.images)) {
      const path=`assets/extra/${id}.${IMAGE_TYPES[img.type]}`;
      images[id]={path,name:img.name,...(img.caption?{caption:img.caption}:{}),type:img.type,width:img.width,height:img.height};
      entries.push([path,await bytesOf(img)]);
    }
    entries.push([manifest.extra,encoder.encode(JSON.stringify({...extras,images}))]);
  }
  for(const [id,img] of Object.entries(data.images)) {
    const path=`assets/backgrounds/${id}.${IMAGE_TYPES[img.type]}`;
    manifest.backgrounds.images[id]={path,name:img.name,type:img.type,width:img.width,height:img.height};
    entries.push([path,await bytesOf(img)]);
  }
  for(const [id,img] of Object.entries(characters.images)) {
    const path=`assets/characters/${id}.${IMAGE_TYPES[img.type]}`;
    manifest.characterImages.images[id]={path,name:img.name,type:img.type,width:img.width,height:img.height};
    entries.push([path,await bytesOf(img)]);
  }
  entries.unshift(['manifest.json',encoder.encode(JSON.stringify(manifest,null,2))]);
  return entries;
}
/** @param {string} raw @param {Backgrounds} backgrounds @param {Parameters<typeof packageEntries>[2]} [options] */
export async function exportStoryPackage(raw,backgrounds,options={}) {
  return writeZip(await packageEntries(raw,backgrounds,options));
}
/** @typedef {(path:string,id:string,meta:any)=>Promise<{blob?:Blob,src?:string}>} ReadImage */
/** @typedef {{text:(name:string,limit:number)=>Promise<string|null>,image:ReadImage}} PackageSource */
// Every packaged image is declared once under its SHA-256; `read` checks its file and gives what the caller keeps of it.
/**
 * @param {any} source @param {'backgrounds'|'characters'|'extra'} folder @param {ReadImage} read
 * @param {Set<string>} expected @param {ImageMap} target
 */
async function readImages(source,folder,read,expected,target) {
  if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).length>IMAGES_PER_KIND)throw new Error('图片清单无效。');
  for(const [id,img] of Object.entries(source)) {
    const path=`assets/${folder}/${id}.${IMAGE_TYPES[img?.type]}`;
    if(!/^[a-f0-9]{64}$/.test(id)||!img||!Object.hasOwn(IMAGE_TYPES,img.type)||img.path!==path)throw new Error('无效图片路径。');
    expected.add(path);
    target[id]={name:img.name,...(img.caption!==undefined?{caption:img.caption}:{}),type:img.type,width:img.width,height:img.height,
      ...await read(path,id,img)};
  }
}
/* A package from its files, wherever they are: an archive, an upload to the shelf, or the shelf itself.
 * Checks the manifest, the text and every binding against the text; `files` lists every file the package declares. */
/** @param {PackageSource} source @param {{strictSources?:boolean}} [options] */
export async function readPackage(source,{strictSources=false}={}) {
  const manifest=await source.text('manifest.json',16*1024*1024),raw=await source.text('story.vn.txt',10*1024*1024);
  if(manifest===null||raw===null)throw new Error('作品包缺少清单或正文，或文件过大。');
  const m=JSON.parse(manifest);
  const invalid=m.format!=='vn-package'||m.version!==PACKAGE_VERSION||m.script!=='story.vn.txt'||typeof m.complete!=='boolean'
    ||![null,'extra.json'].includes(m.extra)
    ||m.backgrounds?.version!==BACKGROUNDS_VERSION||!m.backgrounds.images||!m.backgrounds.bindings
    ||m.characterImages?.version!==CHARACTER_IMAGES_VERSION||!m.characterImages.images||!m.characterImages.bindings;
  if(invalid)throw new Error('不支持的作品包版本或清单。');
  const story=parseScript(raw,{strictSources});
  readDirectors(raw,story);
  compileCharacters(raw,story,{complete:m.complete});
  if(m.bookId!==story.book.id)throw new Error('作品包与正文书籍 ID 不一致。');
  const data=emptyBackgrounds(m.bookId);data.bindings=m.backgrounds.bindings;
  const characters=emptyCharacterImages(m.bookId);characters.bindings=m.characterImages.bindings;
  const expected=new Set(['manifest.json','story.vn.txt']);
  /** @type {Extra<ImageRecord>} */
  let extra=emptyExtra();
  if(m.extra) {
    const text=await source.text(m.extra,8*1024*1024);
    if(text===null)throw new Error('作品包缺少 Extra 内容，或文件过大。');
    /** @type {ImageMap} */
    const record=JSON.parse(text),images={};
    await readImages(record?.images,'extra',source.image,expected,images);
    extra=validateExtra(/** @type {Extra<ImageRecord>} */({...record,images}));
    if(!hasExtra(extra)||Object.keys(extra.images).length!==Object.keys(images).length)
      throw new Error('作品包的 Extra 内容为空或含未使用图片。');
    expected.add(m.extra);
  }
  await readImages(m.backgrounds.images,'backgrounds',source.image,expected,data.images);
  await readImages(m.characterImages.images,'characters',source.image,expected,characters.images);
  return {raw,story,complete:/** @type {boolean} */(m.complete),files:expected,
    backgrounds:validateBackgrounds(data,story),characterImages:validateCharacterImages(characters,story),extra};
}
/**
 * @param {Blob} file @param {{strictSources?:boolean,inspectImage?:(blob:Blob)=>Promise<{width:number,height:number}>}} [options]
 * @returns {Promise<StoryBundle>}
 */
export async function importStoryPackage(file,{strictSources=false,inspectImage}={}) {
  const files=readZip(new Uint8Array(await file.arrayBuffer()));
  /** @type {PackageSource} */
  const source={
    text:async(name,limit)=>{const bytes=files.get(name);return bytes&&bytes.length<=limit?decoder.decode(bytes):null;},
    image:async(path,id,img)=>{
      const bytes=files.get(path);if(!bytes)throw new Error('作品包缺少图片。');
      if(imageType(bytes)!==img.type)throw new Error('图片格式与清单不一致。');
      const blob=new Blob([bytes],{type:img.type});
      if(await imageId(blob)!==id)throw new Error('图片校验失败。');
      return {blob};
    },
  };
  const {raw,complete,files:declared,backgrounds,characterImages,extra}=await readPackage(source,{strictSources});
  if([...files.keys()].some(name=>!declared.has(name)))throw new Error('作品包包含未声明的文件。');
  const images=[...Object.values(backgrounds.images),...Object.values(characterImages.images),...Object.values(extra.images)];
  if(inspectImage) for(const img of images) {
    const actual=await inspectImage(/** @type {Blob} */(img.blob));
    if(actual.width!==img.width || actual.height!==img.height)throw new Error('图片尺寸与清单不一致。');
  }
  return /** @type {StoryBundle} */({raw,backgrounds,characterImages,extra,complete});
}
/* A package on the shelf, opened for reading: its manifests with each image's address (url(path)) in place of its bytes.
 * The shelf checked the whole package when it was imported; the reader checks the bindings against the text again. */
/** @param {string} manifestText @param {string|null} extraText @param {(path:string)=>string} url */
export function linkPackage(manifestText,extraText,url) {
  const m=JSON.parse(manifestText);
  if(m.format!=='vn-package'||m.version!==PACKAGE_VERSION||typeof m.complete!=='boolean')throw new Error('不支持的作品包版本或清单。');
  /** @returns {ImageMap} */
  const link=images=>Object.fromEntries(Object.entries(images??{}).map(([id,img])=>[id,{name:img.name,
    ...(img.caption!==undefined?{caption:img.caption}:{}),type:img.type,width:img.width,height:img.height,src:url(img.path)}]));
  const extra=extraText===null?null:JSON.parse(extraText);
  return {complete:/** @type {boolean} */(m.complete),
    backgrounds:{version:m.backgrounds?.version,bookId:m.bookId,bindings:m.backgrounds?.bindings,images:link(m.backgrounds?.images)},
    characterImages:{version:m.characterImages?.version,bookId:m.bookId,bindings:m.characterImages?.bindings,images:link(m.characterImages?.images)},
    extra:extra&&{...extra,images:link(extra.images)}};
}
