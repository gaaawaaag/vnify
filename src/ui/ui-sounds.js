// @ts-check
import {readUiSounds} from '../reader/ui-sound-recipe.js';
/* Interface sounds (docs/dev/audio.md): opening and closing the reading menu, panels, the history and the chapter list,
 * choosing inside them, and the chapter title card. Open, close and select play only for what the reader just did (a
 * click, key, wheel or touch a moment before), so auto play, restoring and redrawing stay silent; turning the page has
 * no sound. The chapter card sounds once each time it is reached. Sounds come from the active theme's registry `sounds`
 * (numbers synthesized here, src/reader/ui-sound-recipe.js); a theme without one, or an event it leaves out, uses the
 * first registered theme's. Requests within one moment are merged by weight, so opening a panel from the menu plays
 * "open" and not the menu's "close" as well. Each play varies pitch and level a little, the same event is not repeated
 * within 80 ms, and a new sound cuts the one before (the chapter card is left to ring). */

/** @typedef {import('../types/theme.js').UiSound} UiSound @typedef {import('../types/theme.js').UiSounds} UiSounds */
/** @typedef {import('../types/theme.js').UiSoundEvent} UiSoundEvent */
/** @typedef {{ui:(draw:(audio:AudioContext,channel:AudioNode)=>void)=>void}} UiMixer */

const GESTURE_MS=800,MERGE_MS=40,THROTTLE_MS=80,PITCH=0.04,LEVEL=0.1;
/** @type {Record<UiSoundEvent,number>} */
const WEIGHT={chapter:4,open:3,close:2,select:1};

/** @type {WeakMap<BaseAudioContext,{noise:AudioBuffer,rooms:WeakMap<AudioNode,ConvolverNode>}>} */
const shared=new WeakMap();
/** @param {BaseAudioContext} ctx */
function buffers(ctx) {
  let found=shared.get(ctx);
  if(found)return found;
  const noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=noise.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  found={noise,rooms:new WeakMap()};shared.set(ctx,found);
  return found;
}
/** A short soft room, made once per channel. @param {BaseAudioContext} ctx @param {AudioNode} channel */
function room(ctx,channel) {
  const {rooms}=buffers(ctx);
  let verb=rooms.get(channel);
  if(verb)return verb;
  const length=Math.floor(ctx.sampleRate*1.8),impulse=ctx.createBuffer(2,length,ctx.sampleRate);
  for(let c=0;c<2;c++) {
    const data=impulse.getChannelData(c);let low=0;
    for(let i=0;i<length;i++){low=low*0.6+(Math.random()*2-1)*0.4;data[i]=low*Math.exp(-3.2*i/ctx.sampleRate);}
  }
  verb=ctx.createConvolver();verb.buffer=impulse;verb.connect(channel);rooms.set(channel,verb);
  return verb;
}
/** @param {AudioParam} param @param {number} start @param {number} attack @param {number} dur @param {number} peak */
function envelope(param,start,attack,dur,peak) {
  param.setValueAtTime(0.0001,start);
  param.exponentialRampToValueAtTime(Math.max(peak,0.0001),start+attack);
  param.exponentialRampToValueAtTime(0.0001,start+Math.max(dur,attack+0.005));
}

/**
 * Draws one sound: each layer goes to `out` and, by its `wet`, to `send` (the room). Frequencies are multiplied by
 * `pitch`. Returns when the last layer ends, in the context's time.
 * @param {BaseAudioContext} ctx @param {UiSound} sound
 * @param {{out:AudioNode,send:AudioNode,pitch?:number,start?:number}} options
 */
export function drawUiSound(ctx,sound,{out,send,pitch=1,start=ctx.currentTime}) {
  const {noise}=buffers(ctx);
  let end=start;
  /** @param {AudioNode} node @param {number} wet */
  const route=(node,wet)=>{
    node.connect(out);
    if(wet>0){const gain=ctx.createGain();gain.gain.value=wet;node.connect(gain).connect(send);}
  };
  /** @param {{f:number,f2?:number,dur:number,wave:OscillatorType,a:number,g:number,at:number,wet:number}} layer */
  const tone=({f,f2,dur,wave,a,g,at,wet})=>{
    const t=start+at,osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=wave;osc.frequency.setValueAtTime(f*pitch,t);
    if(f2)osc.frequency.exponentialRampToValueAtTime(f2*pitch,t+dur*0.8);
    envelope(gain.gain,t,a,dur,g);osc.connect(gain);route(gain,wet);
    osc.start(t);osc.stop(t+dur+0.03);end=Math.max(end,t+dur+0.03);
  };
  for(const layer of sound.layers) {
    if(layer.type==='tone')tone(layer);
    else if(layer.type==='bell') {
      layer.ratios.forEach((ratio,i)=>tone({f:layer.f*ratio,dur:layer.dur/(1+i*0.7),wave:'sine',a:0.002,g:layer.gains[i],at:layer.at,wet:layer.wet}));
    } else {
      const t=start+layer.at,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      source.buffer=noise;filter.type=layer.filter;filter.Q.value=layer.q;filter.frequency.setValueAtTime(layer.f*pitch,t);
      if(layer.f2)filter.frequency.exponentialRampToValueAtTime(layer.f2*pitch,t+layer.dur);
      envelope(gain.gain,t,layer.a,layer.dur,layer.g);source.connect(filter).connect(gain);route(gain,layer.wet);
      source.start(t,Math.random()*1.5);source.stop(t+layer.dur+0.03);end=Math.max(end,t+layer.dur+0.03);
    }
  }
  return end;
}

/**
 * @param {{mixer:UiMixer,isActive:()=>boolean,registry?:readonly {id:string,sounds?:string}[],
 *   load?:(url:string)=>Promise<unknown>,root?:URL}} options
 */
export function createUiSounds({mixer,isActive,registry=globalThis.VN_THEME_REGISTRY,root=new URL('../../',import.meta.url),
  load=url=>fetch(url).then(response=>response.ok?response.json():null)}) {
  /** @type {Map<string,Promise<UiSounds>>} */
  const files=new Map();
  /** @type {UiSounds} */
  let base={},theme={};
  let token=0,lastGesture=-Infinity,mergeTimer=0;
  /** @type {UiSoundEvent|null} */
  let pending=null;
  /** @type {Partial<Record<UiSoundEvent,number>>} */
  const played={};
  /** @type {{event:UiSoundEvent,out:GainNode,send:GainNode}|null} */
  let current=null;
  const heard=new WeakSet();

  /** @param {{id:string,sounds?:string}|undefined} entry @returns {Promise<UiSounds>} */
  function soundsOf(entry) {
    if(!entry?.sounds)return Promise.resolve({});
    let found=files.get(entry.id);
    if(!found) {
      found=load(new URL(entry.sounds,root).href).then(value=>readUiSounds(value).sounds).catch(()=>({}));
      files.set(entry.id,found);
    }
    return found;
  }
  function refresh() {
    const own=++token,id=document.documentElement.dataset.theme;
    void Promise.all([soundsOf(registry[0]),soundsOf(registry.find(entry=>entry.id===id))]).then(([fallback,active])=>{
      if(own===token){base=fallback;theme=active;}
    });
  }
  /** @param {UiSoundEvent} event */
  function play(event) {
    const sound=theme[event]??base[event],now=performance.now();
    if(!sound||now-(played[event]??-Infinity)<THROTTLE_MS)return;
    played[event]=now;
    mixer.ui((audio,channel)=>{
      const at=audio.currentTime;
      if(current&&current.event!=='chapter') {
        current.out.gain.setTargetAtTime(0,at,0.008);current.send.gain.setTargetAtTime(0,at,0.02);
      }
      const out=audio.createGain(),send=audio.createGain(),level=sound.gain*(1+(Math.random()*2-1)*LEVEL);
      out.gain.value=send.gain.value=level;out.connect(channel);send.connect(room(audio,channel));
      const end=drawUiSound(audio,sound,{out,send,pitch:1+(Math.random()*2-1)*PITCH,start:at+0.005});
      const mine={event,out,send};current=mine;
      setTimeout(()=>{out.disconnect();send.disconnect();if(current===mine)current=null;},(end-at+2)*1000);
    });
  }
  /** Asks for a sound caused by the reader's last click, key, wheel or touch. @param {UiSoundEvent} event */
  function request(event) {
    if(!isActive()||performance.now()-lastGesture>GESTURE_MS)return;
    if(!pending||WEIGHT[event]>WEIGHT[pending])pending=event;
    if(mergeTimer)return;
    mergeTimer=window.setTimeout(()=>{
      mergeTimer=0;const event=pending;pending=null;
      if(event)play(event);
    },MERGE_MS);
  }
  const gesture=()=>{lastGesture=performance.now();};
  for(const type of ['pointerdown','wheel','touchstart'])window.addEventListener(type,gesture,{capture:true,passive:true});
  window.addEventListener('keydown',event=>{if(!event.repeat)gesture();},{capture:true,passive:true});
  window.addEventListener('vn-theme-change',refresh);
  refresh();

  return {
    request,
    /**
     * Plays open or close when an element's state turns, for each element and test given.
     * @param {Iterable<Element>} elements @param {string[]} attributes @param {(element:Element)=>boolean} isOpen
     */
    watch(elements,attributes,isOpen) {
      for(const element of elements) {
        let open=isOpen(element);
        new MutationObserver(()=>{
          const next=isOpen(element);
          if(next===open)return;
          open=next;request(next?'open':'close');
        }).observe(element,{attributes:true,attributeFilter:attributes});
      }
    },
    /**
     * Plays select for clicks on buttons matching `buttons` and for changes to controls matching `controls`.
     * @param {string} buttons @param {string} controls
     */
    choices(buttons,controls) {
      document.addEventListener('click',event=>{
        if(event.target instanceof Element&&event.target.closest(buttons))request('select');
      },true);
      document.addEventListener('change',event=>{
        if(event.target instanceof Element&&event.target.matches(controls))request('select');
      },true);
    },
    /** The chapter title card: sounds the first time this card (the reader's intro object) is shown. @param {object} intro */
    chapter(intro) {
      if(heard.has(intro))return;
      heard.add(intro);
      if(isActive())play('chapter');
    },
  };
}
