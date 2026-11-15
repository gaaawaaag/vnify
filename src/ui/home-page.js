import {readingPercent} from './bookshelf.js';
import {t} from '../reader/player-text.js';

/* Home page: a photo behind the whole page, the shelf on frosted glass over it, and the book to continue in the photo's
 * lower left. The background is the default photo, the cover of the book read last, or an uploaded picture, with a
 * brightness; the choice is kept on the shelf (/api/library/_home), so every device of the shelf shows the same. */
const DEFAULT_PHOTO='assets/home/dusk.webp';
// Uploaded pictures are scaled down before they go to the shelf; phone photos are far larger than a screen needs.
const MAX_SIDE=2560;

async function shrink(file) {
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,MAX_SIDE/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  bitmap.close();
  const encode=(type,quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));
  const webp=await encode('image/webp',.86);
  return webp?.type==='image/webp'?webp:encode('image/jpeg',.88);
}

export function createHomePage({client,onOpen,toast,coverOf=book=>book.cover?client.coverURL(book.key,book.cover.at):null}) {
  const $=id=>document.getElementById(id);
  const photo=$('home-photo'),menu=$('home-background-menu'),button=$('home-background'),dim=$('home-dim');
  let settings={background:{kind:'default',dim:100,custom:null}},books=[],shown=null;

  function source() {
    const {kind,custom}=settings.background;
    if(kind==='custom'&&custom)return {url:client.homeBackgroundURL(custom.at),kind};
    const book=kind==='recent'&&books.find(item=>item.cover);
    if(book)return {url:client.coverURL(book.key,book.cover.at),kind};
    return {url:DEFAULT_PHOTO,kind:'default'};
  }
  // The new picture fades in once decoded; until then the old one stays.
  function apply() {
    const {url,kind}=source(),background=settings.background;
    $('home-backdrop').dataset.kind=kind;
    photo.style.filter=background.dim<100?`brightness(${background.dim/100})`:'';
    dim.value=String(background.dim);
    for(const item of menu.querySelectorAll('[data-background]'))item.setAttribute('aria-checked',String(item.dataset.background===background.kind));
    menu.querySelector('[data-background="custom"]').hidden=!background.custom;
    if(url===shown)return;
    shown=url;
    const next=new Image();next.decoding='async';
    next.onload=()=>{if(shown===url){photo.src=url;photo.classList.add('is-shown');}};
    next.onerror=()=>{if(shown===url&&url!==DEFAULT_PHOTO){shown=null;settings.background.kind='default';apply();}};
    next.src=url;
  }
  async function save(change) {
    const previous=settings;
    settings={...settings,background:{...settings.background,...change}};
    apply();
    try {settings=await client.saveHome({kind:settings.background.kind,dim:settings.background.dim});}
    catch(error) {settings=previous;apply();toast(error.message);}
  }

  function closeMenu() {menu.hidden=true;button.setAttribute('aria-expanded','false');}
  button.onclick=event=>{
    event.stopPropagation();
    const opens=menu.hidden;menu.hidden=!opens;button.setAttribute('aria-expanded',String(opens));
  };
  document.addEventListener('click',event=>{if(!menu.hidden&&!menu.contains(event.target))closeMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){closeMenu();button.focus();}});
  for(const item of menu.querySelectorAll('[data-background]'))item.onclick=()=>{
    if(item.dataset.background==='upload'){$('home-background-file').click();return;}
    closeMenu();void save({kind:item.dataset.background});
  };
  $('home-background-file').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';
    if(!file)return;
    closeMenu();
    try {settings=await client.saveHomeBackground(await shrink(file));apply();}
    catch(error) {toast(error.message||t('背景图片无法读取。'));}
  };
  // Dragging previews at once; the shelf keeps the value once the slider is let go.
  dim.oninput=()=>{photo.style.filter=`brightness(${dim.value/100})`;};
  dim.onchange=()=>void save({dim:Number(dim.value)});

  // The book read most recently and not finished; its cover keeps its own shape (wide or tall).
  function renderResume() {
    const root=$('home-resume');
    const book=books.find(item=>item.progress?.savedAt&&(readingPercent(item)??100)<100);
    root.hidden=!book;
    if(!book){root.replaceChildren();return;}
    const value=readingPercent(book);
    root.innerHTML=`<span class="resume-art"><span class="resume-cover is-wide"></span>
      <button class="resume-go" type="button"><svg class="resume-ring" viewBox="0 0 64 64" aria-hidden="true"><circle class="resume-track" cx="32" cy="32" r="30"/><circle class="resume-arc" cx="32" cy="32" r="30"/></svg><svg class="resume-play" aria-hidden="true"><use href="#i-play"/></svg></button></span>
      <span class="resume-body"><span class="resume-label">${t('继续阅读')}</span><span class="resume-title"></span><span class="resume-meta"></span></span>`;
    const cover=root.querySelector('.resume-cover'),go=root.querySelector('.resume-go'),meta=root.querySelector('.resume-meta');
    const src=coverOf(book);
    if(src) {
      const img=new Image();img.alt='';img.decoding='async';
      img.onload=()=>cover.classList.toggle('is-wide',img.naturalWidth>=img.naturalHeight);
      img.onerror=()=>{img.remove();cover.classList.add('empty');};
      img.src=src;cover.append(img);
    } else cover.classList.add('empty');
    root.querySelector('.resume-title').textContent=book.title;
    if(book.progress.chapter)meta.append(Object.assign(document.createElement('span'),{textContent:book.progress.chapter}),
      Object.assign(document.createElement('span'),{className:'resume-sep',textContent:'/'}));
    meta.append(Object.assign(document.createElement('span'),{textContent:`${value}%`}));
    go.style.setProperty('--progress',String(value));
    go.setAttribute('aria-label',t('继续阅读《{title}》，已读 {n}%',{title:book.title,n:value}));
    go.onclick=cover.onclick=()=>onOpen(book);
  }

  void client.home().then(value=>{settings=value;apply();},()=>apply());
  return {
    show(list) {books=list;renderResume();apply();},
    // The interface language changed: the card's words follow.
    relabel:renderResume,
  };
}
