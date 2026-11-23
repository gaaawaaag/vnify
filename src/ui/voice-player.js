// @ts-check
/* Speaks one line at a time with the browser's speech engine (Web Speech API). Speaking a new line or stopping cancels
 * the one before; the returned promise settles with 'end' or 'cancel'. Some engines never report the end of an
 * utterance, so each piece also has a time limit after which it counts as finished. */

import {speechChunks} from '../reader/speech.js';

/** @typedef {{voice:SpeechSynthesisVoice|null,lang:string,rate:number,pitch:number,volume:number}} SpeakOptions */

export function createVoicePlayer({synth=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance}={}) {
  const supported=Boolean(synth&&Utterance);
  let token=0,listeners=new Set();
  /** @type {(value:'cancel')=>void} */
  let settleCurrent=()=>{};
  // Utterances are kept referenced while spoken: some engines drop their end event once one is collected.
  let speaking=[];
  if(supported)synth.addEventListener?.('voiceschanged',()=>{for(const listener of listeners)listener();});
  /** @param {string} text @param {SpeakOptions} options @param {number} own @returns {Promise<boolean>} */
  function speakPiece(text,options,own) {
    return new Promise(resolve=>{
      const utterance=new Utterance(text);
      utterance.lang=options.voice?.lang||options.lang;
      if(options.voice)utterance.voice=options.voice;
      utterance.rate=options.rate;utterance.pitch=options.pitch;utterance.volume=options.volume;
      // Roughly the longest such a piece can take, with room for a slow start.
      const limit=setTimeout(()=>done(),4000+Array.from(text).length*450/options.rate);
      const done=()=>{clearTimeout(limit);speaking=speaking.filter(item=>item!==utterance);resolve(own===token);};
      utterance.onend=done;utterance.onerror=done;
      speaking.push(utterance);synth.speak(utterance);
    });
  }
  return {
    supported,
    /** @returns {SpeechSynthesisVoice[]} */
    voices:()=>supported?synth.getVoices():[],
    /** Called when the list of voices changes (it often arrives after the page loads). @param {()=>void} listener */
    onVoices(listener) {listeners.add(listener);return ()=>listeners.delete(listener);},
    /** @param {string} text @param {SpeakOptions} options @returns {Promise<'end'|'cancel'>} */
    speak(text,options) {
      this.stop();
      if(!supported)return Promise.resolve('cancel');
      const own=++token;
      return new Promise(resolve=>{
        settleCurrent=resolve;
        (async()=>{
          for(const piece of speechChunks(text))if(!await speakPiece(piece,options,own))return;
          if(own===token){settleCurrent=()=>{};resolve('end');}
        })();
      });
    },
    stop() {
      token++;const settle=settleCurrent;settleCurrent=()=>{};
      if(supported&&(synth.speaking||synth.pending))synth.cancel();
      settle('cancel');
    },
  };
}
