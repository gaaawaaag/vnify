// @ts-check
/* The reader's sound mixer (docs/dev/audio.md): music, ambience, sound effects and interface sounds, each with a gain
 * under the master gain. Music and ambience are decoded whole with the Web Audio API, so they loop without a gap and cross-fade when they
 * change; effects play once. Music, ambience and interface sounds dip while a line is read aloud. Browsers start audio only after the
 * reader has clicked or pressed a key, so the context is resumed on those; it is suspended while the page is hidden. */

const FADE_OUT=1.2,FADE_IN=1.5,LOOPS=4,EFFECTS=24;
const DUCK={music:0.45,ambience:0.7,ui:0.7};
const TARGET_RMS={music:10**(-18/20),ambience:10**(-22/20),effects:10**(-16/20)};
const MIN_GAIN=0.25,MAX_GAIN=2.5,PEAK_CEILING=0.95,GATE_SQ=1e-5;
const SILENCE_LEVEL=0.004,MUSIC_LOOP_FADE=1.5,AMBIENCE_LOOP_FADE=0.35;

/**
 * Computes a loudness-compensation gain for a decoded AudioBuffer using gated RMS and peak headroom protection.
 * Falls back to 1 when the buffer does not expose PCM channel data.
 * @param {AudioBuffer} decoded @param {'music'|'ambience'|'effects'} channel @returns {number}
 */
export function measureBufferGain(decoded,channel) {
  if(!decoded||typeof decoded.getChannelData!=='function'||!decoded.numberOfChannels||!decoded.length)return 1;
  let sumSq=0,active=0,peak=0;
  const stride=Math.max(1,Math.floor(decoded.length/120000));
  for(let c=0;c<decoded.numberOfChannels;c++) {
    const ch=decoded.getChannelData(c);
    for(let i=0;i<ch.length;i+=stride) {
      const v=ch[i],sq=v*v,abs=v<0?-v:v;
      if(abs>peak)peak=abs;
      if(sq>=GATE_SQ){sumSq+=sq;active++;}
    }
  }
  if(!active||peak<1e-4)return 1;
  const rms=Math.sqrt(sumSq/active);
  let gain=Math.max(MIN_GAIN,Math.min(MAX_GAIN,TARGET_RMS[channel]/rms));
  if(gain*peak>PEAK_CEILING)gain=PEAK_CEILING/peak;
  return gain;
}

/**
 * Prepares a looping AudioBuffer: trims excessive dead silence at the edges of long music tracks, then builds a
 * phase-locked overlap-add crossfade at the end of the buffer so the first play starts cleanly at 0 and subsequent
 * loops wrap seamlessly to loopStart without a click or gap.
 * @param {AudioContext} audio @param {AudioBuffer} decoded @param {'music'|'ambience'} channel
 * @returns {{buffer:AudioBuffer,loopStart:number,loopEnd:number}}
 */
export function prepareLoopBuffer(audio,decoded,channel) {
  const raw={buffer:decoded,loopStart:0,loopEnd:decoded.duration??0};
  if(!audio||typeof audio.createBuffer!=='function'||typeof decoded?.getChannelData!=='function')return raw;
  const sr=decoded.sampleRate,len=decoded.length,channels=decoded.numberOfChannels;
  if(!sr||!len||!channels)return raw;
  const minDur=channel==='music'?10:4;
  if(len/sr<minDur)return raw;
  let start=0,end=len;
  // Trim leading/trailing near-silence on long music tracks (common in AI-generated music) while keeping a small pad.
  if(channel==='music') {
    const maxTrim=Math.min(Math.round(sr*4),Math.floor(len*0.12));
    const pad=Math.round(sr*0.05);
    const loudAt=(/** @type {number} */ i)=>{
      for(let c=0;c<channels;c++)if(Math.abs(decoded.getChannelData(c)[i])>=SILENCE_LEVEL)return true;
      return false;
    };
    let s=0;
    while(s<maxTrim&&!loudAt(s))s++;
    if(s>sr*0.15)start=Math.max(0,s-pad);
    let e=len;
    while(e>len-maxTrim&&!loudAt(e-1))e--;
    if(len-e>sr*0.15)end=Math.min(len,e+pad);
  }
  const trimmed=end-start;
  const fadeSec=channel==='music'?MUSIC_LOOP_FADE:AMBIENCE_LOOP_FADE;
  const fade=Math.min(Math.round(sr*fadeSec),Math.floor(trimmed*0.15));
  if(fade<Math.round(sr*0.05)||trimmed-fade*2<sr)return raw;
  const out=audio.createBuffer(channels,trimmed,sr);
  const body=trimmed-fade;
  for(let c=0;c<channels;c++) {
    const src=decoded.getChannelData(c);
    const dst=out.getChannelData(c);
    for(let i=0;i<body;i++)dst[i]=src[start+i];
    // Tail [body..trimmed) fades out while head [0..fade) fades in with equal-power curves, then loops to loopStart=fade.
    for(let i=0;i<fade;i++) {
      const angle=(i/fade)*(Math.PI/2);
      dst[body+i]=src[start+body+i]*Math.cos(angle)+src[start+i]*Math.sin(angle);
    }
  }
  return {buffer:out,loopStart:fade/sr,loopEnd:trimmed/sr};
}

export function createMusicPlayer({AudioContextClass=globalThis.AudioContext,load=(/** @type {string} */ src)=>fetch(src).then(r=>{
  if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.arrayBuffer();
})}={}) {
  const supported=Boolean(AudioContextClass);
  /** @type {AudioContext|null} */
  let ctx=null;
  /** @type {Record<'master'|'music'|'ambience'|'effects'|'ui'|'musicDuck'|'ambienceDuck'|'uiDuck',GainNode>|null} */
  let gains=null;
  let volumes={master:1,music:0.7,ambience:0.6,effects:0.8,ui:0.5},ducked=false;
  // Decoded audio: the few loops last asked for, and more of the short effects.
  /** @type {Record<'loops'|'effects',Map<string,Promise<AudioBuffer>>>} */
  const caches={loops:new Map(),effects:new Map()};
  function context() {
    if(ctx)return ctx;
    ctx=new AudioContextClass();
    const names=['master','music','ambience','effects','ui','musicDuck','ambienceDuck','uiDuck'];
    const g=Object.fromEntries(names.map(name=>[name,/** @type {AudioContext} */(ctx).createGain()]));
    g.master.connect(ctx.destination);
    g.music.connect(g.musicDuck).connect(g.master);
    g.ambience.connect(g.ambienceDuck).connect(g.master);
    g.effects.connect(g.master);
    g.ui.connect(g.uiDuck).connect(g.master);
    gains=/** @type {any} */(g);applyVolumes(0);
    return ctx;
  }
  /** @param {number} [time] */
  function applyVolumes(time=0.08) {
    if(!ctx||!gains)return;
    const now=ctx.currentTime;
    for(const name of /** @type {const} */(['master','music','ambience','effects','ui']))gains[name].gain.setTargetAtTime(volumes[name],now,time);
    for(const name of /** @type {const} */(['music','ambience','ui']))
      gains[`${name}Duck`].gain.setTargetAtTime(ducked?DUCK[name]:1,now,ducked?0.15:0.4);
  }
  /** @param {string} src @param {'loops'|'effects'} kind */
  function buffer(src,kind) {
    const cache=caches[kind];
    let found=cache.get(src);
    if(found){cache.delete(src);cache.set(src,found);return found;}
    const audio=context();
    found=load(src).then(bytes=>audio.decodeAudioData(bytes));
    found.catch(()=>cache.delete(src));
    cache.set(src,found);
    while(cache.size>(kind==='loops'?LOOPS:EFFECTS)){const oldest=cache.keys().next().value;if(oldest===undefined)break;cache.delete(oldest);}
    return found;
  }
  const resume=()=>{if(ctx?.state==='suspended'&&!document.hidden)void ctx.resume().catch(()=>{});};
  if(supported) {
    for(const type of ['pointerdown','keydown'])window.addEventListener(type,resume,{capture:true,passive:true});
    document.addEventListener('visibilitychange',()=>{
      if(!ctx)return;
      if(document.hidden)void ctx.suspend().catch(()=>{});else resume();
    });
  }
  // One looping channel (music or ambience): plays one source at a time, cross-fading on change.
  /** @param {'music'|'ambience'} channel */
  function loop(channel) {
    let token=0;
    /** @type {{src:string|null,node:AudioBufferSourceNode|null,gain:GainNode|null}} */
    let current={src:null,node:null,gain:null};
    function fadeOut() {
      const {node,gain}=current;
      if(!ctx||!node||!gain)return;
      const end=ctx.currentTime+FADE_OUT;
      gain.gain.cancelScheduledValues(ctx.currentTime);gain.gain.setValueAtTime(gain.gain.value,ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0,end);
      try{node.stop(end+0.05);}catch{}
    }
    /** @param {string|null} src */
    return src=>{
      if(!supported||src===current.src)return;
      fadeOut();
      const own=++token;
      current={src,node:null,gain:null};
      if(!src)return;
      const audio=context();resume();
      buffer(src,'loops').then(decoded=>{
        if(own!==token||!gains)return;
        const prepared=prepareLoopBuffer(audio,decoded,channel);
        const targetGain=measureBufferGain(prepared.buffer,channel);
        const node=audio.createBufferSource(),gain=audio.createGain();
        node.buffer=prepared.buffer;node.loop=true;
        if(prepared.loopStart>0){node.loopStart=prepared.loopStart;node.loopEnd=prepared.loopEnd;}
        gain.gain.setValueAtTime(0,audio.currentTime);gain.gain.linearRampToValueAtTime(targetGain,audio.currentTime+FADE_IN);
        node.connect(gain).connect(gains[channel]);node.start();
        current={src,node,gain};
      }).catch(()=>{});
    };
  }
  const music=loop('music'),ambience=loop('ambience');
  return {
    supported,
    /** Plays a track (its address) on loop, cross-fading from the one before; null fades to silence. @param {string|null} src */
    play:music,
    /** The same for the ambience under the scene. @param {string|null} src */
    playAmbience:ambience,
    /** Plays an effect once, at a volume of 0–1. @param {string} src @param {number} [level] */
    effect(src,level=1) {
      if(!supported)return;
      const audio=context();resume();
      buffer(src,'effects').then(decoded=>{
        if(!gains)return;
        const node=audio.createBufferSource(),gain=audio.createGain();
        node.buffer=decoded;gain.gain.value=level*measureBufferGain(decoded,'effects');
        node.connect(gain).connect(gains.effects);node.start();
      }).catch(()=>{});
    },
    /** Hands an interface sound the context and its channel to draw into (src/ui/ui-sounds.js). @param {(audio:AudioContext,channel:AudioNode)=>void} draw */
    ui(draw) {
      if(!supported)return;
      const audio=context();resume();
      if(gains)draw(audio,gains.ui);
    },
    /** Loads a track or ambience that will play soon. @param {string|null} src */
    preload(src) {if(supported&&src&&ctx)void buffer(src,'loops').catch(()=>{});},
    /** Loads an effect that will play soon. @param {string|null} src */
    preloadEffect(src) {if(supported&&src&&ctx)void buffer(src,'effects').catch(()=>{});},
    /** Volumes 0–1. @param {{master:number,music:number,ambience?:number,effects?:number,ui?:number}} value */
    setVolumes(value) {volumes={...volumes,...value};applyVolumes();},
    /** Lowers music, ambience and interface sounds while a voice speaks. @param {boolean} on */
    duck(on) {if(ducked===on)return;ducked=on;applyVolumes();},
  };
}
