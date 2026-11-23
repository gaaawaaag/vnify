import {isColor} from '../core/colors.js';

// Fish Audio models the reader offers; the free development model comes first and is the default.
export const FISH_MODELS=['s2.1-pro-free','s2.1-pro'];
// ElevenLabs speech models the reader offers; the first is the default.
export const ELEVENLABS_MODELS=['eleven_multilingual_v2','eleven_flash_v2_5','eleven_v3'];
// Gemini TTS models the reader offers; the first is the default.
export const GEMINI_TTS_MODELS=['gemini-3.8-flash-tts','gemini-3.8-flash-lite-tts'];

// split: 'script' shows one unit per screen (short lines the parser joins stay together); 'paragraph' puts each source
// paragraph on one screen.
// Memory/dream effects always show and the source/line debug line stays off; the settings no longer offer them.
// voice: what is read aloud ('off', 'dialogue' or 'all' with narration); voiceOn: what the quick switch turns it back on to;
// volumes 0–100; voiceRate 0.5–2.
const defaults={font:20,speed:20,delay:2.5,effects:true,debug:false,split:'script',voice:'off',voiceOn:'all',masterVolume:100,musicVolume:70,ambienceVolume:60,effectsVolume:80,uiVolume:50,voiceVolume:100,voiceRate:1};
export function normalizeSettings(value) {
  const settings={...defaults,...(value && typeof value==='object'?value:{})};
  settings.font=Math.max(16,Math.min(32,Number(settings.font)||defaults.font));
  settings.speed=[0,20,40,75].includes(Number(settings.speed))?Number(settings.speed):defaults.speed;
  settings.delay=Math.max(1,Math.min(8,Number(settings.delay)||2.5));
  settings.split=settings.split==='paragraph'?'paragraph':'script';
  settings.voice=['dialogue','all'].includes(settings.voice)?settings.voice:'off';
  settings.voiceOn=settings.voice!=='off'?settings.voice:settings.voiceOn==='dialogue'?'dialogue':'all';
  for(const key of ['masterVolume','musicVolume','ambienceVolume','effectsVolume','uiVolume','voiceVolume']) {
    const volume=Math.round(Number(settings[key]));
    settings[key]=Number.isFinite(volume)?Math.max(0,Math.min(100,volume)):defaults[key];
  }
  settings.voiceRate=Math.max(0.5,Math.min(2,Number(settings.voiceRate)||1));
  settings.effects=true;settings.debug=false;
  return settings;
}

// Reading settings and character colours stay in this browser (localStorage); positions live on the shelf.
export function createReaderStore({getLocalStorage=()=>globalThis.localStorage}={}) {
  function readPreference(key) {
    try { return JSON.parse(getLocalStorage().getItem(key)||'null'); } catch { return null; }
  }
  function writePreference(key,value) { getLocalStorage().setItem(key,JSON.stringify(value)); }
  return {
    readSettings:()=>normalizeSettings(readPreference('vn-settings')),
    saveSettings:value=>writePreference('vn-settings',value),
    readColors() {
      const colors=Object.create(null),value=readPreference('vn-character-colors');
      if(value && typeof value==='object')for(const [key,color] of Object.entries(value))if(isColor(color))colors[key]=color;
      return colors;
    },
    saveColors:value=>writePreference('vn-character-colors',value),
    // Browser voices chosen per book ({narrator,other,characters:{id:name}}); voices differ between devices, so they stay here.
    readVoices(bookId) {
      const value=readPreference('vn-voices')?.[bookId];
      if(!value||typeof value!=='object')return {characters:{}};
      const name=v=>typeof v==='string'&&v?v:undefined;
      const characters=Object.fromEntries(Object.entries(value.characters??{}).filter(([,v])=>name(v)));
      return {narrator:name(value.narrator),other:name(value.other),characters};
    },
    // Speech services set up in this browser: each service's key and model (and Fish Audio voices saved earlier, {id,label}).
    // Keys stay here.
    readTts() {
      const saved=readPreference('vn-tts'),fish=saved?.fish,eleven=saved?.elevenlabs,gemini=saved?.gemini;
      const text=(v,limit)=>typeof v==='string'?v.trim().slice(0,limit):'';
      const voices=Array.isArray(fish?.voices)?fish.voices.filter(v=>/^[A-Za-z0-9_-]{1,128}$/.test(v?.id))
        .map(v=>({id:v.id,label:text(v.label,200)||v.id})).slice(0,200):[];
      return {fish:{key:text(fish?.key,512),model:FISH_MODELS.includes(fish?.model)?fish.model:FISH_MODELS[0],voices},
        elevenlabs:{key:text(eleven?.key,512),model:ELEVENLABS_MODELS.includes(eleven?.model)?eleven.model:ELEVENLABS_MODELS[0]},
        gemini:{key:text(gemini?.key,512),model:GEMINI_TTS_MODELS.includes(gemini?.model)?gemini.model:GEMINI_TTS_MODELS[0]}};
    },
    saveTts:value=>writePreference('vn-tts',value),
    saveVoices(bookId,cast) {
      const all=readPreference('vn-voices');
      writePreference('vn-voices',{...(all&&typeof all==='object'?all:{}),[bookId]:cast});
    },
    // Names this browser in the shelf's reading data, so each device keeps its own positions and sessions.
    // Without storage the id lasts as long as the page.
    deviceId() {
      let id=null;
      try {id=getLocalStorage().getItem('vn-device');} catch {}
      if(typeof id==='string'&&/^d-[a-z0-9]{6,40}$/.test(id))return id;
      id=`d-${Date.now().toString(36)}${Math.random().toString(36).slice(2,10)}`;
      try {getLocalStorage().setItem('vn-device',id);} catch {}
      return id;
    },
  };
}
