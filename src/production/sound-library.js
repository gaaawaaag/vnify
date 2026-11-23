// @ts-check
import {createHash} from 'node:crypto';
import {readFile,writeFile,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import {validateSoundServices,localSoundFiles,localSoundPath} from './sound-services.js';
import {libraryEntries,searchEntries,entrySource,safeAudioStem,saveLibraryTrack} from './local-library.js';
import {getSecret} from './secrets.js';
import * as freesound from './generators/freesound.js';
import {soundEffect} from './generators/elevenlabs-voice.js';
import {validateMusicPresets,musicPresetName} from './music-presets.js';

/* Sound effect libraries for the asset manager and the command line (docs/dev/audio.md): the settings in
 * sound-services.json at the production root, searching Freesound and the local folder together, and taking a hit's
 * bytes with where it came from — or a sound an effects preset (ElevenLabs) generates from a description. Downloaded
 * Freesound effects and generated effects are saved into the local effects library (defaulting to
 * data/audio-library/sounds) so later works can find and reuse them locally. */
const failure=(/** @type {number} */ status,/** @type {string} */ message)=>Object.assign(new Error(message),{status});
export const DEFAULT_LOCAL_SOUNDS_SUBDIR=path.join('data','audio-library','sounds');

/** @param {string} root the production environment */
export function createSoundLibrary(root) {
  const file=path.join(root,'sound-services.json');
  const defaultSoundsFolder=path.join(root,DEFAULT_LOCAL_SOUNDS_SUBDIR);
  async function read() {
    let raw=null;
    try {raw=JSON.parse(await readFile(file,'utf8'));}
    catch(/** @type {any} */ error) {if(error.code!=='ENOENT')throw failure(500,'sound-services.json 无法读取，请检查文件内容。');}
    return validateSoundServices(raw);
  }
  // The audio presets (music-presets.json beside this file); an effects preset generates sounds.
  async function audioPresets() {
    let raw=null;
    try {raw=JSON.parse(await readFile(path.join(root,'music-presets.json'),'utf8'));}
    catch(/** @type {any} */ error) {if(error.code!=='ENOENT')throw failure(500,'music-presets.json 无法读取，请检查文件内容。');}
    return validateMusicPresets(raw).presets;
  }
  /** @param {unknown} value */
  async function write(value) {
    let services;
    try {services=validateSoundServices(value);} catch(/** @type {any} */ error) {throw failure(400,error.message);}
    const temp=`${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp,JSON.stringify(services,null,2)+'\n');await rename(temp,file);
    return services;
  }
  /** The local folder for a library kind, falling back to the default effects cache when unset. @param {any} services @param {'sounds'|'music'} kind */
  const folderInfo=(services,kind)=>kind==='music'?{folder:services.music.folder,isDefault:false}
    :(services.local.folder?{folder:services.local.folder,isDefault:false}:{folder:defaultSoundsFolder,isDefault:true});
  /** Whether a directory exists on disk. @param {string} dir */
  const dirExists=async dir=>!!(await stat(dir).catch(()=>null))?.isDirectory();
  /** How many files a local folder has, or why not. @param {string} folder @param {boolean} [isDefault] @returns {Promise<number|string|null>} */
  const countOf=async(folder,isDefault=false)=>{
    if(!folder)return null;
    if(isDefault&&!await dirExists(folder))return null;
    try {
      const count=(await localSoundFiles(folder)).length;
      return isDefault&&!count?null:count;
    } catch(/** @type {any} */ error) {return error.message;}
  };
  /** The settings with whether a token is set and how many files the local folders have (or why not). @param {any} services */
  async function status(services) {
    const effects=folderInfo(services,'sounds'),music=folderInfo(services,'music');
    return {...services,secrets:{freesound:!!await getSecret('freesound'),elevenlabs:!!await getSecret('elevenlabs')},
      localCount:await countOf(effects.folder,effects.isDefault),musicCount:await countOf(music.folder,music.isDefault)};
  }
  /**
   * Hits for sound effects or music from the chosen sources, in that order: the local folder (by file name and the
   * credits' title and notes) and Freesound (by text, in the chosen licences; music in its Music category). A source that
   * fails adds a note instead of failing the search. localPreview gives the address a local file plays from.
   * @param {string} query
   * @param {{kind?:'sounds'|'music',sources?:string[],maxDuration?:number,localPreview?:(file:string,kind:'sounds'|'music')=>string}} [options]
   */
  async function search(query,{kind='sounds',sources=['local','freesound'],maxDuration=kind==='music'?600:60,localPreview=file=>file}={}) {
    const services=await read(),token=await getSecret('freesound'),{folder,isDefault}=folderInfo(services,kind),results=[],notes=[];
    let localReady=false;
    /** @type {Set<string>} */
    const localUrls=new Set();
    for(const source of sources) {
      if(source==='local'&&folder) {
        try {
          const available=!isDefault||await dirExists(folder);
          if(available) {
            const entries=await libraryEntries(folder);
            if(!isDefault||entries.length>0)localReady=true;
            for(const entry of searchEntries(entries,query,20,{maxDuration})) {
              if(entry.url)localUrls.add(entry.url);
              results.push({source:'local',library:kind,key:`local:${entry.file}`,name:entry.title||path.posix.basename(entry.file),path:entry.file,
                author:entry.author??'',license:entry.license??'',notes:entry.notes??'',url:entry.url??'',
                duration:entry.duration??null,preview:localPreview(entry.file,kind)});
            }
          }
        } catch(/** @type {any} */ error) {notes.push(error.message);}
      }
      if(source==='freesound'&&token) {
        try {
          for(const hit of await freesound.search(token,{query,licenses:services.freesound.licenses,maxDuration,music:kind==='music'})) {
            if(hit.url&&localUrls.has(hit.url))continue;
            results.push({source:'freesound',library:kind,query:query.trim(),key:`freesound:${hit.id}`,...hit});
          }
        } catch(/** @type {any} */ error) {notes.push(error.message);}
      }
    }
    const ready=sources.some(source=>source==='local'?localReady:source==='freesound'?token:false);
    if(!ready)notes.push(`还没有设置${kind==='music'?'音乐':'音效'}来源：在资产管理器“生成与搜索 → 音乐与音效”里设置本地库或填 Freesound token。`);
    return {results,notes};
  }
  /** Persist a fetched or generated sound effect into the local effects library without failing the caller on I/O errors. */
  /** @param {string} subDir @param {string} filename @param {Uint8Array} bytes @param {Record<string,any>} meta */
  async function cacheEffect(subDir,filename,bytes,meta) {
    try {
      const services=await read();
      const {folder}=folderInfo(services,'sounds');
      if(folder)await saveLibraryTrack(folder,subDir,filename,bytes,meta);
    } catch {}
  }
  /**
   * A hit's bytes and where it came from; `{source:'generate',preset,name,prompt,seconds?,loop?}` generates one with an
   * audio preset for effects (the first such preset when none is named).
   * @param {any} from @param {'sounds'|'music'} [kind]
   */
  async function take(from,kind) {
    const libraryKind=kind==='music'||from?.library==='music'?'music':'sounds';
    if(from?.source==='generate') {
      const prompt=String(from.prompt??'').trim(),seconds=Number(from.seconds)||null;
      if(!prompt||prompt.length>450)throw failure(400,'音效描述须为 1–450 字。');
      if(seconds!==null&&!(seconds>=0.5&&seconds<=30))throw failure(400,'音效时长须在 0.5–30 秒之间。');
      const fits=(await audioPresets()).filter(p=>p.uses.includes('effects'));
      const preset=from.preset?fits.find(p=>p.id===from.preset):fits[0];
      if(!preset)throw failure(400,from.preset?`没有这个音效预设：${from.preset}`:'还没有音效预设：在资产管理器“生成与搜索 → 音乐与音效”里新建一个用于音效的预设。');
      const bytes=await soundEffect(await getSecret('elevenlabs'),{text:prompt,seconds,loop:from.loop===true,influence:preset.elevenlabs?.influence??0.3});
      const name=typeof from.name==='string'&&from.name.trim()?from.name.trim().slice(0,200):prompt.slice(0,200);
      const source={title:name,author:'ElevenLabs Sound Effects'};
      const hash=createHash('sha256').update(bytes).digest('hex').slice(0,10);
      const stem=safeAudioStem(prompt)||safeAudioStem(name)||'effect';
      const notes=[prompt,from.loop===true?'loop ambience':''].filter(Boolean).join(' · ');
      await cacheEffect('generated',`${stem}-${hash}.mp3`,bytes,{...source,notes,...(seconds?{duration:seconds}:{})});
      return {bytes,source,preset:musicPresetName(preset)};
    }
    if(from?.source==='local') {
      const services=await read(),{folder}=folderInfo(services,libraryKind),relative=String(from.path??'');
      const found=localSoundPath(folder,relative);
      if(!found)throw failure(400,'本地音频路径无效。');
      const entry=(await libraryEntries(folder)).find(e=>e.file===relative)??{file:relative};
      return {bytes:new Uint8Array(await readFile(found)),source:entrySource(entry)};
    }
    if(from?.source==='freesound') {
      const bytes=await freesound.downloadPreview(String(from.preview??''));
      const source=Object.fromEntries(Object.entries({title:from.name,author:from.author,url:from.url,license:from.license})
        .filter(([,v])=>typeof v==='string'&&v.trim()).map(([k,v])=>[k,String(v).slice(0,1000)]));
      if(libraryKind==='sounds') {
        const id=Number.isInteger(Number(from.id))&&Number(from.id)>0?String(Number(from.id)):createHash('sha256').update(bytes).digest('hex').slice(0,12);
        const stem=safeAudioStem(String(from.name??''));
        const filename=stem?`${id}-${stem}.mp3`:`${id}.mp3`;
        const tags=Array.isArray(from.tags)?from.tags.filter((/** @type {any} */ t)=>typeof t==='string'&&t.trim()).join(' '):'';
        const queryText=typeof from.query==='string'?from.query.trim():'';
        const notes=[tags,queryText].filter(Boolean).join(' · ');
        const duration=Number(from.duration)>0?Number(from.duration):undefined;
        await cacheEffect('freesound',filename,bytes,{...source,...(notes?{notes}:{}),...(duration?{duration}:{})});
      }
      return {bytes,source};
    }
    throw failure(400,'不支持的音频来源。');
  }
  /** The local file a preview address names. @param {string} relative @param {'sounds'|'music'} [kind] */
  async function localFile(relative,kind='sounds') {
    return localSoundPath(folderInfo(await read(),kind).folder,relative);
  }
  return {read,write,status,search,take,localFile,audioPresets};
}
