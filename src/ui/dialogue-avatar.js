import {createAvatarView} from './avatar-view.js';
import {figureLayout,stageFit} from '../reader/figure-layout.js';
import {figureTop} from './figure-metrics.js';
import {reducedMotion} from '../reader/transitions.js';

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
// A saved avatar square as fractions of the image height.
const squareOf=({crop,image})=>crop?{top:crop.y/image.height,size:crop.size/image.height}:null;
function placeFigure(entry,figure,placed) {
  const square=squareOf(figure);
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
const LEAVE_MS=280,MOVE_DELAY_MS=140,ENTER_DELAY_MS=260;

/* Standing portraits of everyone on stage. Figures are kept by character so that a person who stays
 * slides to a new place instead of reappearing; the focused speaker stands in front, the others behind and dimmed.
 * While someone off stage speaks, everyone standing is dimmed. Whoever leaves fades out first, those who stay then
 * slide to their new places, and newcomers fade in once the sliding has begun (the timings are in styles/style.css). */
export function createStandingStage(layer) {
  const reader=layer.closest('#reader'),shown=new Map();
  // Invisible boxes from the stage top to the hair line, the band top and the floor, and one image height tall: they
  // resolve the stylesheet's stage sizes (which the narrow text area and its settings change) and report when they do.
  const probes=Object.fromEntries(['hair','bandTop','floor','base'].map(name=>{
    const probe=document.createElement('div');
    probe.className='standing-figure stage-probe';probe.dataset.probe=name;layer.append(probe);
    return [name,probe];
  }));
  /* Everyone is enlarged and moved down together when an image would end above the floor (stageFit). The book's
   * cast (setCast: every look of every character) sets one zoom and shift for the whole book, so a figure keeps its
   * size whoever stands beside it; the stage's sizes still follow the screen. Looks without a saved avatar square
   * count with the reference hair line, so measuring an image never changes them. Without a cast, those on stage
   * set it. */
  let cast=[];
  function fit() {
    const layouts=cast.length?cast:[...shown.values()].map(entry=>entry.layout).filter(Boolean);
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
    const {frame}=shown.get(id);shown.delete(id);
    if(typeof frame.animate!=='function'||reducedMotion()){frame.remove();return;}
    // A leaving figure keeps the size and height it had while it fades.
    const {top,height}=getComputedStyle(frame);
    frame.style.top=top;frame.style.height=height;
    frame.classList.add('is-leaving');
    const gone=()=>frame.remove();
    frame.animate([{opacity:1},{opacity:0}],{duration:LEAVE_MS,easing:'ease-in',fill:'forwards'}).finished.then(gone,gone);
  }
  function render(figures) {
    const next=new Map(figures.map(f=>[f.id,f])),before=shown.size;
    let left=0;
    for(const [id,entry] of [...shown])if(next.get(id)?.image.src!==entry.src){remove(id);left++;}
    const places=PLACES[figures.length]??[],focus=figures.find(f=>f.focus)?.id??null;
    const placeOf=(figure,i)=>figure.place??places[i];
    // Those staying wait for the leavers to fade a little; newcomers wait for the sliding to begin.
    const moving=figures.some((figure,i)=>shown.has(figure.id)&&shown.get(figure.id).frame.dataset.place!==placeOf(figure,i));
    layer.style.setProperty('--move-delay',left?`${MOVE_DELAY_MS}ms`:'0ms');
    figures.forEach((figure,i)=>{
      let entry=shown.get(figure.id);
      if(!entry) {
        const frame=createAvatarView({kind:'standing',image:figure.image},figure.image.src);
        frame.classList.add('standing-figure','is-entering');
        frame.style.setProperty('--enter-delay',moving?`${ENTER_DELAY_MS}ms`:'0ms');
        frame.addEventListener?.('animationend',()=>frame.classList.remove('is-entering'),{once:true});
        layer.append(frame);
        entry={src:figure.image.src,frame};shown.set(figure.id,entry);
        placeFigure(entry,figure,fit);
      }else if(entry.key!==figureKey(figure))placeFigure(entry,figure,fit);
      entry.frame.dataset.place=placeOf(figure,i);
      entry.frame.classList.toggle('is-mirrored',!!figure.flip&&figure.flip===entry.frame.dataset.place);
      entry.frame.classList.toggle('is-front',figure.id===focus);
      entry.frame.classList.toggle('is-back',figure.back||!!focus&&figure.id!==focus);
    });
    fit();
    reader?.classList.toggle('has-standing',figures.length>0);
    if(before!==shown.size)window.dispatchEvent(new Event('vn-portrait-layout'));
  }
  // looks: {image,crop,stature} of every look of every character in the book.
  function setCast(looks) {
    cast=looks.map(look=>figureLayout(null,look.stature??1,squareOf(look)));
    fit();
  }
  return {render,setCast,clear:()=>render([])};
}
