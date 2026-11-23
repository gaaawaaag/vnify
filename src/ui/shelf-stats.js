import {listText,t,textLanguage} from '../reader/player-text.js';

/* The shelf's reading statistics (the moon tab beside the shelf heading): a summary, a heat map of days drawn as moon
 * phases, and every book read. The shelf sends {days,books} (GET /api/library/_stats); the sums are worked out here, per
 * year or over everything, by the reader's local dates. */

// YYYY-MM-DD of a local date. @param {Date} date
export const dateKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const fromKey=key=>{const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d);};
const addDays=(date,n)=>new Date(date.getFullYear(),date.getMonth(),date.getDate()+n);

// The years with reading, newest first.
export function readingYears(stats) {
  const years=new Set(Object.keys(stats.days).map(key=>Number(key.slice(0,4))));
  for(const book of stats.books)if(book.finishedAt)years.add(new Date(book.finishedAt).getFullYear());
  return [...years].sort((a,b)=>b-a);
}

/* The figures for one year, or for everything ('all'), up to today. The heat map covers that year, or the last 53 weeks
 * for everything, in whole weeks from Monday; each read day gets a level 1–4 by where its time falls among the read days
 * shown (quartiles), so a light year still shows its busier days. */
export function readingSummary(stats,year,today=new Date()) {
  const inRange=year==='all'?()=>true:key=>key.startsWith(`${year}-`);
  const finishedIn=book=>book.finishedAt&&(year==='all'||new Date(book.finishedAt).getFullYear()===year);
  const keys=Object.keys(stats.days).filter(inRange).filter(key=>stats.days[key].total>0).sort();
  let active=0,streak=0,run=0,previous=null;
  const perBook=new Map(),lastRead=new Map();
  for(const key of keys) {
    const day=stats.days[key];
    active+=day.total;
    for(const [book,time] of Object.entries(day.books)){perBook.set(book,(perBook.get(book)??0)+time);lastRead.set(book,key);}
    run=previous&&dateKey(addDays(fromKey(previous),1))===key?run+1:1;
    streak=Math.max(streak,run);previous=key;
  }
  const books=stats.books.filter(book=>perBook.get(book.key)||finishedIn(book)).map(book=>({
    ...book,active:perBook.get(book.key)??0,lastRead:lastRead.get(book.key)??null,finishedHere:!!finishedIn(book),
  }));
  // The heat map's days.
  const todayDate=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const first=year==='all'?addDays(todayDate,-7*52):new Date(year,0,1);
  const last=year==='all'||year===today.getFullYear()?todayDate:new Date(year,11,31);
  const monday=addDays(first,-((first.getDay()+6)%7));
  const shown=[];
  for(let date=first;date<=last;date=addDays(date,1))shown.push(stats.days[dateKey(date)]?.total??0);
  const sorted=shown.filter(Boolean).sort((a,b)=>a-b),quantile=q=>sorted[Math.floor(q*(sorted.length-1))];
  const cuts=sorted.length?[quantile(.25),quantile(.5),quantile(.75)]:[];
  const level=total=>!total?0:1+cuts.filter(cut=>total>cut).length;
  const cells=[];
  for(let date=monday;date<=last;date=addDays(date,1)) {
    const key=dateKey(date),day=stats.days[key];
    cells.push({key,date,inside:date>=first,total:day?.total??0,level:date>=first?level(day?.total??0):0,
      books:day?Object.entries(day.books).sort((a,b)=>b[1]-a[1]).map(([book])=>book):[]});
  }
  return {active,finished:stats.books.filter(finishedIn).length,days:keys.length,streak,books,cells,
    today:dateKey(todayDate)};
}

// "1 小时 20 分", "20 分钟"; under a minute counts as one.
export function durationText(ms) {
  const minutes=Math.max(1,Math.round(ms/60_000)),h=Math.floor(minutes/60),m=minutes%60;
  return h?t('{h} 小时 {m} 分',{h,m}):t('{m} 分钟',{m});
}
const LOCALES={zh:'zh-CN','zh-Hant':'zh-TW',en:'en',ja:'ja'};
const dateText=(date,options)=>new Intl.DateTimeFormat(LOCALES[textLanguage()]??'zh-CN',options).format(date);

export function createShelfStats({client,root,years:yearsBox,toast=()=>{},onOpen=()=>{}}) {
  let stats=null,year=new Date().getFullYear(),sort='active',loading=null;
  const element=(tag,className,text)=>Object.assign(document.createElement(tag),className?{className}:{},text!==undefined?{textContent:text}:{});
  // Numbers at full size, the words around them small.
  function amount(text,tag='dd') {
    const node=element(tag);
    for(const part of text.split(/(\d[\d.,]*)/).filter(Boolean)) {
      if(/^\d/.test(part))node.append(part);
      else if(part.trim())node.append(element('small','',part.trim()));
    }
    return node;
  }
  function diamonds(rating) {
    if(!rating)return element('span','stats-none','—');
    const box=element('span','mini-diamonds');box.setAttribute('aria-label',t('{n} 分',{n:rating}));
    for(let n=1;n<=5;n++)box.append(element('i',n<=rating?'on':''));
    return box;
  }
  const bookName=book=>book.title??t('已移出的书');
  function renderYears() {
    const options=[...new Set([new Date().getFullYear(),...readingYears(stats)])].sort((a,b)=>b-a).slice(0,4).reverse();
    yearsBox.replaceChildren(...[...options,'all'].map(value=>{
      const button=element('button','',value==='all'?t('全部'):String(value));button.type='button';
      button.setAttribute('aria-pressed',String(value===year));
      button.onclick=()=>{year=value;render();};
      return button;
    }));
  }
  function summaryNode(summary) {
    const list=element('dl','stats-summary');
    const items=[[t('阅读时长'),summary.active?durationText(summary.active):t('{m} 分钟',{m:0})],[t('读完'),t('{n} 本',{n:summary.finished})],
      [t('阅读天数'),t('{n} 天',{n:summary.days})],[t('最长连续'),t('{n} 天',{n:summary.streak})]];
    for(const [label,value] of items) {
      const item=element('div','stats-sum');item.append(element('dt','',label),amount(value));list.append(item);
    }
    return list;
  }
  function heatNode(summary) {
    const section=element('section','stats-section');
    section.append(element('h3','',t('每天')));
    const scroll=element('div','stats-heat-scroll'),grid=element('div','stats-heat');
    const tip=element('span','stats-tip');tip.setAttribute('aria-live','polite');
    const names=new Map(stats.books.map(book=>[book.key,bookName(book)]));
    const describe=cell=>[dateText(cell.date,{month:'long',day:'numeric'}),cell.total?durationText(cell.total):t('未读'),
      listText(cell.books.map(key=>names.get(key)??key))].filter(Boolean).join(' · ');
    summary.cells.forEach((cell,i)=>{
      const column=Math.floor(i/7)+1,row=i%7+2;
      if(row===2) {
        // Each month is named over the week holding its 1st; the first week names the month the map starts in.
        const week=summary.cells.slice(i,i+7).filter(c=>c.inside);
        const named=week.find(c=>c.date.getDate()===1)??(i===0&&week[0]?.date.getDate()<=21?week[0]:null);
        const label=element('span','stats-month',named?dateText(named.date,{month:'short'}):'');
        label.style.gridColumn=String(column);grid.append(label);
      }
      const dot=element('i');dot.style.gridColumn=String(column);dot.style.gridRow=String(row);
      if(!cell.inside||cell.key>summary.today){dot.className='outside';grid.append(dot);return;}
      dot.dataset.l=String(cell.level);dot.tabIndex=-1;
      if(cell.key===summary.today)dot.classList.add('today');
      const show=()=>{tip.textContent=describe(cell);};
      dot.onpointerenter=show;dot.onclick=show;
      grid.append(dot);
    });
    scroll.append(grid);
    const legend=element('div','stats-legend');
    legend.append(t('少'));
    for(let l=0;l<=4;l++){const dot=element('i');dot.dataset.l=String(l);legend.append(dot);}
    legend.append(t('多'),tip);
    section.append(scroll,legend);
    requestAnimationFrame(()=>{scroll.scrollLeft=scroll.scrollWidth;});
    return section;
  }
  const SORTS={active:(a,b)=>b.active-a.active,rating:(a,b)=>(b.rating??0)-(a.rating??0)||b.active-a.active,
    finished:(a,b)=>(b.finishedAt??0)-(a.finishedAt??0)||b.active-a.active,recent:(a,b)=>(b.lastRead??'').localeCompare(a.lastRead??'')};
  function booksNode(summary) {
    const section=element('section','stats-section');
    section.append(element('h3','',t('每本书')));
    if(!summary.books.length)return section;
    const table=element('table','stats-books'),head=element('tr');
    for(const [key,label,className] of [['recent',t('书名'),'stats-name'],['active',t('阅读时长'),'stats-time'],['rating',t('评分'),'stats-rate'],
      ['finished',t('读完'),'stats-done']]) {
      const th=element('th',className),button=element('button','',label);button.type='button';
      th.setAttribute('aria-sort',sort===key?'descending':'none');
      button.onclick=()=>{sort=key;render();};
      th.append(button);head.append(th);
    }
    table.append(element('thead'));table.tHead.append(head);
    const body=element('tbody'),longest=Math.max(...summary.books.map(book=>book.active),1);
    for(const book of [...summary.books].sort(SORTS[sort])) {
      const row=element('tr',book.onShelf?'':'is-removed');
      const name=element('td','stats-name');
      const title=book.onShelf?element('button','stats-open',bookName(book)):element('span','',bookName(book));
      if(book.onShelf){title.type='button';title.onclick=()=>onOpen(book.key);}
      name.append(title);if(book.author)name.append(element('span','stats-author',book.author));
      const time=element('td','stats-time'),line=element('span','stats-line'),bar=element('span','stats-bar'),fill=element('b');
      fill.style.width=`${book.active/longest*100}%`;bar.append(fill);
      line.append(amount(book.active?durationText(book.active):'—','span'),bar);time.append(line);
      const rate=element('td','stats-rate');rate.append(diamonds(book.rating));
      const done=element('td','stats-done',book.finishedAt?dateText(new Date(book.finishedAt),
        year==='all'||new Date(book.finishedAt).getFullYear()!==new Date().getFullYear()?{year:'numeric',month:'numeric',day:'numeric'}:{month:'numeric',day:'numeric'}):'—');
      row.append(name,time,rate,done);body.append(row);
    }
    table.append(body);section.append(table);
    return section;
  }
  function render() {
    if(!stats)return;
    renderYears();
    const summary=readingSummary(stats,year);
    root.replaceChildren(summaryNode(summary),heatNode(summary),booksNode(summary));
  }
  // Fetches afresh each time the tab opens, so time read since shows.
  async function load() {
    loading??=client.stats().then(value=>{stats=value;render();},error=>toast(error.message)).finally(()=>{loading=null;});
    return loading;
  }
  return {load,relabel:render};
}
