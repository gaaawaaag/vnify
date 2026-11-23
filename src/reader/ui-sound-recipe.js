// @ts-check
/* Interface sounds a theme may provide (registry `sounds`, docs/theme-guide.md): a JSON object with one short sound per
 * event. A sound is a level and a few layers the reader synthesizes with the Web Audio API (src/ui/ui-sounds.js): tones,
 * filtered noise and bells. A theme ships numbers only, no audio files and no code. */

/** @typedef {import('../types/theme.js').UiSound} UiSound @typedef {import('../types/theme.js').UiSounds} UiSounds */
/** @typedef {import('../types/theme.js').UiSoundLayer} UiSoundLayer @typedef {import('../types/theme.js').UiSoundEvent} UiSoundEvent */

/** @type {readonly UiSoundEvent[]} */
export const UI_SOUND_EVENTS=Object.freeze(['open','close','select','chapter']);
/** @type {Record<string,[number,number]>} */
const RANGES={f:[20,16000],f2:[20,16000],q:[0.1,30],dur:[0.005,4],a:[0.001,1],g:[0,1],at:[0,2],wet:[0,1],gain:[0,4],ratio:[0.25,16]};
const WAVES=['sine','triangle','square','sawtooth'],FILTERS=['lowpass','highpass','bandpass'];
const MAX_LAYERS=8,MAX_PARTIALS=8,MAX_SECONDS=4;

/**
 * Reads a theme's sound file. An event with a problem is left out (the default theme's sound plays instead) and each
 * problem is reported; unknown events are reported and ignored.
 * @param {unknown} value
 * @returns {{sounds:UiSounds,errors:string[]}}
 */
export function readUiSounds(value) {
  /** @type {string[]} */
  const errors=[];
  /** @type {UiSounds} */
  const sounds={};
  if(!value||typeof value!=='object'||Array.isArray(value))return {sounds,errors:['声音文件须为对象，键为事件名。']};
  for(const [event,raw] of Object.entries(value)) {
    const known=UI_SOUND_EVENTS.find(name=>name===event);
    if(!known){errors.push(`${event} 不是界面音效事件（可用：${UI_SOUND_EVENTS.join('、')}）。`);continue;}
    /** @type {string[]} */
    const problems=[];
    const sound=readSound(raw,problems);
    if(problems.length||!sound)errors.push(...problems.map(problem=>`${event}：${problem}`));
    else sounds[known]=sound;
  }
  return {sounds,errors};
}

/** @param {any} raw @param {string} key @param {string[]} problems @param {number} [fallback] @param {string} [range] */
function number(raw,key,problems,fallback,range=key) {
  const value=raw[key];
  if(value===undefined) {
    if(fallback===undefined)problems.push(`缺少 ${key}。`);
    return fallback??0;
  }
  const [min,max]=RANGES[range];
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max) {
    problems.push(`${key} 须为 ${min}–${max} 的数。`);
    return fallback??min;
  }
  return value;
}
/** @param {any} raw @param {string[]} problems @returns {UiSound|null} */
function readSound(raw,problems) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){problems.push('须为对象。');return null;}
  const gain=number(raw,'gain',problems,1);
  if(!Array.isArray(raw.layers)||!raw.layers.length||raw.layers.length>MAX_LAYERS) {
    problems.push(`layers 须为 1–${MAX_LAYERS} 层的列表。`);
    return null;
  }
  /** @type {UiSoundLayer[]} */
  const layers=[];
  raw.layers.forEach((/** @type {any} */ item,/** @type {number} */ i)=>{
    /** @type {string[]} */
    const own=[];
    const layer=readLayer(item,own);
    problems.push(...own.map(problem=>`第 ${i+1} 层 ${problem}`));
    if(layer)layers.push(layer);
  });
  return {gain,layers};
}
/** @param {any} raw @param {string[]} problems @returns {UiSoundLayer|null} */
function readLayer(raw,problems) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){problems.push('须为对象。');return null;}
  const timing={at:number(raw,'at',problems,0),dur:number(raw,'dur',problems),wet:number(raw,'wet',problems,0)};
  if(timing.at+timing.dur>MAX_SECONDS)problems.push(`at＋dur 不能超过 ${MAX_SECONDS} 秒。`);
  /** @type {{f2?:number}} */
  const glide=raw.f2===undefined?{}:{f2:number(raw,'f2',problems)};
  if(raw.type==='tone') {
    const wave=raw.wave??'sine';
    if(!WAVES.includes(wave))problems.push(`wave 须为 ${WAVES.join('、')} 之一。`);
    return {type:'tone',f:number(raw,'f',problems),...glide,wave,a:number(raw,'a',problems,0.004),g:number(raw,'g',problems),...timing};
  }
  if(raw.type==='noise') {
    const filter=raw.filter??'bandpass';
    if(!FILTERS.includes(filter))problems.push(`filter 须为 ${FILTERS.join('、')} 之一。`);
    return {type:'noise',filter,f:number(raw,'f',problems),...glide,q:number(raw,'q',problems,1),a:number(raw,'a',problems,0.005),
      g:number(raw,'g',problems),...timing};
  }
  if(raw.type==='bell') {
    const ratios=Array.isArray(raw.ratios)?raw.ratios:[],gains=Array.isArray(raw.gains)?raw.gains:[];
    if(!ratios.length||ratios.length>MAX_PARTIALS||gains.length!==ratios.length)
      problems.push(`ratios 与 gains 须为等长的 1–${MAX_PARTIALS} 个数。`);
    const within=(/** @type {any} */ value,/** @type {string} */ range)=>typeof value==='number'&&value>=RANGES[range][0]&&value<=RANGES[range][1];
    if(!ratios.every(value=>within(value,'ratio')))problems.push(`ratios 须为 ${RANGES.ratio.join('–')} 的数。`);
    if(!gains.every(value=>within(value,'g')))problems.push(`gains 须为 ${RANGES.g.join('–')} 的数。`);
    return {type:'bell',f:number(raw,'f',problems),ratios,gains,...timing};
  }
  problems.push('type 须为 tone、noise 或 bell。');
  return null;
}
