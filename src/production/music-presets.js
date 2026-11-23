// @ts-check
import {parseWorkflow,WORKFLOW_LIMIT} from './image-presets.js';

/* Audio generation presets (music-presets.json beside image-presets.json, docs/dev/audio.md). Like image presets, each
 * has uses: music, sound effects, or both. ElevenLabs makes music (Eleven Music) and effects (Sound Effects); a ComfyUI
 * API workflow (such as ACE-Step, its prompt, lyrics, length and seed inputs found by their node types) and Google's
 * Lyria make music. Keys stay with the other keys in the user's folder. */
export const MUSIC_PRESETS_VERSION=1;
export const MUSIC_SOURCES=['elevenlabs','comfyui','lyria'];
export const AUDIO_USES=/** @type {const} */(['music','effects']);
/** @type {Record<string,readonly string[]>} */
export const SOURCE_USES={elevenlabs:AUDIO_USES,comfyui:['music'],lyria:['music']};
export const ELEVEN_MUSIC_MODELS=['music_v2_5','music_v2','music_v1'];
// Lyria through the Gemini API: the clip model always makes 30 seconds; the others make a song whose length the prompt asks for.
export const LYRIA_MODELS=['lyria-3.5','lyria-3-pro-preview','lyria-3-clip-preview'];
export const LYRIA_CLIP='lyria-3-clip-preview';
/** @type {Record<string,string>} */
const LYRIA_NAMES={'lyria-3.5':'3.5','lyria-3-pro-preview':'3 Pro','lyria-3-clip-preview':'3 Clip'};
export const MUSIC_FIELDS=['prompt','lyrics','duration','seed'];
export const MUSIC_FIELD_LABELS={prompt:'提示词',lyrics:'歌词（填纯音乐标记）',duration:'时长（秒）',seed:'种子'};
const USE_LABELS={music:'音乐',effects:'音效'};

/** @typedef {'music'|'effects'} AudioUse */
/** @typedef {Partial<Record<'prompt'|'lyrics'|'duration'|'seed',[string,string]>>} MusicMap */
/** @typedef {{id:string,source:'elevenlabs'|'comfyui'|'lyria',uses:AudioUse[],custom:string,seconds:number,
 *   elevenlabs?:{model:string,instrumental:boolean,influence:number},comfyui?:{url:string,workflow:string|null,map:MusicMap},
 *   lyria?:{model:string,instrumental:boolean}}} MusicPreset */

/** A new preset of a source. @param {string} source @param {string} id @param {AudioUse} [use] @returns {MusicPreset} */
export function newMusicPreset(source,id,use='music') {
  const base={id,custom:'',seconds:90};
  if(source==='comfyui')return {...base,source:'comfyui',uses:['music'],comfyui:{url:'http://127.0.0.1:8188',workflow:null,map:{}}};
  if(source==='lyria')return {...base,source:'lyria',uses:['music'],lyria:{model:LYRIA_MODELS[0],instrumental:true}};
  return {...base,source:'elevenlabs',uses:[use],elevenlabs:{model:ELEVEN_MUSIC_MODELS[0],instrumental:true,influence:0.3}};
}

/** The preset's name from its settings. Uses are named once a preset makes effects (music is what presets made before);
 * credits name the music without them. @param {MusicPreset} p @param {boolean} [withUses] */
export function musicPresetName(p,withUses=true) {
  const model=p.source==='elevenlabs'&&p.uses.includes('music')?p.elevenlabs?.model:'';
  const source=p.source==='elevenlabs'?'ElevenLabs':p.source==='lyria'?`Lyria ${LYRIA_NAMES[p.lyria?.model??'']??p.lyria?.model}`:'ComfyUI';
  const uses=withUses&&p.uses.includes('effects')?p.uses.map(u=>USE_LABELS[u]).join('／'):'';
  return [source,model,uses,p.custom.trim()].filter(Boolean).join(' · ');
}

/* Where each field goes in an ACE-Step style workflow: the text encoder's tags (or caption) and lyrics, the empty
 * latent's seconds, and the sampler's seed. */
/** @param {Record<string,any>} data @returns {MusicMap} */
export function detectMusicWorkflow(data) {
  /** @type {MusicMap} */
  const map={};
  for(const [node,n] of Object.entries(data)) {
    const type=String(n?.class_type??''),inputs=n?.inputs??{};
    const take=(/** @type {keyof MusicMap} */ field,/** @type {string[]} */ names,/** @type {string} */ kind)=>{
      if(map[field])return;
      const name=names.find(key=>typeof inputs[key]===kind);
      if(name)map[field]=[node,name];
    };
    if(/TextEncode.*Ace|Ace.*TextEncode/i.test(type)){take('prompt',['tags','caption','prompt','text'],'string');take('lyrics',['lyrics'],'string');}
    if(/LatentAudio/i.test(type))take('duration',['seconds','duration'],'number');
    if(/KSampler/i.test(type))take('seed',['seed','noise_seed'],'number');
  }
  return map;
}

/** @param {any} preset @returns {MusicPreset} */
function validatePreset(preset) {
  if(!preset||typeof preset.id!=='string'||!/^[\w-]{1,64}$/.test(preset.id)||!MUSIC_SOURCES.includes(preset.source))throw new Error('音频预设无效。');
  if(typeof preset.custom!=='string'||preset.custom.length>80)throw new Error('音频预设的自定义名称无效。');
  const seconds=Number(preset.seconds);
  if(!Number.isFinite(seconds)||seconds<10||seconds>600)throw new Error('音乐时长须在 10–600 秒之间。');
  // Presets from before uses made music.
  const uses=preset.uses??['music'];
  if(!Array.isArray(uses)||uses.some(u=>!SOURCE_USES[preset.source].includes(u))||new Set(uses).size!==uses.length)throw new Error('音频预设的用途无效。');
  const base={id:preset.id,source:preset.source,uses:AUDIO_USES.filter(u=>uses.includes(u)),custom:preset.custom,seconds:Math.round(seconds)};
  if(preset.source==='elevenlabs') {
    const e=preset.elevenlabs??{},influence=e.influence??0.3;
    if(!ELEVEN_MUSIC_MODELS.includes(e.model))throw new Error('ElevenLabs 音乐模型无效。');
    if(typeof influence!=='number'||!(influence>=0&&influence<=1))throw new Error('ElevenLabs 音效的贴合描述须在 0–1 之间。');
    return {...base,elevenlabs:{model:e.model,instrumental:e.instrumental!==false,influence}};
  }
  if(preset.source==='lyria') {
    const l=preset.lyria??{};
    if(!LYRIA_MODELS.includes(l.model))throw new Error('Lyria 模型无效。');
    return {...base,lyria:{model:l.model,instrumental:l.instrumental!==false}};
  }
  const c=preset.comfyui??{};
  if(typeof c.url!=='string'||!/^https?:\/\//.test(c.url))throw new Error('ComfyUI 地址须以 http:// 或 https:// 开头。');
  if(c.workflow!==null&&c.workflow!==undefined){if(typeof c.workflow!=='string'||c.workflow.length>WORKFLOW_LIMIT)throw new Error('工作流太大。');parseWorkflow(c.workflow);}
  const map=c.map??{};
  if(!map||typeof map!=='object'||Object.entries(map).some(([field,target])=>!MUSIC_FIELDS.includes(field)
    ||!Array.isArray(target)||target.length!==2||target.some(v=>typeof v!=='string')))throw new Error('工作流的节点对应无效。');
  return {...base,comfyui:{url:c.url.replace(/\/+$/,''),workflow:c.workflow??null,map}};
}

/** The presets file; a missing file has none. @param {unknown} raw */
export function validateMusicPresets(raw) {
  if(raw===null||raw===undefined)return {version:MUSIC_PRESETS_VERSION,presets:/** @type {MusicPreset[]} */([])};
  const file=/** @type {any} */(raw);
  if(!file||file.version!==MUSIC_PRESETS_VERSION||!Array.isArray(file.presets)||file.presets.length>32)throw new Error('music-presets.json 版本或格式不对。');
  const presets=file.presets.map(validatePreset);
  if(new Set(presets.map((/** @type {MusicPreset} */ p)=>p.id)).size!==presets.length)throw new Error('音频预设 ID 重复。');
  return {version:MUSIC_PRESETS_VERSION,presets};
}
