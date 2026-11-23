// @ts-check
/** @import {Story} from '../types/story.js' */
/** @import {SoundRecord,SoundDefinition,SoundEffect,SoundIndex} from '../types/director.js' */
import {scriptLines} from './script-text.js';

/* The book's ambience and sound effects (docs/dev/audio.md): at most one record line `// @vn-sounds {...}`.
 *   {"sounds":[{"id":"rain","name":"雨声","kind":"ambience","query":"rain on window loop"},
 *              {"id":"door","name":"开门","kind":"effect","query":"old wooden door creak"}],
 *    "places":{"inn":"rain"},"blocks":{"s05":null},"effects":[{"at":"s01:2","sound":"door","phase":"enter"}]}
 * Ambience follows the position like the backgrounds: the block's own choice, else its place's, else silence (a
 * document takes the place of the scene before it). Effects play once at a unit, when the text is entered or shown,
 * and only while reading forward. Files for the sounds are bound in the package manifest. */
export const SOUNDS_PREFIX='// @vn-sounds ';
const ID=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const SOUND_LIMIT=512,EFFECT_LIMIT=8192;

/** @param {unknown} value @param {Story} story @returns {SoundRecord} */
export function validateSounds(value,story) {
  const record=/** @type {any} */(value);
  if(!record||typeof record!=='object'||Array.isArray(record)||Object.keys(record).some(key=>!['sounds','places','blocks','effects'].includes(key)))
    throw new Error('音效记录须为 {sounds, places, blocks, effects}。');
  if(!Array.isArray(record.sounds)||record.sounds.length>SOUND_LIMIT)throw new Error(`音效 sounds 须为数组，最多 ${SOUND_LIMIT} 个。`);
  /** @type {Map<string,SoundDefinition>} */
  const byId=new Map();
  const sounds=record.sounds.map(/** @param {any} sound */sound=>{
    if(!sound||typeof sound!=='object'||Object.keys(sound).some(key=>!['id','name','kind','query','prompt'].includes(key)))
      throw new Error('声音须为 {id, name, kind, query, prompt}。');
    if(typeof sound.id!=='string'||!ID.test(sound.id)||byId.has(sound.id))throw new Error(`声音 ID 无效或重复：${sound.id}`);
    if(typeof sound.name!=='string'||!sound.name.trim()||sound.name.length>200)throw new Error(`声音 ${sound.id} 需要名称（最多 200 字）。`);
    if(!['ambience','effect'].includes(sound.kind))throw new Error(`声音 ${sound.id} 的 kind 须为 ambience 或 effect。`);
    for(const field of ['query','prompt'])if(sound[field]!==undefined&&(typeof sound[field]!=='string'||!sound[field].trim()||sound[field].length>1000))
      throw new Error(`声音 ${sound.id} 的 ${field} 须为非空文字（最多 1000 字）。`);
    /** @type {SoundDefinition} */
    const kept={id:sound.id,name:sound.name.trim(),kind:sound.kind,
      ...(sound.query!==undefined?{query:sound.query.trim()}:{}),...(sound.prompt!==undefined?{prompt:sound.prompt.trim()}:{})};
    byId.set(kept.id,kept);
    return kept;
  });
  /** @param {unknown} id @param {string} where @param {'ambience'|'effect'} kind */
  const sound=(id,where,kind)=>{
    if(id===null&&kind==='ambience')return null;
    const found=typeof id==='string'?byId.get(id):undefined;
    if(!found||found.kind!==kind)throw new Error(`${where} 须引用${kind==='ambience'?'环境音':'音效'}：${id}`);
    return found.id;
  };
  const places=record.places??{},blocks=record.blocks??{};
  if(!places||typeof places!=='object'||Array.isArray(places))throw new Error('音效记录的 places 无效。');
  /** @type {Record<string,string>} */
  const byPlace={};
  for(const [place,id] of Object.entries(places)) {
    if(story.entities.get(place)?.kind!=='location')throw new Error(`环境音的地点不存在：${place}`);
    byPlace[place]=/** @type {string} */(sound(id,`地点 ${place}`,'ambience'));
  }
  if(!blocks||typeof blocks!=='object'||Array.isArray(blocks))throw new Error('音效记录的 blocks 无效。');
  const blockIds=new Set(story.blocks.map(block=>block.id));
  /** @type {Record<string,string|null>} */
  const byBlock={};
  for(const [block,id] of Object.entries(blocks)) {
    if(!blockIds.has(block))throw new Error(`环境音的内容块不存在：${block}`);
    byBlock[block]=sound(id,`内容块 ${block}`,'ambience');
  }
  const effects=record.effects??[];
  if(!Array.isArray(effects)||effects.length>EFFECT_LIMIT)throw new Error(`音效点须为数组，最多 ${EFFECT_LIMIT} 个。`);
  const units=new Map(story.units.map((unit,index)=>[unit.id,index]));
  let last=-1;
  /** @type {SoundEffect[]} */
  const cues=effects.map(/** @param {any} cue */cue=>{
    if(!cue||typeof cue!=='object'||Object.keys(cue).some(key=>!['at','sound','phase','volume'].includes(key)))
      throw new Error('音效点须为 {at, sound, phase, volume}。');
    const index=units.get(cue.at);
    if(index===undefined)throw new Error(`音效点单元不存在：${cue.at}`);
    if(index<last)throw new Error(`音效点须按正文顺序排列：${cue.at}`);
    last=index;
    const phase=cue.phase??'enter';
    if(!['enter','shown'].includes(phase))throw new Error(`音效点 ${cue.at} 的 phase 须为 enter 或 shown。`);
    if(cue.volume!==undefined&&!(typeof cue.volume==='number'&&cue.volume>0&&cue.volume<=1))throw new Error(`音效点 ${cue.at} 的 volume 须在 0–1 之间。`);
    return {at:cue.at,sound:/** @type {string} */(sound(cue.sound,`音效点 ${cue.at}`,'effect')),phase,...(cue.volume!==undefined?{volume:cue.volume}:{})};
  });
  return {sounds,places:byPlace,blocks:byBlock,effects:cues};
}

/** Whether a record says anything. @param {SoundRecord|null|undefined} record */
export const hasSounds=record=>Boolean(record&&(record.sounds.length||record.effects.length));

/** The sound record the text carries, checked against the story, or null. @param {string} raw @param {Story} story */
export function readSounds(raw,story) {
  /** @type {SoundRecord|null} */
  let found=null;
  for(const {text:line,literal} of scriptLines(raw)) {
    if(literal||!line.startsWith(SOUNDS_PREFIX))continue;
    if(found)throw new Error('音效记录重复。');
    let value;
    try {value=JSON.parse(line.slice(SOUNDS_PREFIX.length));} catch {throw new Error('音效记录无效。');}
    found=validateSounds(value,story);
  }
  return found;
}

/* The text with its sound record replaced where it stands, added before the first director record (or at the end), or
 * removed when it says nothing. Every other line stays as it is.
 * @param {string} raw @param {SoundRecord|null} record @returns {string} */
export function withSounds(raw,record) {
  const lines=raw.split('\n'),literal=scriptLines(raw).map(line=>line.literal);
  const at=lines.findIndex((line,i)=>!literal[i]&&line.trim().startsWith(SOUNDS_PREFIX));
  const text=hasSounds(record)&&`${SOUNDS_PREFIX}${JSON.stringify(record)}`;
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

/** Effects by unit index, for finding a line's effects. @param {SoundRecord|null|undefined} record @param {Story} story */
export function compileSounds(record,story) {
  if(!record)return null;
  const units=new Map(story.units.map((unit,index)=>[unit.id,index]));
  /** @type {Map<number,SoundEffect[]>} */
  const effects=new Map();
  for(const cue of record.effects) {
    const index=/** @type {number} */(units.get(cue.at));
    effects.set(index,[...effects.get(index)??[],cue]);
  }
  return /** @type {SoundIndex} */({effects});
}

/** The ambience at a unit: the block's own choice, else its place's, else null (silence). @param {Story} story @param {number} index */
export function ambienceAt(story,index) {
  const record=story.sounds,unit=story.units[index];
  if(!record||!unit)return null;
  const blockId=unit.backgroundContext?.blockId??unit.block.id,loc=unit.backgroundContext?.loc??unit.block.loc;
  if(Object.hasOwn(record.blocks,blockId))return record.blocks[blockId];
  return loc?record.places[loc]??null:null;
}

/** The effects of a unit for one phase. @param {Story} story @param {number} index @param {'enter'|'shown'} phase */
export const effectsAt=(story,index,phase)=>story.soundIndex?.effects.get(index)?.filter(cue=>cue.phase===phase)??[];

/** Effects within the next `ahead` units, for loading early. @param {Story} story @param {number} index */
export function upcomingEffects(story,index,ahead=10) {
  const found=new Set();
  for(let i=index;i<=index+ahead;i++)for(const cue of story.soundIndex?.effects.get(i)??[])found.add(cue.sound);
  return [...found];
}
