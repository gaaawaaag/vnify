import {t} from '../reader/player-text.js';
// Home bookshelf: one card (or list row) per book, newest reading first, in pages. Opening a book is left to the player.
// Three views: tall covers (the default; the same covers cut to 2:3), wide covers and a list without covers; the
// choice stays in this browser.
const VIEWS=['tall','wide','list'];
// Shelf settings, kept in this browser since screens differ: rows of cards per page (0 = one long page) and whether
// cards show the original book's cover (an EPUB's own cover, on by default) instead of the made one when the book has it.
export const SHELF_ROWS=[2,3,4,6,0];
const SHELF_DEFAULTS={rows:3,originalCover:true};
export function readShelfSettings(value) {
  const settings={...SHELF_DEFAULTS,...(value&&typeof value==='object'?value:{})};
  return {rows:SHELF_ROWS.includes(Number(settings.rows))?Number(settings.rows):SHELF_DEFAULTS.rows,originalCover:settings.originalCover!==false,
    showRating:settings.showRating===true};
}
// The list has no columns; a page holds as many rows as the wide covers would show at this width (230px cards,
// 22px apart, two columns on narrow screens: see #shelf-grid in style.css), times the rows setting.
function wideColumns(width) {
  return matchMedia('(max-width:600px)').matches?2:Math.max(1,Math.floor((width+22)/(230+22)));
}
/* How far into the book the shelf position is, in whole percent; null before the first save. A finished book stays at
 * 100 however it is turned back afterwards. */
export function readingPercent(book) {
  if(book.finishedAt)return 100;
  const p=book.progress;
  return p&&Number.isInteger(p.index)&&p.count?Math.min(100,Math.floor((p.index+1)/p.count*100)):null;
}
export function createBookshelf({client,device,onOpen,onRemoved=()=>{},onBooks=()=>{},toast,storage=()=>globalThis.localStorage}) {
  const $=id=>document.getElementById(id);
  let books=[],menu=null,page=0,pageSize=0;
  let settings=readShelfSettings(null);
  try {settings=readShelfSettings(JSON.parse(storage().getItem('vn-shelf-settings')??'null'));} catch {}
  // Books whose images are uploading; one not yet on the shelf shows as a card that cannot open yet.
  const uploads=new Map();
  const uploadText=upload=>t('上传中 {a}/{b}',{a:upload.done,b:upload.total});
  // The book being opened: its cover (or row) shows the download, then the short reading step.
  let opening=null;
  const element=(tag,className,text)=>Object.assign(document.createElement(tag),className?{className}:{},text!==undefined?{textContent:text}:{});
  function closeMenu() {
    if(!menu)return;
    menu.list.hidden=true;menu.button.setAttribute('aria-expanded','false');menu=null;
  }
  const stateText=value=>value===null?t('未读'):value>=100?t('读完'):`${value}%`;
  // The reader's rating as five small diamonds, when the shelf settings ask for it.
  function diamonds(rating) {
    const box=element('span','mini-diamonds');box.setAttribute('aria-label',t('{n} 分',{n:rating}));box.title=t('{n} 分',{n:rating});
    for(let n=1;n<=5;n++)box.append(element('i',n<=rating?'on':''));
    return box;
  }
  function bar(value) {
    const track=element('span','shelf-bar'),fill=element('i');
    fill.style.width=`${value}%`;track.append(fill);return track;
  }
  // When the book was last read, for the list: today, yesterday, days ago, then the date.
  function whenText(book) {
    const at=book.progress?.savedAt;
    if(!at)return '';
    const day=time=>{const date=new Date(time);return new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime();};
    const days=Math.round((day(Date.now())-day(at))/86400000);
    if(days<=0)return t('今天');
    if(days===1)return t('昨天');
    if(days<7)return t('{n} 天前',{n:days});
    const date=new Date(at);return `${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function tags(book) {
    const found=[];
    if(!book.complete)found.push(element('span','shelf-tag',t('制作中')));
    if(uploads.has(book.key))found.push(element('span','shelf-tag shelf-upload',uploadText(uploads.get(book.key))));
    return found;
  }
  // The ⋯ button and its menu: edit the title and author, export the package, take the book off the shelf.
  function moreMenu(book) {
    const more=element('button','shelf-more');more.type='button';
    more.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
    more.setAttribute('aria-label',t('{title}：更多操作',{title:book.title}));more.setAttribute('aria-haspopup','true');more.setAttribute('aria-expanded','false');
    const list=element('div','shelf-menu');list.hidden=true;
    const download=element('a','',t('导出作品包'));download.href=client.packageURL(book.key);download.download=`${book.bookId}.vn.zip`;
    download.onclick=closeMenu;
    const remove=element('button','',t('移出书架'));remove.type='button';
    remove.onclick=async()=>{
      closeMenu();
      if(!await confirm({title:'移出书架',text:t('《{title}》',{title:book.title}),action:'移出'}))return;
      try {await client.remove(book.key);onRemoved(book.key);await refresh();}
      catch(error){toast(error.message);}
    };
    const info=element('button','',t('编辑信息'));info.type='button';
    info.onclick=()=>{closeMenu();editInfo(book);};
    const rate=element('button','',t('评分与短评'));rate.type='button';
    rate.onclick=()=>{closeMenu();void editReview(book);};
    list.append(info,rate,download,remove);
    more.onclick=event=>{
      event.stopPropagation();
      const opens=list.hidden;closeMenu();
      if(opens){list.hidden=false;more.setAttribute('aria-expanded','true');menu={list,button:more};}
    };
    return [more,list];
  }
  const LANGUAGE_MARKS={zh:['简','简体中文'],'zh-Hant':['繁','繁体中文'],en:['EN','英文'],ja:['日','日文']};
  // The work's language code and a small screen outline for the way its pictures face; none for what the shelf lacks.
  function marks(book) {
    const lang=Object.hasOwn(LANGUAGE_MARKS,book.lang??'')?book.lang:null;
    const orientation=book.orientation==='landscape'||book.orientation==='portrait'?book.orientation:null;
    if(!lang&&!orientation)return null;
    const box=element('span','work-marks'),names=[];
    if(lang){box.append(element('span','mark-lang',LANGUAGE_MARKS[lang][0]));names.push(t(LANGUAGE_MARKS[lang][1]));}
    if(orientation) {
      const [w,h]=orientation==='landscape'?[14,10]:[10,14];
      box.insertAdjacentHTML('beforeend',`<svg class="mark-orient ${orientation}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`
        +`<rect x=".65" y=".65" width="${w-1.3}" height="${h-1.3}" rx="1.6"/></svg>`);
      names.push(t(orientation==='landscape'?'横屏优先':'竖屏优先'));
    }
    box.title=names.join(' · ');
    return box;
  }
  // The card picture: the original cover when preferred and present, else the shelf's cover thumbnail.
  function coverSource(book) {
    if(settings.originalCover&&book.originalCover)return client.fileURL(book.key,book.originalCover);
    return book.cover?client.coverURL(book.key,book.cover.at):null;
  }
  function cover(book) {
    const box=element('span','shelf-cover shelf-opening-host'),src=coverSource(book);
    if(src) {
      const img=element('img');img.alt='';img.loading='lazy';img.decoding='async';
      img.src=src;
      img.onerror=()=>{img.remove();box.classList.add('empty');};
      box.append(img);
    } else box.classList.add('empty');
    box.append(element('span','shelf-cover-title',book.title));
    const found=marks(book);if(found)box.append(found);
    return box;
  }
  function card(book) {
    const item=element('div','shelf-card');item.setAttribute('role','listitem');item.dataset.key=book.key;
    const open=element('button','shelf-open');open.type='button';
    const info=element('span','shelf-info');
    info.append(element('span','shelf-title',book.title));
    if(book.author)info.append(element('span','shelf-author',book.author));
    const meta=element('span','shelf-meta'),value=readingPercent(book);
    meta.append(...tags(book));
    if(book.progress?.chapter)meta.append(element('span','shelf-where',book.progress.chapter),element('span','shelf-where shelf-dot','·'));
    meta.append(element('span','shelf-state',stateText(value)));
    if(value!==null&&value<100)meta.append(bar(value));
    if(settings.showRating&&book.rating)meta.append(diamonds(book.rating));
    info.append(meta);
    open.append(cover(book),info);
    open.onclick=()=>{closeMenu();onOpen(book);};
    item.append(open,...moreMenu(book));
    return item;
  }
  function row(book) {
    const item=element('div','shelf-row shelf-opening-host');item.setAttribute('role','listitem');item.dataset.key=book.key;
    const open=element('button','shelf-row-open');open.type='button';
    const names=element('span','shelf-names');
    names.append(element('span','shelf-title',book.title));
    if(book.author)names.append(element('span','shelf-author',book.author));
    const where=element('span','shelf-where');where.append(...tags(book),book.progress?.chapter??'');
    const progress=element('span','shelf-progress-cell'),value=readingPercent(book);
    progress.append(bar(value??0),element('span','shelf-state',stateText(value)));
    if(settings.showRating&&book.rating)progress.append(diamonds(book.rating));
    const markCell=element('span','shelf-marks'),found=marks(book);if(found)markCell.append(found);
    open.append(names,markCell,where,progress,element('span','shelf-when',whenText(book)));
    open.onclick=()=>{closeMenu();onOpen(book);};
    item.append(open,...moreMenu(book));
    return item;
  }
  // A book still uploading: its upload tag in place of progress, and it cannot open yet.
  function pending(key,upload) {
    const book={key,title:upload.title,author:upload.author,cover:null,complete:true};
    const nodes=[card(book),row(book)];
    for(const node of nodes) {
      node.querySelector('.shelf-open, .shelf-row-open').disabled=true;
      for(const old of node.querySelectorAll('.shelf-more, .shelf-menu, .shelf-state, .shelf-bar'))old.remove();
    }
    return nodes;
  }
  // Books per page: rows times the columns of the current view (0 when the shelf is one long page).
  function measurePage() {
    if(!settings.rows)return 0;
    const shelf=$('shelf'),grid=$('shelf-grid');
    if(shelf.dataset.view==='list')return settings.rows*wideColumns(grid.parentElement.clientWidth);
    const columns=getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    return settings.rows*Math.max(1,columns);
  }
  function render() {
    closeMenu();
    const waiting=[...uploads].filter(([key])=>!books.some(book=>book.key===key)).map(([key,upload])=>pending(key,upload));
    $('shelf').classList.toggle('is-empty',!books.length&&!waiting.length);
    $('shelf-count').textContent=String(books.length+waiting.length).padStart(2,'0');
    const all=[...waiting.map(nodes=>({nodes})),...books.map(book=>({book}))];
    pageSize=measurePage();
    const pages=pageSize?Math.max(1,Math.ceil(all.length/pageSize)):1;
    page=Math.min(page,pages-1);
    const shown=pageSize?all.slice(page*pageSize,(page+1)*pageSize):all;
    $('shelf-grid').replaceChildren(...shown.map(entry=>entry.nodes?.[0]??card(entry.book)));
    $('shelf-list').replaceChildren(...shown.map(entry=>entry.nodes?.[1]??row(entry.book)));
    renderPager(pages);
    if(opening)for(const host of hosts(opening.key))showOpening(host,opening.state);
    onBooks(books);
  }
  function renderPager(pages) {
    const pager=$('shelf-pager');
    pager.hidden=pages<2;
    $('shelf-page').textContent=`${page+1} / ${pages}`;
    $('shelf-prev').disabled=page===0;$('shelf-next').disabled=page>=pages-1;
  }
  function turn(delta) {
    page+=delta;render();
    $('shelf').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  $('shelf-prev').onclick=()=>turn(-1);
  $('shelf-next').onclick=()=>turn(1);
  // A new column count changes how many books fit on a page.
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>{if(settings.rows&&measurePage()!==pageSize)render();}).observe($('shelf'));
  function setSettings(change) {
    settings=readShelfSettings({...settings,...change});
    try {storage().setItem('vn-shelf-settings',JSON.stringify(settings));} catch {}
    render();
  }
  async function refresh() {
    try {books=await client.list();}
    catch {books=[];render();toast(t('书架不可用：本机服务未能读取作品库。'));return books;}
    for(const [key,upload] of uploads)if(upload.finished)uploads.delete(key);
    render();
    return books;
  }
  const hosts=key=>document.querySelectorAll(`#shelf [data-key="${CSS.escape(key)}"] .shelf-opening-host, #shelf .shelf-opening-host[data-key="${CSS.escape(key)}"]`);
  function showOpening(host,state) {
    let overlay=host.querySelector(':scope > .shelf-progress');
    if(!overlay) {
      overlay=element('span','shelf-progress');
      overlay.append(element('span','shelf-progress-text'),element('span','shelf-progress-bar'));
      host.append(overlay);
    }
    const ratio=state.total?Math.min(1,state.received/state.total):null,reading=state.phase==='read';
    overlay.firstChild.textContent=reading?t('读取中'):ratio!==null?`${Math.floor(ratio*100)}%`:`${(state.received/1048576).toFixed(1)} MB`;
    overlay.style.setProperty('--progress',`${reading?100:(ratio??0)*100}%`);
  }
  // state: {received,total} while downloading, {phase:'read'} while unpacking, null when done.
  function setOpening(key,state) {
    opening=state?{key,state}:null;
    for(const host of hosts(key)) {
      if(state)showOpening(host,state);
      else host.querySelector(':scope > .shelf-progress')?.remove();
    }
  }
  // A finished upload of a book not yet listed keeps its card until the next listing, so it does not blink out.
  // An existing card updates its tag in place, without reloading covers.
  function setUpload(key,upload) {
    const previous=uploads.get(key);
    if(upload)uploads.set(key,upload);
    else if(previous&&!books.some(book=>book.key===key))uploads.set(key,{...previous,finished:true});
    else uploads.delete(key);
    const found=previous&&upload?document.querySelectorAll(`#shelf [data-key="${CSS.escape(key)}"] .shelf-upload`):[];
    if(found.length)for(const tag of found)tag.textContent=uploadText(upload);
    else render();
  }
  function setView(view) {
    if(!VIEWS.includes(view))view=VIEWS[0];
    $('shelf').dataset.view=view;
    for(const button of document.querySelectorAll('.shelf-views [data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===view));
    try {storage().setItem('vn-shelf-view',view);} catch {}
    if(books.length)render();
  }
  let saved=null;
  try {saved=storage().getItem('vn-shelf-view');} catch {}
  setView(saved);
  for(const button of document.querySelectorAll('.shelf-views [data-view]'))button.onclick=()=>{closeMenu();setView(button.dataset.view);};
  // Resolves true when the reader confirms; Escape or closing counts as cancel.
  let answer=null;
  const settle=value=>{const resolve=answer;answer=null;resolve?.(value);};
  function confirm({title,text,action}) {
    settle(false);
    $('shelf-dialog-title').textContent=t(title);$('shelf-dialog-text').textContent=text;$('shelf-dialog-confirm').textContent=t(action);
    $('shelf-dialog').showModal();
    return new Promise(resolve=>{answer=resolve;});
  }
  $('shelf-dialog-confirm').onclick=()=>{settle(true);$('shelf-dialog').close();};
  $('shelf-dialog').addEventListener('close',()=>settle(false));
  // The title and author dialog; the shelf writes them into the book's text.
  let editing=null;
  function editInfo(book) {
    editing=book;
    $('book-info-title').value=book.title;$('book-info-author').value=book.author??'';$('book-info-blurb').value=book.blurb??'';
    $('book-info-error').hidden=true;
    $('book-info-save').disabled=false;
    $('book-info-dialog').showModal();$('book-info-title').select();
  }
  $('book-info-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const book=editing,title=$('book-info-title').value.trim(),author=$('book-info-author').value.trim()||null,blurb=$('book-info-blurb').value.trim();
    if(!book||!title)return;
    $('book-info-save').disabled=true;
    try {
      await client.saveInfo(book.key,{title,author,blurb});
      $('book-info-dialog').close();
      await refresh();
    } catch(error) {
      $('book-info-error').textContent=error.message;$('book-info-error').hidden=false;
    } finally {$('book-info-save').disabled=false;}
  });
  $('book-info-dialog').addEventListener('close',()=>{editing=null;});
  // Rating (five diamonds, click the lit one again to clear) and review, the same ones the end card shows.
  let reviewing=null,reviewRating=null;
  for(let n=1;n<=5;n++) {
    const button=element('button');button.type='button';button.dataset.n=String(n);button.append(element('i'));
    $('review-rating').append(button);
  }
  function paintReview() {
    for(const button of $('review-rating').children) {
      const n=Number(button.dataset.n);
      button.classList.toggle('on',reviewRating!==null&&n<=reviewRating);
      button.setAttribute('aria-label',t('{n} 分',{n}));button.setAttribute('aria-pressed',String(reviewRating===n));
    }
  }
  $('review-rating').addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    const n=Number(button.dataset.n);reviewRating=reviewRating===n?null:n;paintReview();
  });
  async function editReview(book) {
    let record;
    try {record=await client.record(book.key);} catch(error) {toast(error.message);return;}
    reviewing=book;reviewRating=record.rating;paintReview();
    $('review-book').textContent=t('《{title}》',{title:book.title});
    $('review-text').value=record.review;$('review-error').hidden=true;$('review-save').disabled=false;
    $('review-dialog').showModal();
  }
  $('review-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const book=reviewing;if(!book)return;
    $('review-save').disabled=true;
    try {
      await client.saveReview(book.key,device,{rating:reviewRating,review:$('review-text').value.trim()});
      $('review-dialog').close();
      await refresh();
    } catch(error) {
      $('review-error').textContent=error.message;$('review-error').hidden=false;
    } finally {$('review-save').disabled=false;}
  });
  $('review-dialog').addEventListener('close',()=>{reviewing=null;});
  document.addEventListener('click',event=>{if(menu&&!menu.list.contains(event.target))closeMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu){const button=menu.button;closeMenu();button.focus();}});
  return {
    refresh,confirm,setUpload,setOpening,coverSource,setSettings,
    // The interface language changed: cards are drawn again in it.
    relabel:render,
    get settings(){return settings;},
    find:key=>books.find(book=>book.key===key)??null,
  };
}
