// @ts-check
/** @import {Story} from '../types/story.js' */
/** @import {MusicRecord,MusicTrack,MusicCue} from '../types/director.js' */
import {scriptLines} from './script-text.js';

/* The book's music (docs/dev/audio.md): at most one record line `// @vn-music {...}` beside the director records.
 *   {"tracks":[{"id":"rain","name":"雨夜","prompt":"..."}],"cues":[{"from":"s1:1","track":"rain"},{"from":"s4:2","track":null}]}
 * Each cue starts its track (or silence, null) at a unit and holds until the next cue, across chapters. What plays at a
 * position follows from the position alone, so jumping and going back give the same music as reading there. The
 * record is optional and a comment to the parser; the files for the tracks are bound in the package manifest. */
export const MUSIC_PREFIX='// @vn-music ';
const ID=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const TRACK_LIMIT=128,CUE_LIMIT=4096;

/** @param {unknown} value @param {Story} story @returns {MusicRecord} */
export function validateMusic(value,story) {
  const record=/** @type {any} */(value);
  if(!record||typeof record!=='object'||Array.isArray(record)||Object.keys(record).some(key=>!['tracks','cues'].includes(key)))
    throw new Error('音乐记录须为 {tracks, cues}。');
  if(!Array.isArray(record.tracks)||record.tracks.length>TRACK_LIMIT)throw new Error(`音乐 tracks 须为数组，最多 ${TRACK_LIMIT} 首。`);
  if(!Array.isArray(record.cues)||record.cues.length>CUE_LIMIT)throw new Error(`音乐 cues 须为数组，最多 ${CUE_LIMIT} 个。`);
  const ids=new Set();
  /** @type {MusicTrack[]} */
  const tracks=record.tracks.map(/** @param {any} track */track=>{
    const keys=Object.keys(track??{});
    if(!track||typeof track!=='object'||keys.some(key=>!['id','name','prompt'].includes(key)))throw new Error('曲目须为 {id, name, prompt}。');
    if(typeof track.id!=='string'||!ID.test(track.id)||ids.has(track.id))throw new Error(`曲目 ID 无效或重复：${track.id}`);
    if(typeof track.name!=='string'||!track.name.trim()||track.name.length>200)throw new Error(`曲目 ${track.id} 需要名称（最多 200 字）。`);
    if(track.prompt!==undefined&&(typeof track.prompt!=='string'||!track.prompt.trim()||track.prompt.length>4000))
      throw new Error(`曲目 ${track.id} 的 prompt 须为非空文字（最多 4000 字）。`);
    ids.add(track.id);
    return {id:track.id,name:track.name.trim(),...(track.prompt!==undefined?{prompt:track.prompt.trim()}:{})};
  });
  const units=new Map(story.units.map((unit,index)=>[unit.id,index]));
  let last=-1;
  /** @type {MusicCue[]} */
  const cues=record.cues.map(/** @param {any} cue */cue=>{
    if(!cue||typeof cue!=='object'||Object.keys(cue).some(key=>!['from','track'].includes(key)))throw new Error('切换点须为 {from, track}。');
    const index=units.get(cue.from);
    if(index===undefined)throw new Error(`切换点单元不存在：${cue.from}`);
    if(index<=last)throw new Error(`切换点须按正文顺序排列且不重复：${cue.from}`);
    if(cue.track!==null&&!ids.has(cue.track))throw new Error(`切换点曲目不存在：${cue.track}`);
    last=index;
    return {from:cue.from,track:cue.track};
  });
  return {tracks,cues};
}

/** The music record the text carries, checked against the story, or null. @param {string} raw @param {Story} story */
export function readMusic(raw,story) {
  /** @type {MusicRecord|null} */
  let found=null;
  for(const {text:line,literal} of scriptLines(raw)) {
    if(literal||!line.startsWith(MUSIC_PREFIX))continue;
    if(found)throw new Error('音乐记录重复。');
    let value;
    try {value=JSON.parse(line.slice(MUSIC_PREFIX.length));} catch {throw new Error('音乐记录无效。');}
    found=validateMusic(value,story);
  }
  return found;
}

/* The text with its music record replaced where it stands, added before the first director record (or at the end), or
 * removed with null. Every other line stays as it is.
 * @param {string} raw @param {MusicRecord|null} record @returns {string} */
export function withMusic(raw,record) {
  const lines=raw.split('\n'),literal=scriptLines(raw).map(line=>line.literal);
  const at=lines.findIndex((line,i)=>!literal[i]&&line.trim().startsWith(MUSIC_PREFIX));
  const text=record&&`${MUSIC_PREFIX}${JSON.stringify(record)}`;
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

/** Unit indexes where each cue starts, for musicAt. @param {MusicRecord|null|undefined} record @param {Story} story */
export function compileMusic(record,story) {
  if(!record)return null;
  const units=new Map(story.units.map((unit,index)=>[unit.id,index]));
  return {tracks:new Map(record.tracks.map(track=>[track.id,track])),
    cues:record.cues.map(cue=>({index:/** @type {number} */(units.get(cue.from)),track:cue.track}))};
}

/** The track playing at a unit (the last cue at or before it), or null for silence. @param {Story} story @param {number} index */
export function musicAt(story,index) {
  const cues=story.musicCues?.cues;
  if(!cues?.length)return null;
  let low=0,high=cues.length-1,found=-1;
  while(low<=high) {
    const middle=(low+high)>>1;
    if(cues[middle].index<=index){found=middle;low=middle+1;}
    else high=middle-1;
  }
  return found<0?null:cues[found].track;
}

/** The next track the reading will reach after `index` within `ahead` units, for loading early. @param {Story} story */
export function nextMusic(story,index,ahead=40) {
  return story.musicCues?.cues.find(cue=>cue.index>index&&cue.index<=index+ahead&&cue.track)?.track??null;
}
