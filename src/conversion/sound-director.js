// @ts-check
/** @import {Story} from '../types/story.js' */
/** @import {SoundRecord,MusicRecord} from '../types/director.js' */
import {renderPrompt} from '../prompts/library.js';
import {unitLine} from './director.js';
import {validateSounds} from '../core/sounds.js';
import {validateMusic,musicAt} from '../core/music.js';

/* The sound director (docs/dev/audio.md): per chapter, the agent reads the accepted text with its unit IDs and writes
 * the chapter's sounds — new sound definitions, ambience for places, blocks with their own ambience, and effects at
 * units. The drafts are merged, in chapter order, into the book's `// @vn-sounds` record. */
export const SOUND_DENSITIES=['few','medium','rich'];
const DENSITY_TEXT={few:'少：只给情节靠声音推进或读者必须听见的时刻配音效，全章通常零到两处',
  medium:'适中：给原文写到的显著声响配音效，许多场景可以没有',rich:'多：原文写到的声响大多可配，仍不给普通动作与说话配'};

// How often the music changes at each music density.
const MUSIC_TEXT={few:'少：只在场景与情绪的大转折处换曲，一章通常零到一个切换点',medium:'适中：在场景转换或情绪明显转折处换曲，一章通常零到三个切换点',
  rich:'多：情绪或场景有变化处都可以换曲，一章可以有三到五个切换点'};

/** @typedef {{density?:string,notes?:string,effects?:boolean,music?:boolean,musicDensity?:string}} SoundOptions */
/** @typedef {{chapterId:string,sounds:any[],places:Record<string,string>,blocks:Record<string,string|null>,effects:any[],music:any[]}} SoundDraft */

/* The project's sound options, checked: effects (ambience and effects, on unless turned off) and music (cues for the
 * track list, off unless turned on), with the effects' density and notes. */
/** @param {any} value @returns {{density:string,notes:string,effects:boolean,music:boolean,musicDensity:string}} */
export function soundOptions(value) {
  const density=value?.density??'medium',notes=value?.notes??'',effects=value?.effects??true,music=value?.music??false;
  const musicDensity=value?.musicDensity??'medium';
  if(!SOUND_DENSITIES.includes(density))throw new Error('soundOptions.density 须为 few、medium 或 rich。');
  if(!SOUND_DENSITIES.includes(musicDensity))throw new Error('soundOptions.musicDensity 须为 few、medium 或 rich。');
  if(typeof notes!=='string'||notes.length>2000)throw new Error('soundOptions.notes 须为不超过 2000 字的文字。');
  if(typeof effects!=='boolean'||typeof music!=='boolean')throw new Error('soundOptions.effects 与 music 须为布尔值。');
  return {density,notes:notes.trim(),effects,music,musicDensity};
}

/**
 * The packet for one chapter: rules, the chapter text, its places, the sounds defined so far and the places that have
 * ambience already.
 * The track list and the track playing where the chapter starts come along when music is on.
 * @param {Story} story @param {string} chapterId @param {SoundRecord|null} known @param {SoundOptions} [options]
 */
export function soundPacket(story,chapterId,known,options={}) {
  if(!story.chapters.some(c=>c.id===chapterId))throw new Error(`没有这一章：${chapterId}`);
  const {density,notes,effects,music,musicDensity}=soundOptions(options);
  const blocks=story.blocks.filter(b=>b.chapterId===chapterId),units=story.units.filter(u=>u.chapter.id===chapterId);
  const blockInput=blocks.map(b=>[`@block ${b.id} kind=${b.kind}`
    +['loc','time','pov','effect'].map(k=>b[k]&&b[k]!=='none'?` ${k}=${b[k]}`:'').join(''),
  ...units.filter(u=>u.block.id===b.id).map(unitLine)].join('\n')).join('\n\n');
  const locations=[...new Set(blocks.map(b=>b.loc).filter(Boolean))].map(id=>({id,label:story.entities.get(/** @type {string} */(id))?.label??id}));
  const first=story.units.findIndex(u=>u.chapter.id===chapterId);
  const schema={chapterId,...(effects?{sounds:[{id:'rain',name:'雨声',kind:'ambience',query:'rain on window loop'}],places:{},blocks:{},effects:[]}:{}),
    ...(music?{music:[{from:'单元ID',track:'曲目ID'}]}:{})};
  const needs={effects:effects?DENSITY_TEXT[/** @type {'few'|'medium'|'rich'} */(density)]:'本次不安排环境音与音效',
    music:music?MUSIC_TEXT[/** @type {'few'|'medium'|'rich'} */(musicDensity)]:'本次不安排音乐',...(notes?{notes}:{})};
  const rules=[renderPrompt('sound.task',{},story.book.lang),...(effects?[renderPrompt('sound.effects',{},story.book.lang)]:[]),
    ...(music?[renderPrompt('sound.music',{},story.book.lang)]:[])];
  return rules.join('\n\n')+'\n\n---\n'+renderPrompt('sound.request',{
    bookTitle:JSON.stringify(story.book.title),chapterId,needs:JSON.stringify(needs),
    blocks:blockInput,locations:JSON.stringify(locations),sounds:JSON.stringify(known?.sounds??[]),places:JSON.stringify(known?.places??{}),
    tracks:JSON.stringify(music?story.music?.tracks??[]:[]),current:JSON.stringify(music&&first>0?musicAt(story,first-1):null),
  })+'\n\n'+renderPrompt('sound.output',{schema:JSON.stringify(schema)});
}

/**
 * A chapter's draft, checked: it only touches its own places, blocks and units, and refers to sounds it defines or the
 * book already has.
 * @param {unknown} value @param {Story} story @param {string} chapterId @returns {SoundDraft}
 */
export function validateSoundDraft(value,story,chapterId) {
  const draft=/** @type {any} */(value);
  if(!draft||typeof draft!=='object'||Array.isArray(draft))throw new Error('声音稿须为 JSON 对象。');
  if(draft.chapterId!==chapterId)throw new Error(`声音稿章节不匹配：收到 ${JSON.stringify(draft.chapterId)}，应为 ${JSON.stringify(chapterId)}。`);
  const blocks=new Set(story.blocks.filter(b=>b.chapterId===chapterId).map(b=>b.id));
  const places=new Set(story.blocks.filter(b=>b.chapterId===chapterId).map(b=>b.loc).filter(Boolean));
  const units=new Set(story.units.filter(u=>u.chapter.id===chapterId).map(u=>u.id));
  for(const key of Object.keys(draft.places??{}))if(!places.has(key))throw new Error(`声音稿的地点不在本章：${key}`);
  for(const key of Object.keys(draft.blocks??{}))if(!blocks.has(key))throw new Error(`声音稿的块不在本章：${key}`);
  for(const cue of draft.effects??[])if(!units.has(cue?.at))throw new Error(`声音稿的音效点不在本章：${cue?.at}`);
  if(draft.music!==undefined&&!Array.isArray(draft.music))throw new Error('声音稿的 music 须为数组。');
  for(const cue of draft.music??[])if(!units.has(cue?.from))throw new Error(`声音稿的音乐切换点不在本章：${cue?.from}`);
  return {chapterId,sounds:draft.sounds??[],places:draft.places??{},blocks:draft.blocks??{},effects:draft.effects??[],music:draft.music??[]};
}

/**
 * The book's record from a base (the project's sounds file, or the text's record) and the chapter drafts in chapter
 * order. A draft adds what the base does not have yet: new sounds, ambience for places and blocks without any, and the
 * effects of chapters the base has none in; so edits made in the asset manager stay.
 * @param {SoundRecord|null} base @param {SoundDraft[]} drafts @param {Story} story @returns {SoundRecord}
 */
export function mergeSoundDrafts(base,drafts,story) {
  /** @type {any} */
  const record=structuredClone(base??{sounds:[],places:{},blocks:{},effects:[]});
  const unitChapter=new Map(story.units.map(u=>[u.id,u.chapter.id])),order=new Map(story.units.map((u,i)=>[u.id,i]));
  for(const draft of drafts) {
    const known=new Set(record.sounds.map((/** @type {any} */ s)=>s.id));
    for(const sound of draft.sounds)if(!known.has(sound?.id)){record.sounds.push(sound);known.add(sound?.id);}
    for(const [place,id] of Object.entries(draft.places))if(!Object.hasOwn(record.places,place))record.places[place]=id;
    for(const [block,id] of Object.entries(draft.blocks))if(!Object.hasOwn(record.blocks,block))record.blocks[block]=id;
    if(!record.effects.some((/** @type {any} */ cue)=>unitChapter.get(cue.at)===draft.chapterId))record.effects.push(...draft.effects);
  }
  record.effects.sort((/** @type {any} */ a,/** @type {any} */ b)=>(order.get(a.at)??0)-(order.get(b.at)??0));
  return validateSounds(record,story);
}

/**
 * The book's music record from a base (the project's music file, or the text's record), the design's track list and the
 * chapter drafts' cues. Tracks the base lacks are added; a draft's cues come in for chapters the base has no cues in.
 * @param {MusicRecord|null} base @param {{id:string,name:string,prompt:string}[]} tracks @param {SoundDraft[]} drafts @param {Story} story
 * @returns {MusicRecord}
 */
export function mergeMusicDrafts(base,tracks,drafts,story) {
  /** @type {any} */
  const record=structuredClone(base??{tracks:[],cues:[]});
  const known=new Set(record.tracks.map((/** @type {any} */ t)=>t.id));
  for(const track of tracks)if(!known.has(track.id)){record.tracks.push(track);known.add(track.id);}
  const unitChapter=new Map(story.units.map(u=>[u.id,u.chapter.id])),order=new Map(story.units.map((u,i)=>[u.id,i]));
  for(const draft of drafts)if(!record.cues.some((/** @type {any} */ cue)=>unitChapter.get(cue.from)===draft.chapterId))record.cues.push(...draft.music);
  // One cue per unit, in reading order.
  const seen=new Set();
  record.cues=record.cues.sort((/** @type {any} */ a,/** @type {any} */ b)=>(order.get(a.from)??0)-(order.get(b.from)??0))
    .filter((/** @type {any} */ cue)=>!seen.has(cue.from)&&seen.add(cue.from));
  return validateMusic(record,story);
}
