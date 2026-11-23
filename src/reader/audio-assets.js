// @ts-check
/** @import {AudioAssets,AudioRecord,AudioSource,AudioType} from '../types/assets.js' */
/** @import {Story} from '../types/story.js' */

/* Audio files of a book (docs/dev/audio.md): each file is named by its SHA-256 like the images, and the manifest binds
 * the music record's tracks to files. A file keeps where it came from (title, author, link, licence) so a shared
 * package carries its credits. A track without a file plays as silence. */
export const AUDIO_VERSION=/** @type {1} */(1);
/** @type {Record<AudioType,string>} */
export const AUDIO_TYPES={'audio/mpeg':'mp3','audio/mp4':'m4a','audio/ogg':'ogg'};
export const AUDIO_LIMIT=40*1024*1024;
export const AUDIO_FILES=256;
const SOURCE_KEYS=['title','author','url','license'];

/** The type of an audio file from its first bytes. @param {Uint8Array} bytes @returns {AudioType} */
export function audioType(bytes) {
  const text=(/** @type {number} */ from,/** @type {number} */ to)=>String.fromCharCode(...bytes.slice(from,to));
  if(text(0,3)==='ID3'||bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0)return 'audio/mpeg';
  if(text(4,8)==='ftyp')return 'audio/mp4';
  if(text(0,4)==='OggS')return 'audio/ogg';
  throw new Error('请选择 MP3、M4A（AAC）或 OGG 音频。');
}

/** @param {string} bookId @returns {AudioAssets} */
export const emptyAudio=bookId=>({version:AUDIO_VERSION,bookId,bindings:{tracks:{},sounds:{}},files:{}});

/** @param {unknown} value @returns {AudioSource|undefined} */
export function validateAudioSource(value) {
  if(value===undefined)return undefined;
  const source=/** @type {any} */(value);
  if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(key=>!SOURCE_KEYS.includes(key))
    ||Object.values(source).some(text=>typeof text!=='string'||text.length>1000))
    throw new Error('音频来源须为 {title, author, url, license} 文字（各最多 1000 字）。');
  const kept=Object.fromEntries(Object.entries(source).map(([key,text])=>[key,text.trim()]).filter(([,text])=>text));
  return Object.keys(kept).length?kept:undefined;
}

/**
 * Checks the bindings against the story's music and sound records (tracks and sounds by ID) and drops files nothing
 * uses. A manifest without sounds bindings has none.
 * @template {AudioRecord} R
 * @param {{version:number,bookId?:string,bindings:{tracks:Record<string,string>,sounds?:Record<string,string>},files:Record<string,R>}} audio
 * @param {Story} story
 */
export function validateAudio(audio,story) {
  if(audio?.version!==AUDIO_VERSION||!audio.bindings||typeof audio.bindings.tracks!=='object'||!audio.files||typeof audio.files!=='object')
    throw new Error('音频清单无效。');
  if(Object.keys(audio.files).length>AUDIO_FILES)throw new Error(`音频最多 ${AUDIO_FILES} 个文件。`);
  const sounds=audio.bindings.sounds??{};
  if(!sounds||typeof sounds!=='object'||Array.isArray(sounds))throw new Error('音频清单无效。');
  /** @param {Record<string,string>} given @param {Set<string>} known @param {string} what */
  const bind=(given,known,what)=>{
    /** @type {Record<string,string>} */
    const kept={};
    for(const [key,id] of Object.entries(given)) {
      if(!known.has(key))throw new Error(`音频绑定的${what}不存在：${key}`);
      if(typeof id!=='string'||!audio.files[id])throw new Error(`${what} ${key} 绑定的音频不存在。`);
      kept[key]=id;
    }
    return kept;
  };
  const bindings=bind(audio.bindings.tracks,new Set(story.music?.tracks.map(track=>track.id)??[]),'曲目');
  const soundBindings=bind(sounds,new Set(story.sounds?.sounds.map(sound=>sound.id)??[]),'声音');
  const used=new Set([...Object.values(bindings),...Object.values(soundBindings)]);
  /** @type {Record<string,R>} */
  const files={};
  for(const [id,file] of Object.entries(audio.files)) {
    if(!/^[a-f0-9]{64}$/.test(id)||!file||!Object.hasOwn(AUDIO_TYPES,file.type)||typeof file.name!=='string'||file.name.length>500)
      throw new Error('音频文件信息无效。');
    if(!used.has(id))continue;
    const source=validateAudioSource(file.source);
    files[id]=/** @type {R} */({...file,...(source?{source}:{})});
    if(!source)delete files[id].source;
  }
  return {version:AUDIO_VERSION,bookId:audio.bookId??story.book.id,bindings:{tracks:bindings,sounds:soundBindings},files};
}

/** Whether a book has any bound audio. @param {AudioAssets|null|undefined} audio */
export const hasAudio=audio=>Boolean(audio&&(Object.keys(audio.bindings.tracks).length||Object.keys(audio.bindings.sounds??{}).length));
