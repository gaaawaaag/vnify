import {playTransition} from '../reader/transitions.js';
import {t} from '../reader/player-text.js';

/* The opening title screen: black, fade in, wait for the reader, fade out to black. The cover stands whole beside a
 * column with the title, author and blurb over a blurred copy of itself (stacked on narrow screens). What the column
 * offers follows where the reader is in the book:
 * - first time: "click to start"; any click or key starts.
 * - coming back: where they were and when, and "continue"; any click or key continues.
 * - finished: when, and the rating; "read again" starts over, "look back at the end" opens the end card, and any other
 *   click or key continues where they were, so no place is lost by a stray click.
 * show() resolves once the screen has closed, with 'continue', 'restart' or 'end' ('continue' also when cancelled). */
export function createTitleScreen() {
  const $=id=>document.getElementById(id);
  const root=$('title-screen'),content=$('title-screen-content'),art=$('title-screen-image');
  let session=null;
  async function decoded(src) {
    if(!src)return null;
    const img=new Image();img.src=src;
    try{await img.decode();return img;}catch{return null;}
  }
  const element=(tag,className,text)=>Object.assign(document.createElement(tag),className?{className}:{},text!==undefined?{textContent:text}:{});
  // Today, yesterday, n days ago, then the date.
  function since(time) {
    const day=value=>{const date=new Date(value);return new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime();};
    const days=Math.round((day(Date.now())-day(time))/86_400_000);
    if(days<=0)return t('今天');
    if(days===1)return t('昨天');
    if(days<30)return t('{n} 天前',{n:days});
    const date=new Date(time);return t('{m} 月 {d} 日',{m:date.getMonth()+1,d:date.getDate()});
  }
  function stateLine(state) {
    const line=$('title-screen-state');line.replaceChildren();
    const sep=()=>element('span','title-screen-sep','/');
    line.append(element('i','title-screen-dot'));
    if(state.kind==='back') {
      if(state.chapter)line.append(element('span','',state.chapter),sep());
      const bar=element('span','title-screen-bar'),fill=element('b');fill.style.width=`${state.percent}%`;bar.append(fill);
      line.append(element('span','',`${state.percent}%`),bar);
      if(state.savedAt)line.append(sep(),element('span','',since(state.savedAt)));
    } else {
      const date=new Date(state.finishedAt);
      line.append(element('span','',t('{m} 月 {d} 日读完',{m:date.getMonth()+1,d:date.getDate()})));
      if(state.rating) {
        const box=element('span','mini-diamonds');box.setAttribute('aria-label',t('{n} 分',{n:state.rating}));
        for(let n=1;n<=5;n++)box.append(element('i',n<=state.rating?'on':''));
        line.append(sep(),box);
      }
    }
    line.hidden=false;
  }
  function actions(state) {
    const box=$('title-screen-actions');box.replaceChildren();
    const button=(label,action,primary)=>{
      const node=element('button',primary?'primary':'',t(label));node.type='button';node.dataset.action=action;box.append(node);
    };
    if(state.kind==='back')button('继续阅读','continue',true);
    if(state.kind==='done'){button('重新阅读','restart',true);button('回看结尾','end',false);}
    box.hidden=!box.children.length;
  }
  /** @param {{title:string,author?:string|null,blurb?:string|null,src?:string|null,animate?:boolean,
   *   state?:{kind:'first'}|{kind:'back',chapter:string,percent:number,savedAt:number|null}|{kind:'done',finishedAt:number,rating:number|null}}} options */
  function show({title,author=null,blurb=null,src=null,animate=true,state={kind:'first'}}) {
    session?.cancel();
    let phase='loading',animation=null,resolve;
    const closed=new Promise(r=>{resolve=r;});
    const current={
      // Input while fading in skips the fade; a button acts at once, since the reader chose where to go.
      advance(action='continue',chosen=false){
        if(phase==='in'){animation?.finish();settle();if(!chosen)return;}
        if(phase!=='wait')return;
        phase='out';
        const done=()=>finish(action);
        const out=playTransition(content,'titleOut',{enabled:animate});
        if(out)out.finished.then(done,done);else done();
      },
      cancel(){finish('continue');},
    };
    function settle() {if(phase!=='in')return;phase='wait';content.style.opacity='1';animation?.cancel();}
    function finish(action) {
      if(phase==='done')return;
      phase='done';
      for(const running of content.getAnimations())running.cancel();
      root.hidden=true;art.style.backgroundImage='';root.style.removeProperty('--cover-ratio');root.style.removeProperty('--title-image');
      content.style.opacity='';
      if(session===current)session=null;
      resolve(action);
    }
    session=current;
    $('title-screen-name').textContent=title;
    $('title-screen-author').textContent=author??'';$('title-screen-author').hidden=!author;
    $('title-screen-blurb').textContent=blurb??'';$('title-screen-blurb').hidden=!blurb;
    $('title-screen-hint').hidden=state.kind!=='first';
    if(state.kind==='first')$('title-screen-state').hidden=true;else stateLine(state);
    actions(state);
    content.style.opacity='0';root.classList.remove('has-image','tall-cover');
    root.hidden=false;root.focus({preventScroll:true});
    void decoded(src).then(value=>{
      if(phase==='done')return;
      const url=value?.src??null;
      if(url) {
        art.style.backgroundImage=`url("${url}")`;root.style.setProperty('--cover-ratio',String(value.naturalWidth/value.naturalHeight));
        root.style.setProperty('--title-image',`url("${url}")`);
        root.classList.toggle('tall-cover',value.naturalHeight>value.naturalWidth);
      }
      root.classList.toggle('has-image',!!url);
      phase='in';
      animation=playTransition(content,'titleIn',{enabled:animate});
      if(animation)animation.finished.then(settle,()=>{});else settle();
    });
    return closed;
  }
  // A button chooses where to go; a click anywhere else (not on the blurb being scrolled or selected) continues.
  root.addEventListener('click',event=>{
    if(!session)return;
    const button=event.target.closest('#title-screen-actions button');
    if(button){session.advance(button.dataset.action,true);return;}
    if(getSelection()?.toString())return;
    session.advance('continue');
  });
  document.addEventListener('keydown',event=>{
    if(!session||document.querySelector('dialog[open]')||event.ctrlKey||event.metaKey||event.altKey)return;
    if(![' ','ArrowRight','Enter'].includes(event.key))return;
    // Enter or space on a focused button is that button's click.
    if(event.target.closest?.('#title-screen-actions button')&&event.key!=='ArrowRight')return;
    event.preventDefault();
    if(!event.repeat)session.advance('continue');
  });
  return {show,cancel(){session?.cancel();},get active(){return !!session;}};
}
