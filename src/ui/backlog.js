import {t} from '../reader/player-text.js';
/* The backlog grows out of the dialogue band: the last line stays where the band showed it and earlier lines stack
 * above it. Wheel up, ArrowUp or a finger dragged down on the page opens it; scrolling on past its end, Escape, the
 * close button or a click on the current line closes it, and a click on an earlier line goes back there. */
export function createBacklog({entries,canOpen,onOpen,onJump}) {
  const $=id=>document.getElementById(id),reader=$('reader'),root=$('backlog'),scroll=$('backlog-scroll'),list=$('backlog-list');
  const isOpen=()=>!root.hidden;
  // The bottom of a text's last line box, not of its element, which may keep a minimum height.
  const lastLine=node=>{
    const range=document.createRange();range.selectNodeContents(node);
    const rects=[...range.getClientRects()];
    return rects.length?Math.max(...rects.map(r=>r.bottom)):node.getBoundingClientRect().bottom;
  };
  const atEnd=()=>scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-2;
  function entry({index,name,color,thought,isDocument,text},current) {
    const item=isDocument?t('资料'):name,button=document.createElement('button');
    button.type='button';button.className='backlog-entry'+(current?' current':'')+(item?'':' narration');
    button.setAttribute('role','listitem');
    if(item) {
      const label=document.createElement('span');label.className='backlog-name';label.textContent=item;
      if(color)label.style.color=color;
      if(thought){const tag=document.createElement('small');tag.textContent=t('心声');label.append(tag);}
      button.append(label);
    }
    const line=document.createElement('span');line.className='backlog-text';line.textContent=thought?t('（{text}）',{text}):text;
    button.append(line);
    button.onclick=event=>{event.stopPropagation();if(current)close();else{close();onJump(index);}};
    return button;
  }
  function open() {
    if(isOpen()||!canOpen())return;
    const items=entries();
    if(!items.length)return;
    onOpen();
    // Measured before the band is hidden: the last line of the current text stays exactly where the band showed it.
    const aligned=!reader.classList.contains('document-mode')&&!$('reading-stack').hidden;
    const target=aligned?lastLine($('text')):null;
    list.replaceChildren(...items.map((item,i)=>entry(item,i===items.length-1)));
    root.hidden=false;reader.classList.add('backlog-open');
    scroll.style.paddingBottom='';
    if(target!==null) {
      scroll.style.paddingBottom='0px';scroll.scrollTop=scroll.scrollHeight;
      const shift=lastLine(list.lastElementChild.querySelector('.backlog-text'))-target;
      scroll.style.paddingBottom=`${Math.max(8,shift)}px`;
    }
    scroll.scrollTop=scroll.scrollHeight;
    scroll.focus({preventScroll:true});
  }
  function close() {
    if(!isOpen())return;
    root.hidden=true;reader.classList.remove('backlog-open');list.replaceChildren();
    $('stage').focus({preventScroll:true});
  }
  // While open the backlog takes every key: it scrolls, closes at the end, and lets nothing advance the text.
  function key(event) {
    if(!isOpen())return false;
    const page=scroll.clientHeight*.85,step={ArrowUp:-60,ArrowDown:60,PageUp:-page,PageDown:page}[event.key];
    if(event.key==='Escape'||event.key.toLowerCase()==='h'||(['ArrowDown','PageDown',' '].includes(event.key)&&atEnd()))close();
    else if(step)scroll.scrollBy({top:step});
    else if(event.key==='Home'||event.key==='End')scroll.scrollTo({top:event.key==='Home'?0:scroll.scrollHeight});
    else return true;
    event.preventDefault();return true;
  }
  // A gesture on the page opens the backlog unless it scrolls the text box itself.
  const scrolledText=target=>{
    const body=$('reading-body');return body.contains(target)&&(body.scrollTop>0||$('text').scrollTop>0);
  };
  const stage=$('stage');
  stage.addEventListener('wheel',event=>{
    if(event.deltaY>=0||event.ctrlKey||scrolledText(event.target)||!canOpen())return;
    event.preventDefault();open();
  },{passive:false});
  root.addEventListener('wheel',event=>{if(event.deltaY>0&&atEnd()){event.preventDefault();close();}},{passive:false});
  let touch=null;
  stage.addEventListener('touchstart',event=>{
    touch=event.touches.length===1&&!scrolledText(event.target)?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;
  },{passive:true});
  stage.addEventListener('touchmove',event=>{
    if(!touch)return;
    const dx=event.touches[0].clientX-touch.x,dy=event.touches[0].clientY-touch.y;
    if(dy>56&&dy>Math.abs(dx)*1.5){touch=null;open();}
  },{passive:true});
  root.addEventListener('touchstart',event=>{touch=atEnd()?{y:event.touches[0].clientY}:null;},{passive:true});
  root.addEventListener('touchmove',event=>{if(touch&&event.touches[0].clientY-touch.y<-56&&atEnd()){touch=null;close();}},{passive:true});
  $('backlog-close').onclick=event=>{event.stopPropagation();close();};
  return {open,close,key,isOpen};
}
