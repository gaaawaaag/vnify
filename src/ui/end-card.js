import {playTransition} from '../reader/transitions.js';
import {t} from '../reader/player-text.js';
import {durationText as duration} from './shelf-stats.js';

/* The end card: shown when the reader moves on past the last unit of a finished book. Over a blurred end picture (or the
 * cover) it shows the book's reading time and dates, the reader's rating as five diamonds and a short review. Rating and
 * review are saved as they change through onSave({rating,review}), which answers with the book's record or throws. */
export function createEndCard({onSave,onBack,onHome,toast=()=>{}}) {
  const $=id=>document.getElementById(id);
  const root=$('end-card'),content=$('end-card-content'),art=$('end-card-image'),stats=$('end-card-stats');
  const rate=$('end-card-rating'),review=$('end-card-review');
  let session=null,rating=null,saved={rating:null,review:''},saveTimer=null;
  for(let n=1;n<=5;n++) {
    const button=document.createElement('button');
    button.type='button';button.dataset.n=String(n);button.append(document.createElement('i'));
    rate.append(button);
  }
  function paintRating() {
    for(const button of rate.children) {
      const n=Number(button.dataset.n);
      button.classList.toggle('on',rating!==null&&n<=rating);
      button.setAttribute('aria-label',t('{n} 分',{n}));
      button.setAttribute('aria-pressed',String(rating===n));
    }
  }
  // Numbers at full size, the words around them small: "6 小时 42 分", "6 h 42 min".
  function amount(text) {
    const node=document.createElement('dd');
    for(const part of text.split(/(\d[\d.,]*)/).filter(Boolean)) {
      if(/^\d/.test(part))node.append(part);
      else if(part.trim())node.append(Object.assign(document.createElement('small'),{textContent:part.trim()}));
      else node.append(' ');
    }
    return node;
  }
  // 11.3 – 11.17 within this year, with years otherwise; one date when it began and ended on the same day.
  function dates(from,to) {
    const thisYear=new Date().getFullYear(),a=new Date(from),b=new Date(to);
    const year=a.getFullYear()!==thisYear||b.getFullYear()!==thisYear;
    const text=date=>`${year?`${date.getFullYear()}.`:''}${date.getMonth()+1}.${date.getDate()}`;
    return a.toDateString()===b.toDateString()?text(b):`${text(a)} – ${text(b)}`;
  }
  function paintStats(record) {
    const items=[];
    if(record?.active)items.push([t('阅读时长'),amount(duration(record.active))]);
    if(record?.startedAt&&record?.finishedAt){
      const dd=document.createElement('dd');dd.textContent=dates(record.startedAt,record.finishedAt);items.push([t('日期'),dd]);
    }
    if(record?.days)items.push([t('阅读天数'),amount(t('{n} 天',{n:record.days}))]);
    stats.replaceChildren(...items.map(([label,value])=>{
      const item=document.createElement('div');item.className='end-card-stat';
      item.append(Object.assign(document.createElement('dt'),{textContent:label}),value);
      return item;
    }));
    stats.hidden=!items.length;
  }
  async function save() {
    clearTimeout(saveTimer);
    const next={rating,review:review.value.trim()};
    if(next.rating===saved.rating&&next.review===saved.review)return;
    try {
      await onSave(next);saved=next;
    } catch {toast(t('未能保存评分'));}
  }
  rate.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||!session)return;
    const n=Number(button.dataset.n);
    rating=rating===n?null:n;paintRating();void save();
  });
  review.addEventListener('input',()=>{clearTimeout(saveTimer);saveTimer=setTimeout(save,800);});
  review.addEventListener('blur',()=>void save());

  // own: the book's own end picture, made to sit behind the card, shown sharp; a cover is blurred.
  function show({title,author=null,src=null,own=false,record=null,animate=true}) {
    session?.close();
    let resolve;
    const closed=new Promise(r=>{resolve=r;});
    const current={
      close(){
        if(session!==current)return;
        session=null;void save();
        for(const running of content.getAnimations())running.cancel();
        root.hidden=true;art.style.backgroundImage='';
        resolve();
      },
    };
    session=current;
    $('end-card-name').textContent=title;
    $('end-card-author').textContent=author??'';$('end-card-author').hidden=!author;
    art.style.backgroundImage=src?`url("${src}")`:'';root.classList.toggle('has-image',!!src);root.classList.toggle('own-image',!!src&&own);
    rating=record?.rating??null;review.value=record?.review??'';saved={rating,review:review.value};
    paintRating();paintStats(record);
    root.hidden=false;root.focus({preventScroll:true});
    playTransition(content,'titleIn',{enabled:animate});
    return closed;
  }
  $('end-card-back').onclick=()=>{session?.close();onBack();};
  $('end-card-home').onclick=()=>{session?.close();onHome();};
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&session&&!document.querySelector('dialog[open]')){event.preventDefault();session.close();onBack();}
  });
  // The record arrives after the card opens; a rating or review already changed on the card is kept.
  function setRecord(record) {
    if(!session)return;
    paintStats(record);
    const untouched=rating===saved.rating&&review.value.trim()===saved.review;
    if(untouched&&record){rating=record.rating??null;review.value=record.review??'';saved={rating,review:review.value};paintRating();}
  }
  return {show,setRecord,close(){session?.close();},get active(){return !!session;}};
}
