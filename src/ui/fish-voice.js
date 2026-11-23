// @ts-check
/* Speaks lines with Fish Audio through the shelf's pass-on route (src/server/tts.mjs); the key travels with each request
 * from this browser. Each line's audio is kept for a while (same text, voice, model and speed), so reading back or
 * hearing a preview again costs nothing, and the next line can be asked for while this one plays. Voice details for the
 * voice list come straight from Fish Audio, which allows that from a page. */

const CACHE=24,FISH_API='https://api.fish.audio';

/** @typedef {{voice:string,key:string,model:string,speed:number,language?:string,style?:string}} FishOptions */

/** A Fish Audio voice ID from an ID or a link to the voice's page (32 hex characters). @param {string} value */
export function fishVoiceId(value) {
  const text=value.trim(),found=/[0-9a-f]{32}/i.exec(text);
  return found?found[0].toLowerCase():/^[A-Za-z0-9_-]{1,128}$/.test(text)?text:null;
}

/* onWaiting(true) when a line to speak is waiting for its audio, onWaiting(false) once it plays, fails or is stopped. */
export function createFishVoice({request=globalThis.fetch.bind(globalThis),endpoint='/api/tts/fish',clientSpeed=false,onWaiting=(/** @type {boolean} */ _)=>{}}={}) {
  /** @type {Map<string,Promise<string>>} */
  const cache=new Map();
  let token=0;
  /** @type {HTMLAudioElement|null} */
  let playing=null;
  /** @type {(value:'cancel')=>void} */
  let settle=()=>{};
  /** @param {string} text @param {FishOptions} options */
  function audioURL(text,options) {
    const id=JSON.stringify([text,options.voice,options.model,clientSpeed?1:options.speed,options.style??'']);
    let found=cache.get(id);
    if(found){cache.delete(id);cache.set(id,found);return found;}
    found=(async()=>{
      const response=await request(endpoint,{method:'POST',
        headers:{'Content-Type':'application/json','X-TTS-Key':options.key,'X-TTS-Model':options.model},
        body:JSON.stringify({text,voice:options.voice,speed:options.speed,...(options.language?{language:options.language}:{}),
          ...(options.style?{style:options.style}:{})})});
      if(!response.ok){
        let message='';try{message=(await response.json()).error;}catch{}
        throw Object.assign(new Error(message||`HTTP ${response.status}`),{status:response.status});
      }
      return URL.createObjectURL(await response.blob());
    })();
    found.catch(()=>cache.delete(id));
    cache.set(id,found);
    while(cache.size>CACHE) {
      const [oldest,url]=cache.entries().next().value??[];
      if(oldest===undefined)break;
      cache.delete(oldest);void url?.then(URL.revokeObjectURL,()=>{});
    }
    return found;
  }
  return {
    /** Asks for a line ahead of time. @param {string} text @param {FishOptions} options */
    prefetch(text,options) {void audioURL(text,options).catch(()=>{});},
    /**
     * Speaks a line; settles with 'end', 'cancel' (stopped or replaced) or the error that kept it from playing.
     * @param {string} text @param {FishOptions} options @param {number} volume 0–1
     * @returns {Promise<'end'|'cancel'|Error>}
     */
    speak(text,options,volume) {
      this.stop();
      const own=++token;
      onWaiting(true);
      return new Promise(resolve=>{
        settle=resolve;
        audioURL(text,options).then(url=>{
          if(own!==token)return;
          onWaiting(false);
          const audio=new Audio(url);
          audio.volume=Math.max(0,Math.min(1,volume));
          if(clientSpeed)audio.playbackRate=Math.max(0.5,Math.min(2,options.speed||1));
          playing=audio;
          const done=(/** @type {'end'|Error} */ result)=>{if(own!==token)return;playing=null;settle=()=>{};resolve(result);};
          audio.onended=()=>done('end');
          audio.onerror=()=>done(new Error('无法播放朗读音频。'));
          audio.play().catch(error=>done(error instanceof Error?error:new Error(String(error))));
        },error=>{if(own===token){onWaiting(false);settle=()=>{};resolve(error);}});
      });
    },
    stop() {
      token++;onWaiting(false);
      if(playing){playing.pause();playing=null;}
      const resolve=settle;settle=()=>{};resolve('cancel');
    },
    /** The voice's name on Fish Audio, or null when it cannot be found. @param {string} id @param {string} key */
    async voiceName(id,key) {
      const response=await request(`${FISH_API}/model/${encodeURIComponent(id)}`,{headers:key?{Authorization:`Bearer ${key}`}:{}});
      if(response.status===404)return null;
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const value=await response.json();
      return typeof value?.title==='string'&&value.title.trim()?value.title.trim():id;
    },
  };
}
