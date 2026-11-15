import {isColor} from '../core/colors.js';

// split: 'script' shows one unit per screen (short lines the parser joins stay together); 'paragraph' puts each source
// paragraph on one screen.
// Memory/dream effects always show and the source/line debug line stays off; the settings no longer offer them.
const defaults={font:20,speed:20,delay:2.5,effects:true,debug:false,split:'script'};
export function normalizeSettings(value) {
  const settings={...defaults,...(value && typeof value==='object'?value:{})};
  settings.font=Math.max(16,Math.min(32,Number(settings.font)||defaults.font));
  settings.speed=[0,20,40,75].includes(Number(settings.speed))?Number(settings.speed):defaults.speed;
  settings.delay=Math.max(1,Math.min(8,Number(settings.delay)||2.5));
  settings.split=settings.split==='paragraph'?'paragraph':'script';
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
