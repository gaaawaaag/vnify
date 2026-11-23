// @ts-check
/* What the reader speaks aloud and with which voice (docs/dev/audio.md). This module only plans: the browser's speech
 * engine is driven by src/ui/voice-player.js. A voice here is anything with a name and a language, such as the
 * browser's SpeechSynthesisVoice. */

/** @typedef {'off'|'dialogue'|'all'} VoiceMode */
/** @typedef {{role:'character'|'thought'|'guest'|'narrator',characterId:string|null,text:string}} Speech */
/** @typedef {{narrator?:string,other?:string,characters?:Record<string,string>}} VoiceCast */
/** @typedef {{name:string,lang:string,default?:boolean}} VoiceInfo */

const SPEAKABLE=/[\p{L}\p{N}]/u;

/**
 * The speech of one unit, or null when it is not read: documents, narration unless chosen, and lines without words.
 * @param {{kind:string,text:string,speakerId:string|null,block:{kind:string}}} unit
 * @param {VoiceMode} mode
 * @returns {Speech|null}
 */
export function speechOf(unit,mode) {
  if(mode==='off'||unit.block.kind==='document')return null;
  const text=unit.text.trim();
  if(!SPEAKABLE.test(text))return null;
  if(unit.kind==='thought')return {role:'thought',characterId:unit.speakerId,text};
  if(unit.kind==='dialogue')return unit.speakerId?{role:'character',characterId:unit.speakerId,text}:{role:'guest',characterId:null,text};
  return mode==='all'?{role:'narrator',characterId:null,text}:null;
}

// Speech language tags of each work language.
/** @type {Record<string,RegExp>} */
const LANGS={zh:/^(zh|cmn)([-_](cn|hans|sg)|$)/i,'zh-Hant':/^(zh|yue)[-_](tw|hk|mo|hant)/i,en:/^en([-_]|$)/i,ja:/^ja([-_]|$)/i};
/** @type {Record<string,string>} */
const TAGS={zh:'zh-CN','zh-Hant':'zh-TW',en:'en-US',ja:'ja-JP'};

/** The speech language tag of a work language. @param {string|undefined} lang */
export const speechLang=lang=>TAGS[lang??'zh']??TAGS.zh;

/** Whether a voice speaks the work's language. @param {VoiceInfo} voice @param {string|undefined} lang */
export function voiceSpeaks(voice,lang) {
  const tag=voice.lang.replace('_','-');
  if(lang==='zh-Hant')return LANGS['zh-Hant'].test(tag);
  return (LANGS[lang??'zh']??LANGS.zh).test(tag);
}

/**
 * The voice used when none is chosen: the system default when it speaks the work's language, else a natural
 * (online) voice of that language, else the first one.
 * @param {VoiceInfo[]} voices @param {string|undefined} lang @returns {VoiceInfo|null}
 */
export function defaultVoice(voices,lang) {
  const own=voices.filter(voice=>voiceSpeaks(voice,lang));
  return own.find(voice=>voice.default)??own.find(voice=>/natural|online/i.test(voice.name))??own[0]??null;
}

/**
 * The cast the reader reads with: the book's own (its voice record) under the reader's choices for this book.
 * @param {{cast:{narrator?:string,other?:string,characters:Record<string,string>}}|null|undefined} record
 * @param {VoiceCast|undefined} local @returns {VoiceCast}
 */
export function castFor(record,local) {
  const book=record?.cast;
  return {narrator:local?.narrator??book?.narrator,other:local?.other??book?.other,
    characters:{...book?.characters,...local?.characters}};
}
// A chosen voice is a browser voice name, or `<service>:<voice id>` for a speech service's voice.
export const CLOUD_SERVICES=/** @type {const} */(['fish','elevenlabs','gemini']);
/** @typedef {typeof CLOUD_SERVICES[number]} CloudService */
/** @typedef {{provider:CloudService,ref:string}} CloudVoice */
/** The service voice of a choice, or null for a browser voice. @param {string|undefined} choice @returns {CloudVoice|null} */
export function cloudVoiceOf(choice) {
  const found=/^(fish|elevenlabs|gemini):(.+)$/.exec(choice??'');
  return found?{provider:/** @type {CloudService} */(found[1]),ref:found[2]}:null;
}
/** The services the book's voices use. @param {{cast:any}|null|undefined} record @returns {CloudService[]} */
export function servicesOf(record) {
  if(!record)return [];
  const used=new Set([record.cast.narrator,record.cast.other,...Object.values(record.cast.characters??{})].map(key=>cloudVoiceOf(key)?.provider));
  return CLOUD_SERVICES.filter(service=>used.has(service));
}

/**
 * The voice and delivery of a speech. A character without a voice of its own uses “other characters”, then the
 * narrator; a choice that cannot be used here (a browser voice this device lacks, a service voice without a key)
 * passes on to the next, and last to the default browser voice. Thoughts are lower and quieter.
 * @param {Speech} speech @param {VoiceCast|undefined} cast @param {VoiceInfo[]} voices @param {string|undefined} lang
 * @param {Partial<Record<CloudService,boolean>>} [services] which services are ready (their key is set)
 * @returns {{voice:VoiceInfo|null,cloud:CloudVoice|null,pitch:number,volume:number}}
 */
export function deliveryOf(speech,cast,voices,lang,services={}) {
  const chosen=[
    speech.characterId?cast?.characters?.[speech.characterId]:undefined,
    speech.role==='narrator'?undefined:cast?.other,
    cast?.narrator,
  ];
  /** @type {CloudVoice|null} */
  let cloud=null;
  /** @type {VoiceInfo|null} */
  let voice=null;
  for(const choice of chosen) {
    if(!choice)continue;
    const service=cloudVoiceOf(choice);
    if(service){if(services[service.provider]){cloud=service;break;}continue;}
    voice=voices.find(item=>item.name===choice)??null;
    if(voice)break;
  }
  if(!cloud&&!voice)voice=defaultVoice(voices,lang);
  return {voice:cloud?null:voice,cloud,...(speech.role==='thought'?{pitch:0.9,volume:0.75}:{pitch:1,volume:1})};
}

/**
 * Pieces of at most about `limit` characters, cut after sentence ends (then commas), since some engines stop long
 * utterances part way.
 * @param {string} text @param {number} [limit] @returns {string[]}
 */
export function speechChunks(text,limit=120) {
  const chunks=[];let rest=text.trim();
  while(rest.length>limit) {
    const head=rest.slice(0,limit);
    const end=Math.max(...[...head.matchAll(/[。！？!?…；;.]+["”’」』)）]*\s*/gu)].map(match=>(match.index??0)+match[0].length));
    const comma=Math.max(...[...head.matchAll(/[，,、：:]\s*/gu)].map(match=>(match.index??0)+match[0].length));
    const cut=end>limit/3?end:comma>limit/3?comma:limit;
    chunks.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();
  }
  if(rest)chunks.push(rest);
  return chunks;
}
