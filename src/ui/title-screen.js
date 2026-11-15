import {playTransition} from '../reader/transitions.js';

// The opening title screen: black, fade in, wait for the reader, fade out to black.
// show() resolves once the screen has closed, whether by input or by cancel().
export function createTitleScreen() {
  const $=id=>document.getElementById(id);
  const root=$('title-screen'),content=$('title-screen-content'),art=$('title-screen-image');
  let session=null;
  async function decoded(src) {
    if(!src)return null;
    const img=new Image();img.src=src;
    try{await img.decode();return img;}catch{return null;}
  }
  /* A tall cover on a wide screen shows whole over a blurred copy of itself instead of losing most of its height to
   * cropping; a wide cover on a tall screen is cropped as before. */
  let tall=false;
  const fit=()=>root.classList.toggle('fit-whole',tall&&innerWidth>innerHeight);
  addEventListener('resize',fit);
  function show({title,author=null,src=null,contain=false,animate=true}) {
    session?.cancel();
    let phase='loading',url=null,animation=null,resolve;
    const closed=new Promise(r=>{resolve=r;});
    const current={
      advance(){
        if(phase==='in'){animation?.finish();return;}
        if(phase!=='wait')return;
        phase='out';
        const out=playTransition(content,'titleOut',{enabled:animate});
        if(out)out.finished.then(finish,finish);else finish();
      },
      cancel(){finish();},
    };
    function finish() {
      if(phase==='done')return;
      phase='done';
      for(const running of content.getAnimations())running.cancel();
      root.hidden=true;art.style.backgroundImage='';root.style.removeProperty('--title-image');tall=false;fit();content.style.opacity='';
      if(session===current)session=null;
      resolve();
    }
    session=current;
    $('title-screen-name').textContent=title;
    $('title-screen-author').textContent=author??'';$('title-screen-author').hidden=!author;
    content.style.opacity='0';root.classList.remove('has-image');root.classList.toggle('book-cover',contain);
    root.hidden=false;root.focus({preventScroll:true});
    void decoded(src).then(value=>{
      if(phase==='done')return;
      url=value?.src??null;
      tall=!!value&&value.naturalHeight>value.naturalWidth;fit();
      if(url){art.style.backgroundImage=`url("${url}")`;root.style.setProperty('--title-image',`url("${url}")`);}
      root.classList.toggle('has-image',!!url);
      phase='in';
      animation=playTransition(content,'titleIn',{enabled:animate});
      const ready=()=>{if(phase!=='in')return;phase='wait';content.style.opacity='1';animation?.cancel();};
      if(animation)animation.finished.then(ready,()=>{});else ready();
    });
    return closed;
  }
  root.addEventListener('click',()=>session?.advance());
  document.addEventListener('keydown',event=>{
    if(!session||document.querySelector('dialog[open]')||event.ctrlKey||event.metaKey||event.altKey)return;
    if(![' ','ArrowRight','Enter'].includes(event.key))return;
    event.preventDefault();
    if(!event.repeat)session.advance();
  });
  return {show,cancel(){session?.cancel();},get active(){return !!session;}};
}
