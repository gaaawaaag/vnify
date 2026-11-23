// @ts-check
/* The voice library (voices.json beside image-presets.json, docs/dev/audio.md): voices from speech services that every
 * work can choose from, with the service settings the manager uses for previews and design. Keys live with the other
 * service keys in the user's folder (secrets.js), never here. A voice is named across the project as
 * `<provider>:<ref>` (`fish:<Fish Audio model id>`, `elevenlabs:<voice id>`), the same form the reader stores. */

export const VOICE_LIBRARY_VERSION=1;
export const FISH_MODELS=['s2.1-pro-free','s2.1-pro'];
export const ELEVENLABS_MODELS=['eleven_multilingual_v2','eleven_flash_v2_5','eleven_v3'];
export const GEMINI_TTS_MODELS=['gemini-3.8-flash-tts','gemini-3.8-flash-lite-tts'];
export const VOICE_PROVIDERS=['fish','elevenlabs','gemini'];
export const VOICE_ORIGINS=['public','designed'];
const REF=/^[A-Za-z0-9_-]{1,128}$/;
// A voice's default language, as a short language tag (zh, yue, en, ja, ko, …).
const LANG=/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const NOTE_LIMIT=500;
const VOICE_LIMIT=500;

/**
 * `lang` is the language the voice speaks by default; `note` is the user's own description, for whoever assigns voices.
 * @typedef {{provider:'fish'|'elevenlabs'|'gemini',ref:string,label:string,tags:string[],origin:'public'|'designed',lang?:string,note?:string}} LibraryVoice
 */
/** @typedef {{version:1,fish:{model:string},elevenlabs:{model:string},gemini:{model:string},voices:LibraryVoice[]}} VoiceLibrary */

/** @param {{provider:string,ref:string}} voice */
export const voiceKey=voice=>`${voice.provider}:${voice.ref}`;

/** @param {unknown} value @returns {string[]} */
function tagsOf(value) {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>12||value.some(tag=>typeof tag!=='string'||!tag.trim()||tag.length>40))
    throw new Error('音色标签须为文字（最多 12 个，每个最多 40 字）。');
  return [...new Set(value.map(tag=>tag.trim()))];
}

/** A checked voice entry. @param {any} voice @returns {LibraryVoice} */
export function validateLibraryVoice(voice) {
  if(!voice||typeof voice!=='object'||!VOICE_PROVIDERS.includes(voice.provider))throw new Error('音色须来自支持的服务（Fish Audio、ElevenLabs、Gemini TTS）。');
  if(typeof voice.ref!=='string'||!REF.test(voice.ref))throw new Error('音色 ID 无效。');
  if(typeof voice.label!=='string'||!voice.label.trim()||voice.label.length>200)throw new Error('音色需要名称（最多 200 字）。');
  const origin=voice.origin??'public';
  if(!VOICE_ORIGINS.includes(origin))throw new Error('音色来源无效。');
  const lang=voice.lang===undefined||voice.lang===''?undefined:voice.lang;
  if(lang!==undefined&&(typeof lang!=='string'||!LANG.test(lang)))throw new Error('音色语言须为语言代码，如 zh、en、ja。');
  if(voice.note!==undefined&&(typeof voice.note!=='string'||voice.note.length>NOTE_LIMIT))throw new Error(`音色备注最多 ${NOTE_LIMIT} 字。`);
  const note=voice.note?.trim()||undefined;
  return {provider:voice.provider,ref:voice.ref,label:voice.label.trim(),tags:tagsOf(voice.tags),origin,...lang?{lang}:{},...note?{note}:{}};
}

/** The library from its file; a missing file is an empty library. @param {unknown} raw @returns {VoiceLibrary} */
export function validateVoiceLibrary(raw) {
  if(raw===null||raw===undefined)return {version:VOICE_LIBRARY_VERSION,fish:{model:FISH_MODELS[0]},elevenlabs:{model:ELEVENLABS_MODELS[0]},
    gemini:{model:GEMINI_TTS_MODELS[0]},voices:[]};
  const file=/** @type {any} */(raw);
  if(!file||typeof file!=='object'||file.version!==VOICE_LIBRARY_VERSION)throw new Error('voices.json 版本或格式不对。');
  const model=file.fish?.model??FISH_MODELS[0];
  if(!FISH_MODELS.includes(model))throw new Error('不支持的 Fish Audio 模型。');
  const elevenModel=file.elevenlabs?.model??ELEVENLABS_MODELS[0];
  if(!ELEVENLABS_MODELS.includes(elevenModel))throw new Error('不支持的 ElevenLabs 模型。');
  const geminiModel=file.gemini?.model??GEMINI_TTS_MODELS[0];
  if(!GEMINI_TTS_MODELS.includes(geminiModel))throw new Error('不支持的 Gemini TTS 模型。');
  if(!Array.isArray(file.voices)||file.voices.length>VOICE_LIMIT)throw new Error(`音色库须为数组，最多 ${VOICE_LIMIT} 个。`);
  const voices=file.voices.map(validateLibraryVoice),seen=new Set();
  for(const voice of voices) {
    if(seen.has(voiceKey(voice)))throw new Error(`音色重复：${voice.label}`);
    seen.add(voiceKey(voice));
  }
  return {version:VOICE_LIBRARY_VERSION,fish:{model},elevenlabs:{model:elevenModel},gemini:{model:geminiModel},voices};
}

/** A library language from a service's language code, or undefined. @param {unknown} value */
export function voiceLang(value) {
  const code=typeof value==='string'?value.trim().replace('_','-'):'';
  return LANG.test(code)?code:undefined;
}

/** A Fish Audio voice ID from an ID or a link to the voice's page (32 hex characters). @param {string} value */
export function fishRef(value) {
  const text=String(value??'').trim(),found=/[0-9a-f]{32}/i.exec(text);
  return found?found[0].toLowerCase():REF.test(text)?text:null;
}

/** @typedef {{text:string,chapter:string,place:string,thought:boolean}} SampleLine */
/** @typedef {{key:string,label:string,count:number,lines:SampleLine[]}} VoiceRole */
/**
 * The roles that speak in a story, for assigning voices: the narrator, other characters (guests), then each character
 * with lines in order of first line. Each brings a few of its own lines, spread over the book, to preview voices with.
 * @param {import('../types/story.js').Story} story @param {number} [samples]
 * @returns {VoiceRole[]}
 */
export function voiceRoles(story,samples=6) {
  /** @type {Map<string,{label:string,units:any[]}>} */
  const roles=new Map([['narrator',{label:'旁白',units:[]}],['other',{label:'其他人物',units:[]}]]);
  for(const unit of story.units) {
    if(unit.block.kind==='document'||!/[\p{L}\p{N}]/u.test(unit.text))continue;
    const key=unit.kind==='narration'?'narrator':unit.speakerId??'other';
    if(!roles.has(key))roles.set(key,{label:story.entities.get(key)?.label??key,units:[]});
    /** @type {any} */(roles.get(key)).units.push(unit);
  }
  return [...roles].filter(([key,role])=>role.units.length||key==='narrator'||key==='other').map(([key,role])=>{
    const fitting=role.units.filter(unit=>{const n=Array.from(unit.text).length;return n>=4&&n<=150;});
    const pool=fitting.length?fitting:role.units,step=Math.max(1,pool.length/samples);
    const lines=Array.from({length:Math.min(samples,pool.length)},(_,i)=>pool[Math.floor(i*step)]).map(unit=>({
      text:unit.text.trim(),chapter:unit.chapter.title,place:unit.block.title||'',thought:unit.kind==='thought'}));
    return {key,label:role.label,count:role.units.length,lines};
  });
}
