// @ts-check
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {localSoundFiles} from './sound-services.js';

/* A local audio folder as a library (docs/dev/audio.md): its MP3, M4A and OGG files, each with the credit and notes that
 * `credits.json` files in its folder and the folders above give it. A credits file holds the folder's defaults and,
 * under `tracks`, entries for single files by name:
 *   {"author":"Kevin MacLeod","license":"CC BY 4.0","url":"https://incompetech.com","notes":"…",
 *    "tracks":{"Gymnopedie No 1.mp3":{"title":"Gymnopedie No 1","notes":"calm solo piano, slow","duration":185}}}
 * A nearer folder's value wins over a farther one, and a track's own entry over its folders'. */
export const CREDITS_FILE='credits.json';
const FIELDS=['title','author','license','url','notes'];
/** @type {Map<string,Promise<unknown>>} */
const writeQueues=new Map();

/** @typedef {{file:string,title?:string,author?:string,license?:string,url?:string,notes?:string,duration?:number}} LibraryEntry */

/** The usable fields of a credits entry. @param {any} value @returns {Record<string,any>} */
function fieldsOf(value) {
  if(!value||typeof value!=='object')return {};
  /** @type {Record<string,any>} */
  const out=Object.fromEntries(FIELDS.filter(key=>typeof value[key]==='string'&&value[key].trim()).map(key=>[key,value[key].trim().slice(0,1000)]));
  if(typeof value.duration==='number'&&Number.isFinite(value.duration)&&value.duration>0)out.duration=Math.round(value.duration*10)/10;
  return out;
}

/** Every file of the folder with its credit and notes. @param {string} folder @returns {Promise<LibraryEntry[]>} */
export async function libraryEntries(folder) {
  /** @type {Map<string,any>} */
  const credits=new Map();
  /** @param {string} dir relative, '' for the folder itself */
  const creditsOf=async dir=>{
    if(!credits.has(dir)) {
      let value=null;
      try {value=JSON.parse(await readFile(path.join(folder,dir,CREDITS_FILE),'utf8'));} catch {}
      credits.set(dir,value&&typeof value==='object'?value:null);
    }
    return credits.get(dir);
  };
  /** @type {LibraryEntry[]} */
  const entries=[];
  for(const file of await localSoundFiles(folder)) {
    const parts=file.split('/'),name=/** @type {string} */(parts.pop());
    /** @type {Record<string,any>} */
    let merged={};
    for(let depth=0;depth<=parts.length;depth++) {
      const value=await creditsOf(parts.slice(0,depth).join('/'));
      merged={...merged,...fieldsOf(value)};
      if(depth===parts.length)merged={...merged,...fieldsOf(value?.tracks?.[name])};
    }
    entries.push({file,...merged});
  }
  return entries;
}

/**
 * Entries whose path, title, author or notes hold the query's words, best matches first (more words, then the name).
 * @param {LibraryEntry[]} entries @param {string} query @param {number} [limit] @param {{maxDuration?:number}} [options]
 */
export function searchEntries(entries,query,limit=20,options={}) {
  const words=String(query).toLowerCase().split(/[\s,，、_-]+/).filter(Boolean);
  if(!words.length)return [];
  const maxDuration=typeof options.maxDuration==='number'&&options.maxDuration>0?options.maxDuration:Infinity;
  return entries.filter(entry=>!(typeof entry.duration==='number'&&entry.duration>maxDuration)).map(entry=>{
    const name=entry.file.toLowerCase(),text=[name,entry.title,entry.author,entry.notes].filter(Boolean).join(' ').toLowerCase();
    return {entry,score:words.filter(word=>text.includes(word)).length+words.filter(word=>name.includes(word)).length*0.5};
  }).filter(hit=>hit.score).sort((a,b)=>b.score-a.score||a.entry.file.length-b.entry.file.length).slice(0,limit).map(hit=>hit.entry);
}

/** The source recorded for a library file: its title (else the file name), author, licence and link. @param {LibraryEntry} entry */
export function entrySource(entry) {
  return {title:entry.title||path.posix.basename(entry.file),...Object.fromEntries(['author','license','url'].filter(key=>/** @type {any} */(entry)[key])
    .map(key=>[key,/** @type {any} */(entry)[key]]))};
}

/** A clean file-name stem from a sound's title or prompt. @param {string} value @param {number} [max] */
export function safeAudioStem(value,max=60) {
  return String(value??'').replace(/\.(mp3|wav|ogg|m4a|flac|aiff?)$/i,'')
    .replace(/[<>:"/\\|?*\x00-\x1f\s]+/g,'-').replace(/-+/g,'-').replace(/^[.-]+|[.-]+$/g,'').slice(0,max);
}

/** Merge two note strings without repeating already-present phrases. @param {string} older @param {string} newer */
function mergeNotes(older,newer) {
  const parts=[];
  for(const text of [older,newer]) {
    for(const item of String(text??'').split(/\s*·\s*/).map(s=>s.trim()).filter(Boolean)) {
      if(!parts.some(existing=>existing.toLowerCase()===item.toLowerCase()))parts.push(item);
    }
  }
  return parts.join(' · ').slice(0,1000);
}

/**
 * Save a fetched or generated audio file under `folder/subDir/filename` and record its credit and search notes in that
 * subfolder's `credits.json`. Concurrent writes to the same folder are serialised.
 * @param {string} folder @param {string} subDir @param {string} filename @param {Uint8Array} bytes
 * @param {{title?:string,author?:string,license?:string,url?:string,notes?:string,duration?:number}} meta
 */
export function saveLibraryTrack(folder,subDir,filename,bytes,meta) {
  const dir=path.resolve(folder,subDir);
  const run=async()=>{
    await mkdir(dir,{recursive:true});
    const dest=path.join(dir,filename);
    const tempAudio=`${dest}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempAudio,bytes);
    await rename(tempAudio,dest);
    const creditsPath=path.join(dir,CREDITS_FILE);
    /** @type {any} */
    let data={};
    try {
      const parsed=JSON.parse(await readFile(creditsPath,'utf8'));
      if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))data=parsed;
    } catch {}
    if(!data.tracks||typeof data.tracks!=='object'||Array.isArray(data.tracks))data.tracks={};
    const prev=fieldsOf(data.tracks[filename]),next=fieldsOf(meta);
    const merged={...prev,...next};
    const notes=mergeNotes(prev.notes??'',next.notes??'');
    if(notes)merged.notes=notes;
    else delete merged.notes;
    data.tracks[filename]=merged;
    const tempCredits=`${creditsPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempCredits,JSON.stringify(data,null,2)+'\n');
    await rename(tempCredits,creditsPath);
    return path.posix.join(subDir.split(path.sep).join('/'),filename);
  };
  const next=(writeQueues.get(dir)??Promise.resolve()).catch(()=>{}).then(run);
  writeQueues.set(dir,next);
  return next;
}
