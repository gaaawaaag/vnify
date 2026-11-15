// A shared, text-only card; read current progress each time rather than caching future facts.
export function createCharacterHover({getPerson,colorFor,getAnnotation=()=>null,getTerm=()=>null,onVisibility=()=>{}}) {
  const card=document.createElement('div');
  card.id='character-hover';card.className='character-hover';card.role='tooltip';card.hidden=true;card.tabIndex=0;
  const name=document.createElement('strong'),summary=document.createElement('p');
  card.append(name,summary);document.body.append(card);
  // A touch has no hover: the first tap on a link shows its card, a second tap on the same link opens it.
  let anchor=null,timer,touchTap=null;
  const target=node=>node instanceof Element ? node.closest('#speaker,.character-mention,.annotation-mention,.term-mention') : null;
  function hide() {
    clearTimeout(timer);
    if(anchor)anchor.removeAttribute('aria-describedby');
    anchor=null;card.hidden=true;onVisibility(false);
  }
  function refresh() {
    if(!anchor)return;
    // A world term reads like a note: its name and a short explanation.
    const term=anchor.dataset.term?getTerm(anchor.dataset.term):null;
    const note=term?{text:term.summary}:anchor.dataset.annotation?getAnnotation(anchor.dataset.annotation):null;
    const person=note?null:getPerson(anchor.dataset.character);
    if((!person&&!note) || !anchor.isConnected || anchor.hidden || document.querySelector('dialog[open]')){hide();return;}
    const title=term?term.label:note?anchor.textContent:person.label,body=note?note.text:person.summary || '？？？';
    if(name.textContent!==title)name.textContent=title;
    if(summary.textContent!==body)summary.textContent=body;
    card.classList.toggle('annotation-hover',Boolean(note));
    if(person)card.style.setProperty('--person-color',colorFor(person.id));else card.style.removeProperty('--person-color');
    card.hidden=false;
    const rect=anchor.getBoundingClientRect(),margin=12,gap=10;
    const above=Math.max(0,rect.top-margin-gap),below=Math.max(0,innerHeight-rect.bottom-margin-gap);
    const onTop=above>=below;
    card.style.maxHeight=`${Math.max(1,Math.min(360,onTop?above:below))}px`;
    const box=card.getBoundingClientRect();
    card.style.left=`${Math.max(margin,Math.min(rect.left+(rect.width-box.width)/2,innerWidth-box.width-margin))}px`;
    const top=onTop?rect.top-box.height-gap:rect.bottom+gap;
    card.style.top=`${Math.max(margin,Math.min(top,innerHeight-box.height-margin))}px`;
  }
  function show(node) {
    if(!node?.textContent || (!node.dataset.character&&!node.dataset.annotation&&!node.dataset.term))return;
    hide();anchor=node;anchor.setAttribute('aria-describedby',card.id);refresh();
    if(!card.hidden){card.scrollTop=0;onVisibility(true);}
  }
  function leave(){clearTimeout(timer);timer=setTimeout(hide,180);}
  document.addEventListener('pointerover',event=>{
    if(event.pointerType==='touch')return;
    const node=target(event.target);if(node && !node.contains(event.relatedTarget))show(node);
  });
  document.addEventListener('pointerout',event=>{
    if(target(event.target)===anchor && !anchor?.contains(event.relatedTarget) && !card.contains(event.relatedTarget))leave();
  });
  document.addEventListener('focusin',event=>{const node=target(event.target);if(node)show(node);});
  document.addEventListener('focusout',event=>{if((target(event.target)===anchor||card.contains(event.target)) && !card.contains(event.relatedTarget) && event.relatedTarget!==anchor)leave();});
  card.addEventListener('pointerenter',()=>clearTimeout(timer));card.addEventListener('pointerleave',leave);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  document.addEventListener('pointerdown',event=>{
    const node=target(event.target);
    touchTap=event.pointerType==='touch'&&node?{node,shown:node===anchor&&!card.hidden}:null;
    if(!card.contains(event.target)&&node!==anchor)hide();
  },true);
  document.addEventListener('scroll',event=>{if(!card.contains(event.target))hide();},true);window.addEventListener('resize',hide);
  card.addEventListener('click',event=>event.stopPropagation());
  card.addEventListener('keydown',event=>{
    if([' ','ArrowDown','ArrowUp','PageDown','PageUp','Home','End','ArrowLeft','ArrowRight'].includes(event.key))event.stopPropagation();
  });
  // True when this tap only showed the card, so the caller should not open the link yet.
  function previewFirst(node) {
    if(touchTap?.node!==node||touchTap.shown)return false;
    touchTap.shown=true;show(node);return !card.hidden;
  }
  return {hide,refresh,previewFirst,get visible(){return !card.hidden;},showNote(node){show(node);if(!card.hidden)card.focus({preventScroll:true});}};
}
