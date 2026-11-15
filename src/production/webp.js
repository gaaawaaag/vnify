// @ts-check
/** @import {Backgrounds,CharacterImages,Extra,ImageMap,ImageRecord} from '../types/assets.js' */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {imageId} from '../reader/backgrounds.js';

/* Images go into a package as WebP: the workspace keeps the pictures as they were made (PNG for cutouts, edits and crops),
 * and exporting converts each PNG or JPEG once per quality, cached by its ID. A picture that comes out no smaller stays as
 * it is; WebP stays as it is. The new IDs replace the old ones everywhere the bindings name them. sharp is loaded only
 * here, so the player, the cloud shelf and a production kit without it run as before (images then stay as they are). */

/** @typedef {{format:'webp'|'original',quality:number}} ExportImages */
export const DEFAULT_EXPORT_IMAGES=/** @type {ExportImages} */({format:'webp',quality:88});
/** The work's setting (exportImages in its director project); missing is the default. @param {unknown} value @returns {ExportImages} */
export function validateExportImages(value) {
  if(value==null)return {...DEFAULT_EXPORT_IMAGES};
  const v=/** @type {any} */(value);
  if(typeof v!=='object'||!['webp','original'].includes(v.format)||!Number.isInteger(v.quality)||v.quality<50||v.quality>100)
    throw new Error('导出图片设置需要 format（webp／original）与 50–100 的整数 quality。');
  return {format:v.format,quality:v.quality};
}

/** @type {Promise<any>|null} */
let loading=null;
// A failed load is not kept, so sharp installed while the manager runs is picked up by the next export.
const sharp=()=>loading??=import('sharp').then(m=>m.default,()=>{loading=null;return null;});
export const sharpAvailable=async()=>!!await sharp();
/**
 * Installs sharp into the production environment (the version its package.json names) without changing package.json.
 * @param {string} root @returns {Promise<void>}
 */
export async function installSharp(root) {
  const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  const version=String(pkg.optionalDependencies?.sharp??pkg.dependencies?.sharp??'latest');
  if(!/^[\w.^~-]+$/.test(version))throw new Error(`package.json 中的 sharp 版本无法识别：${version}`);
  // The last lines of npm's output say why it failed.
  const tail=(/** @type {string} */ log,/** @type {number} */ n)=>log.trim().split(/\r?\n/).slice(-n).map(l=>l.trim()).join(' ');
  const output=await new Promise((resolve,reject)=>{
    // npm is a .cmd on Windows, which only runs through a shell; the arguments are fixed apart from the checked version.
    const child=spawn(`npm install sharp@${version} --no-save --no-audit --no-fund`,{cwd:root,shell:true,windowsHide:true});
    let log='';
    child.stdout.on('data',d=>{log+=d;});child.stderr.on('data',d=>{log+=d;});
    child.on('error',()=>reject(new Error('无法运行 npm：请确认已安装 Node.js（自带 npm），或在本目录手动运行 npm install。')));
    child.on('close',code=>code===0?resolve(log):reject(new Error(`npm install sharp 失败（${code}）：${tail(log,6)}`)));
  });
  if(!await sharp())throw new Error(`npm 已运行，但仍无法加载 sharp：${tail(String(output),3)}`);
}
const CONCURRENCY=4;

/** @param {ImageRecord} img */
const bytesOf=async img=>{
  if(!img.blob)throw new Error('导出需要图片数据。');
  return new Uint8Array(await img.blob.arrayBuffer());
};
// Each string in a binding that is an old ID becomes the new one (IDs are 64 hex digits, nothing else looks like them).
/** @param {unknown} value @param {Map<string,string>} ids @returns {any} */
const renamed=(value,ids)=>typeof value==='string'?ids.get(value)??value
  :Array.isArray(value)?value.map(v=>renamed(v,ids))
    :value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,renamed(v,ids)])):value;

/**
 * The images of a work as they go into its package.
 * @template {{backgrounds:Backgrounds,characterImages:CharacterImages|null,extra:Extra<ImageRecord>|null}} T
 * @param {T} work @param {ExportImages} settings @param {string} cacheDir
 * @returns {Promise<T&{stats:{converted:number,kept:number,saved:number,unavailable:boolean}}>}
 */
export async function packageImages(work,settings,cacheDir) {
  const stats={converted:0,kept:0,saved:0,unavailable:false};
  if(settings.format==='original')return {...work,stats};
  const maps=[work.backgrounds.images,work.characterImages?.images??{},work.extra?.images??{}];
  const pending=maps.flatMap(map=>Object.entries(map)).filter(([,img])=>img.type!=='image/webp');
  if(!pending.length)return {...work,stats};
  const encoder=await sharp();
  if(!encoder)return {...work,stats:{...stats,unavailable:true}};
  await mkdir(cacheDir,{recursive:true});
  /** @type {Map<string,{record:ImageRecord,id:string}>} */
  const done=new Map();
  const convert=async(/** @type {string} */ id,/** @type {ImageRecord} */ img)=>{
    const cached=path.join(cacheDir,`${id}-q${settings.quality}.webp`),keep=`${cached}.keep`;
    if(await readFile(keep).then(()=>true,()=>false)){stats.kept++;return;}
    const original=await bytesOf(img);
    let webp=await readFile(cached).then(b=>new Uint8Array(b),()=>null);
    if(!webp) {
      // A picture sharp cannot read (a PNG the player still shows) goes in as it is, like one that would not shrink.
      webp=await encoder(original).webp({quality:settings.quality}).toBuffer().then((/** @type {Buffer} */ b)=>new Uint8Array(b),()=>null);
      if(!webp||webp.length>=original.length){await writeFile(keep,'');stats.kept++;return;}
      await writeFile(cached,webp);
    }
    const blob=new Blob([/** @type {BlobPart} */(webp)],{type:'image/webp'});
    done.set(id,{id:await imageId(blob),record:{...img,type:'image/webp',name:img.name.replace(/\.(png|jpe?g)$/i,'')+'.webp',blob}});
    stats.converted++;stats.saved+=original.length-webp.length;
  };
  for(let i=0;i<pending.length;i+=CONCURRENCY)await Promise.all(pending.slice(i,i+CONCURRENCY).map(([id,img])=>convert(id,img)));
  const ids=new Map([...done].map(([old,{id}])=>[old,id]));
  /** @param {ImageMap} map @returns {ImageMap} */
  const images=map=>Object.fromEntries(Object.entries(map).map(([id,img])=>done.has(id)?[ids.get(id),done.get(id)?.record]:[id,img]));
  const {backgrounds,characterImages,extra}=work;
  return {...work,stats,
    backgrounds:{...backgrounds,bindings:renamed(backgrounds.bindings,ids),images:images(backgrounds.images)},
    characterImages:characterImages&&{...characterImages,bindings:renamed(characterImages.bindings,ids),images:images(characterImages.images)},
    extra:extra&&{...renamed({...extra,images:{}},ids),images:images(extra.images)}};
}
