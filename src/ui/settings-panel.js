import {textLanguage,typingInterval,readingMs} from '../reader/player-text.js';
/* The sample beside the reading settings: the current scene picture with a dialogue band that uses the live font size,
 * transparency and height, and plays a few lines at the chosen speed. Split by the script, each line takes the screen
 * alone; split by source paragraph, the lines of the paragraph stay and each one is added below the last, one per
 * "click" (here, after the auto-play pause). Text is set as plain text only. */
const SAMPLES={zh:['雨水沿着旅店的玻璃缓慢滑落。','她推开门，把伞上的水抖在门口的地毯上。','柜台后面的那盏灯还亮着。'],
  en:['Rain slid slowly down the windows of the inn.','She pushed the door open and shook her umbrella out on the mat.','The lamp behind the counter was still lit.'],
  ja:['雨が宿の窓ガラスをゆっくりと伝っていく。','彼女は扉を押し開け、傘の雫を入口の敷物に払った。','帳場の奥の灯りは、まだともっていた。']};

export function createSettingsSample({getSettings}) {
  const $=id=>document.getElementById(id);
  const text=$('settings-sample-text'),picture=$('settings-sample');
  let timer=null,running=false;
  function stop() {running=false;clearTimeout(timer);text.replaceChildren();}
  function play(index=0,kept=[]) {
    clearTimeout(timer);
    if(!running)return;
    const LINES=SAMPLES[textLanguage()]??SAMPLES.zh;
    const {split,speed,delay}=getSettings(),shown=split==='paragraph'?kept:[];
    text.replaceChildren(...shown.map(line=>Object.assign(document.createElement('span'),{textContent:line})));
    const current=document.createElement('span');text.append(current);
    const glyphs=[...LINES[index]];let visible=0;
    const next=()=>{timer=setTimeout(()=>{
      const last=index===LINES.length-1;
      play(last?0:index+1,last?[]:[...shown,LINES[index]]);
    },delay*1000+(speed?0:readingMs(glyphs.length)));};
    if(!speed){current.textContent=LINES[index];next();return;}
    const type=()=>{current.textContent=glyphs.slice(0,++visible).join('');if(visible<glyphs.length)timer=setTimeout(type,typingInterval(speed));else next();};
    type();
  }
  // The picture the reader is on, taken from whichever background layer shows one.
  function start(background) {
    const layer=[background,...background.querySelectorAll('*')].find(node=>getComputedStyle(node).backgroundImage!=='none');
    picture.style.backgroundImage=layer?getComputedStyle(layer).backgroundImage:'';
    running=true;play();
  }
  return {start,stop,restart:()=>{if(running)play();}};
}
