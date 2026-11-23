// @ts-check
/** @import {Story} from '../types/story.js' */
/** @import {VoiceRecord} from '../types/director.js' */
import {scriptLines} from './script-text.js';

/* The book's voices (docs/dev/audio.md): at most one record line `// @vn-voices {...}` beside the director records.
 *   {"labels":{"fish:54a5…":"沉稳旁白"},"cast":{"narrator":"fish:54a5…","characters":{"lin":"fish:8e2f…"}},
 *    "portraits":{"narrator":"…","lin":"二十多岁的男性，声音温和偏低"}}
 * A voice is `<service>:<id>` (`fish:`, `elevenlabs:`, `gemini:`), named in `labels`. `cast` gives the narrator, other
 * characters (guests and anyone without a voice of their own) and each character a voice; `portraits` describe the
 * voices wanted, for designing them. The reader reads with the cast unless the reader chose otherwise. */
export const VOICES_PREFIX='// @vn-voices ';
const KEY=/^(fish|elevenlabs|gemini):[A-Za-z0-9_-]{1,128}$/;
const ROLES=['narrator','other'];

/** @param {unknown} value @param {Story} story @returns {VoiceRecord} */
export function validateVoices(value,story) {
  const record=/** @type {any} */(value);
  if(!record||typeof record!=='object'||Array.isArray(record)||Object.keys(record).some(key=>!['labels','cast','portraits'].includes(key)))
    throw new Error('音色记录须为 {labels, cast, portraits}。');
  const labels=record.labels??{},cast=record.cast??{},portraits=record.portraits??{};
  if(!labels||typeof labels!=='object'||Array.isArray(labels)||Object.keys(labels).length>300)throw new Error('音色记录的 labels 无效。');
  for(const [key,label] of Object.entries(labels))
    if(!KEY.test(key)||typeof label!=='string'||!label.trim()||label.length>200)throw new Error(`音色名称无效：${key}`);
  const character=(/** @type {string} */ id)=>story.entities.get(id)?.kind==='character';
  /** @param {unknown} key @param {string} who */
  const voice=(key,who)=>{
    if(key===null||key===undefined)return null;
    if(typeof key!=='string'||!labels[key])throw new Error(`${who} 的音色须是 labels 里的音色。`);
    return key;
  };
  if(!cast||typeof cast!=='object'||Array.isArray(cast)||Object.keys(cast).some(key=>![...ROLES,'characters'].includes(key)))
    throw new Error('音色分派须为 {narrator, other, characters}。');
  const characters=cast.characters??{};
  if(!characters||typeof characters!=='object'||Array.isArray(characters))throw new Error('音色分派的 characters 无效。');
  /** @type {Record<string,string>} */
  const byCharacter={};
  for(const [id,key] of Object.entries(characters)) {
    if(!character(id))throw new Error(`音色分派的人物不存在：${id}`);
    const chosen=voice(key,id);if(chosen)byCharacter[id]=chosen;
  }
  if(!portraits||typeof portraits!=='object'||Array.isArray(portraits))throw new Error('声音画像无效。');
  /** @type {Record<string,string>} */
  const described={};
  for(const [role,text] of Object.entries(portraits)) {
    if(!ROLES.includes(role)&&!character(role))throw new Error(`声音画像的人物不存在：${role}`);
    if(typeof text!=='string'||text.length>1000)throw new Error(`${role} 的声音画像须为文字（最多 1000 字）。`);
    if(text.trim())described[role]=text.trim();
  }
  const narrator=voice(cast.narrator,'旁白'),other=voice(cast.other,'其他人物');
  const used=new Set([narrator,other,...Object.values(byCharacter)].filter(Boolean));
  return {
    labels:Object.fromEntries(Object.entries(labels).filter(([key])=>used.has(key)).map(([key,label])=>[key,label.trim()])),
    cast:{...(narrator?{narrator}:{}),...(other?{other}:{}),characters:byCharacter},
    portraits:described,
  };
}

/** Whether a record says anything. @param {VoiceRecord|null|undefined} record */
export const hasVoices=record=>Boolean(record&&(record.cast.narrator||record.cast.other||Object.keys(record.cast.characters).length
  ||Object.keys(record.portraits).length));

/** The voice record the text carries, checked against the story, or null. @param {string} raw @param {Story} story */
export function readVoices(raw,story) {
  /** @type {VoiceRecord|null} */
  let found=null;
  for(const {text:line,literal} of scriptLines(raw)) {
    if(literal||!line.startsWith(VOICES_PREFIX))continue;
    if(found)throw new Error('音色记录重复。');
    let value;
    try {value=JSON.parse(line.slice(VOICES_PREFIX.length));} catch {throw new Error('音色记录无效。');}
    found=validateVoices(value,story);
  }
  return found;
}

/* The text with its voice record replaced where it stands, added before the first director record (or at the end), or
 * removed when it says nothing. Every other line stays as it is.
 * @param {string} raw @param {VoiceRecord|null} record @returns {string} */
export function withVoices(raw,record) {
  const lines=raw.split('\n'),literal=scriptLines(raw).map(line=>line.literal);
  const at=lines.findIndex((line,i)=>!literal[i]&&line.trim().startsWith(VOICES_PREFIX));
  const text=hasVoices(record)&&`${VOICES_PREFIX}${JSON.stringify(record)}`;
  if(at>=0) {
    if(text)lines[at]=text+(lines[at].endsWith('\r')?'\r':'');
    else lines.splice(at,1);
    return lines.join('\n');
  }
  if(!text)return raw;
  const before=lines.findIndex((line,i)=>!literal[i]&&/^\/\/ @vn-(title-card|end-card|director) /.test(line.trim()));
  if(before>=0){lines.splice(before,0,text);return lines.join('\n');}
  return `${raw.replace(/\n*$/,'')}\n${text}\n`;
}
