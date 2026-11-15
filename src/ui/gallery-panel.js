import {t} from '../reader/player-text.js';
import {GALLERY_CATEGORIES,galleryEntries} from '../reader/gallery.js';

/* The gallery covers the whole stage like the cast: categories down the left (a row of chips on narrow screens), the
 * chosen category's thumbnails on the right. Pictures the reader has not reached are fogged and nameless; a click on
 * one lifts the fog for it, and "显示全部" lifts it for all. Both last until the gallery closes. A visible thumbnail
 * opens the full picture, with the others of its category a key or button away. Opening it never moves the story. */
export function createGalleryPanel({getBook,onOpen=()=>{},onClose=()=>{}}) {
  const $=id=>document.getElementById(id);
  const dialog=$('gallery-dialog'),viewer=$('gallery-viewer'),reveal=$('gallery-reveal');
  let entries=[],category=null,revealed=new Set(),all=false,viewing=null,bookId=null;
  const element=(tag,className,text)=>Object.assign(document.createElement(tag),className?{className}:{},text!==undefined?{textContent:text}:{});
  const visible=entry=>all||entry.reached||revealed.has(entry.id);
  const inCategory=id=>entries.filter(entry=>entry.category===id);

  function renderCategories() {
    const nav=$('gallery-categories');nav.replaceChildren();
    for(const {id,label:chinese} of GALLERY_CATEGORIES) {
      const label=t(chinese);
      const list=inCategory(id);
      if(!list.length)continue;
      const button=element('button');button.type='button';
      button.append(element('span','',label),element('small','',`${list.filter(visible).length}/${list.length}`));
      button.setAttribute('aria-current',String(id===category));
      button.onclick=()=>{category=id;render();$('gallery-scroll').scrollTop=0;};
      nav.append(button);
    }
  }
  function thumbnail(entry) {
    const shown=visible(entry),button=element('button',`gallery-item${shown?'':' fogged'}`);button.type='button';
    button.setAttribute('role','listitem');
    button.setAttribute('aria-label',shown?entry.label:t('未读到的图片，点击显示'));
    const frame=element('span','gallery-thumb'),img=element('img');
    img.src=entry.src;img.alt='';img.loading='lazy';img.decoding='async';
    const eye=element('span','gallery-eye');eye.setAttribute('aria-hidden','true');
    eye.innerHTML='<span><svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg></span>';
    frame.append(img,eye);
    button.append(frame,element('span','gallery-name',shown?entry.label:'？？？'));
    button.onclick=()=>{
      if(visible(entry)){show(entry);return;}
      revealed.add(entry.id);render();
      $('gallery-grid').querySelector(`[data-id="${CSS.escape(entry.id)}"]`)?.focus();
    };
    button.dataset.id=entry.id;
    return button;
  }
  function render() {
    const list=inCategory(category);
    renderCategories();
    const grid=$('gallery-grid');
    // Tall pictures get narrower columns than wide ones; each category takes the shape of its first picture.
    const first=list[0],tall=first&&first.height>first.width;
    grid.style.setProperty('--gallery-ratio',first?`${first.width} / ${first.height}`:'16 / 9');
    grid.classList.toggle('is-tall',!!tall);
    grid.replaceChildren(...list.map(thumbnail));
    $('gallery-empty').hidden=entries.length>0;
    $('gallery-count').textContent=entries.length?t('已读到 {a} / {b}',{a:entries.filter(e=>e.reached).length,b:entries.length}):'';
    reveal.setAttribute('aria-checked',String(all));
  }

  function show(entry) {
    viewing=entry;
    const list=inCategory(entry.category).filter(visible),label=t(/** @type {any} */(GALLERY_CATEGORIES.find(c=>c.id===entry.category)).label);
    $('gallery-viewer-image').src=entry.src;
    $('gallery-viewer-name').textContent=entry.label;
    $('gallery-viewer-place').textContent=`${label} · ${list.indexOf(entry)+1} / ${list.length}`;
    for(const id of ['gallery-prev','gallery-next'])$(id).hidden=list.length<2;
    viewer.hidden=false;$('gallery-viewer-close').focus();
  }
  function step(delta) {
    const list=inCategory(viewing.category).filter(visible),i=list.indexOf(viewing);
    show(list[(i+delta+list.length)%list.length]);
  }
  function hideViewer() {
    if(viewer.hidden)return;
    viewer.hidden=true;$('gallery-viewer-image').removeAttribute('src');
    $('gallery-grid').querySelector(`[data-id="${CSS.escape(viewing.id)}"]`)?.focus();
  }
  $('gallery-prev').onclick=event=>{event.stopPropagation();step(-1);};
  $('gallery-next').onclick=event=>{event.stopPropagation();step(1);};
  $('gallery-viewer-close').onclick=event=>{event.stopPropagation();hideViewer();};
  viewer.onclick=hideViewer;
  viewer.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();step(event.key==='ArrowLeft'?-1:1);}
  });
  // Escape closes the picture first, then the gallery.
  dialog.addEventListener('cancel',event=>{if(!viewer.hidden){event.preventDefault();hideViewer();}});
  dialog.addEventListener('close',()=>{
    document.body.classList.remove('stage-panel-open');
    viewer.hidden=true;$('gallery-viewer-image').removeAttribute('src');
    $('gallery-grid').replaceChildren();revealed=new Set();all=false;onClose();
  });
  $('gallery-close').onclick=()=>dialog.close();
  reveal.onclick=()=>{all=!all;if(!all)revealed=new Set();render();};

  async function open() {
    const book=await getBook();
    if(!book)return false;
    if(book.story.book.id!==bookId){bookId=book.story.book.id;category=null;}
    entries=galleryEntries(book);
    if(!inCategory(category).length)category=GALLERY_CATEGORIES.find(c=>inCategory(c.id).length)?.id??null;
    onOpen();document.body.classList.add('stage-panel-open');
    render();dialog.showModal();$('gallery-scroll').scrollTop=0;
    return true;
  }
  return {open};
}
