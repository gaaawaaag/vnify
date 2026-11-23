// @ts-check
import {readdir,stat} from 'node:fs/promises';
import path from 'node:path';

/* Where sound effects come from (docs/dev/audio.md), kept in sound-services.json beside image-presets.json: Freesound's
 * licence choice (its token lives with the other keys in the user's folder), a local sound folder and a local music
 * folder (searched by file name and credits.json notes, src/production/local-library.js). Generating effects is an audio
 * preset's job (music-presets.js).
 * CC0 and CC-BY are used by default; CC-BY-NC only when chosen. */
export const SOUND_SERVICES_VERSION=1;
/** @type {Record<string,{name:string,label:string}>} */
export const LICENSES={cc0:{name:'Creative Commons 0',label:'CC0'},by:{name:'Attribution',label:'CC-BY'},nc:{name:'Attribution NonCommercial',label:'CC-BY-NC'}};
export const LOCAL_TYPES=new Set(['.mp3','.m4a','.ogg']);
const FILE_LIMIT=20000;

/** @typedef {{version:1,freesound:{licenses:string[]},local:{folder:string},music:{folder:string}}} SoundServices */

/** @param {unknown} raw @returns {SoundServices} */
export function validateSoundServices(raw) {
  if(raw===null||raw===undefined)return {version:SOUND_SERVICES_VERSION,freesound:{licenses:['cc0','by']},local:{folder:''},music:{folder:''}};
  const file=/** @type {any} */(raw);
  if(!file||typeof file!=='object'||file.version!==SOUND_SERVICES_VERSION)throw new Error('sound-services.json 版本或格式不对。');
  const licenses=file.freesound?.licenses??['cc0','by'];
  if(!Array.isArray(licenses)||!licenses.length||licenses.some(code=>!Object.hasOwn(LICENSES,code)))throw new Error('Freesound 许可证选择无效。');
  const folder=file.local?.folder??'';
  if(typeof folder!=='string'||folder.length>1000)throw new Error('本地音效文件夹无效。');
  const musicFolder=file.music?.folder??'';
  if(typeof musicFolder!=='string'||musicFolder.length>1000)throw new Error('本地音乐文件夹无效。');
  // Older files kept ElevenLabs' effect settings here; they are an effects preset's now and are dropped.
  return {version:SOUND_SERVICES_VERSION,freesound:{licenses:[...new Set(licenses)]},local:{folder:folder.trim()},music:{folder:musicFolder.trim()}};
}

/** The licence's short label from a Freesound name or a Creative Commons link. @param {string} value */
export function licenseLabel(value) {
  const text=String(value??'');
  if(/publicdomain\/zero|Creative Commons 0/i.test(text))return 'CC0';
  if(/by-nc|NonCommercial/i.test(text))return 'CC-BY-NC';
  if(/licenses\/by\/|^Attribution$/i.test(text))return 'CC-BY';
  return text;
}

/** The audio files under a folder (relative paths with forward slashes), up to a limit. @param {string} folder */
export async function localSoundFiles(folder) {
  /** @type {string[]} */
  const found=[];
  if(!folder)return found;
  const info=await stat(folder).catch(()=>null);
  if(!info?.isDirectory())throw new Error('本地音效文件夹不存在。');
  for(const entry of await readdir(folder,{recursive:true,withFileTypes:true})) {
    if(!entry.isFile()||!LOCAL_TYPES.has(path.extname(entry.name).toLowerCase()))continue;
    found.push(path.relative(folder,path.join(entry.parentPath,entry.name)).split(path.sep).join('/'));
    if(found.length>=FILE_LIMIT)break;
  }
  return found;
}

/** Files whose names hold the query's words, best matches first. @param {string[]} files @param {string} query @param {number} [limit] */
export function searchLocal(files,query,limit=20) {
  const words=String(query).toLowerCase().split(/[\s,，、_-]+/).filter(Boolean);
  if(!words.length)return [];
  return files.map(file=>{
    const name=file.toLowerCase();
    return {file,score:words.filter(word=>name.includes(word)).length};
  }).filter(hit=>hit.score).sort((a,b)=>b.score-a.score||a.file.length-b.file.length).slice(0,limit).map(hit=>hit.file);
}

/** A path inside the folder, or null when it leaves it or is not a sound file. @param {string} folder @param {string} relative */
export function localSoundPath(folder,relative) {
  if(!folder||typeof relative!=='string'||!relative)return null;
  const full=path.resolve(folder,relative),root=path.resolve(folder);
  if(full!==root&&!full.startsWith(root+path.sep))return null;
  return LOCAL_TYPES.has(path.extname(full).toLowerCase())?full:null;
}
