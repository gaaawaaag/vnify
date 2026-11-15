import {createAvatarView} from './avatar-view.js';
import {figureLayout,stageFit} from '../reader/figure-layout.js';
import {figureTop} from './figure-metrics.js';

const SIDE_MIN=140;

// Keep images independent of text rendering so asset updates never restart typing.
// A square avatar sits at the dialogue's top left when the speaker is not standing on stage. On wide screens with
// room left of the text column it stands there instead, unframed and on the screen bottom, and the text stays put.
export function createDialogueAvatar(card) {
  let current=null,frame=null;
  function place() {
    if(!frame)return;
    const stage=card.closest?.('#stage'),box=card.getBoundingClientRect(),area=stage?.getBoundingClientRect();
    if(!area||!box.width)return;
    const side=box.left-area.left,fits=!matchMedia('(max-width:600px)').matches&&side>=SIDE_MIN;
    card.classList.toggle('has-side-portrait',fits);frame.classList.toggle('is-side',fits);
    card.style.setProperty('--side-space',`${Math.round(side)}px`);
    card.style.setProperty('--side-drop',`${Math.round(area.bottom-box.bottom)}px`);
  }
  if(typeof ResizeObserver==='function')new ResizeObserver(place).observe(card);
  window.addEventListener('resize',place);
  function clear() {
    frame?.remove();frame=null;current=null;
    card.classList.remove('has-portrait','has-side-portrait');
    window.dispatchEvent(new Event('vn-portrait-layout'));
  }
  function render(avatar) {
    if(!avatar){if(current)clear();return;}
    const {image,crop}=avatar;
    if(current?.src===image.src && current.x===crop?.x && current.y===crop?.y && current.size===crop?.size)return;
    clear();
    current={src:image.src,...crop};
    frame=createAvatarView(avatar,image.src);
    frame.id='dialogue-avatar';card.prepend(frame);card.classList.add('has-portrait');place();
    window.dispatchEvent(new Event('vn-portrait-layout'));
  }
  return {render,clear};
}

// Every portrait is drawn at the stage's image height; the hair top is measured from a transparent image once decoded.
// A saved avatar square sets the size and the hair line instead, and nothing is measured.
const figureKey=figure=>`${figure.stature??1}|${figure.crop?[figure.crop.y,figure.crop.size]:''}`;
function placeFigure(entry,figure,placed) {
  const {crop,image}=figure,square=crop?{top:crop.y/image.height,size:crop.size/image.height}:null;
  const apply=hairTop=>{
    const layout=figureLayout(hairTop,figure.stature??1,square);
    for(const key of ['scale','top','drop'])entry.frame.style.setProperty(`--figure-${key}`,layout[key].toFixed(4));
    entry.layout=layout;placed();
  };
  entry.key=figureKey(figure);
  apply(entry.top??null);
  if(square||entry.top!==undefined)return;
  figureTop(figure.image.src).then(top=>{
    entry.top=top;
    if(top!==null&&entry.frame.isConnected)apply(top);
  });
}

import {PLACES} from '../reader/staging.js';

/* Standing portraits of everyone on stage. Figures are kept by character so that a person who stays
 * slides to a new place instead of reappearing; the focused speaker stands in front, the others behind and dimmed.
 * While someone off stage speaks, everyone standing is dimmed. */
export function createStandingStage(layer) {
  const reader=layer.closest('#reader'),shown=new Map();
  // Invisible boxes from the stage top to the hair line, the band top and the floor, and one image height tall: they
  // resolve the stylesheet's stage sizes (which the narrow text area and its settings change) and report when they do.
  const probes=Object.fromEntries(['hair','bandTop','floor','base'].map(name=>{
    const probe=document.createElement('div');
    probe.className='standing-figure stage-probe';probe.dataset.probe=name;layer.append(probe);
    return [name,probe];
  }));
  // Everyone on stage is enlarged and moved down together when an image would end above the floor (stageFit).
  function fit() {
    const layouts=[...shown.values()].map(entry=>entry.layout).filter(Boolean);
    const size=name=>probes[name].getBoundingClientRect().height;
    const {zoom,shift}=stageFit(layouts,{height:layer.clientHeight,hair:size('hair'),floor:size('floor'),bandTop:size('bandTop'),base:size('base')});
    layer.style.setProperty('--stage-zoom',zoom.toFixed(4));
    layer.style.setProperty('--stage-shift',`${shift.toFixed(1)}px`);
  }
  if(typeof ResizeObserver==='function') {
    const watch=new ResizeObserver(fit);
    watch.observe(layer);for(const probe of Object.values(probes))watch.observe(probe);
  }
  function remove(id) {
    const entry=shown.get(id);
    entry.frame.remove();shown.delete(id);
  }
  function render(figures) {
    const next=new Map(figures.map(f=>[f.id,f])),before=shown.size;
    for(const [id,entry] of [...shown])if(next.get(id)?.image.src!==entry.src)remove(id);
    const places=PLACES[figures.length]??[],focus=figures.find(f=>f.focus)?.id??null;
    figures.forEach((figure,i)=>{
      let entry=shown.get(figure.id);
      if(!entry) {
        const frame=createAvatarView({kind:'standing',image:figure.image},figure.image.src);
        frame.classList.add('standing-figure');layer.append(frame);
        entry={src:figure.image.src,frame};shown.set(figure.id,entry);
        placeFigure(entry,figure,fit);
      }else if(entry.key!==figureKey(figure))placeFigure(entry,figure,fit);
      entry.frame.dataset.place=figure.place??places[i];
      entry.frame.classList.toggle('is-mirrored',!!figure.flip&&figure.flip===entry.frame.dataset.place);
      entry.frame.classList.toggle('is-front',figure.id===focus);
      entry.frame.classList.toggle('is-back',figure.back||!!focus&&figure.id!==focus);
    });
    fit();
    reader?.classList.toggle('has-standing',figures.length>0);
    if(before!==shown.size)window.dispatchEvent(new Event('vn-portrait-layout'));
  }
  return {render,clear:()=>render([])};
}
