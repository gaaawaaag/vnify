// Presentation only: retain the manuscript's title and disclosure timeline.
import {HOLDS} from './transitions.js';
import {t} from './player-text.js';
export function chapterHeading(title) {
  const text=title.trim();
  if(!text || /^(正文|卷首)$/.test(text))return null;
  const match=text.match(/^(第[零〇一二三四五六七八九十百千万两\d０-９]+[章回节卷部篇])(?:[\s：:·．.、—-]*)(.*)$/u)
    ?? text.match(/^((?:Chapter|Part|Book|Volume)\s+(?:[IVXLCDM]+|\d+|[A-Za-z]+(?:-[A-Za-z]+)?))(?:\s*[:.—–-]\s*|\s+)(\S.*)$/iu);
  return match && match[2] ? {kicker:match[1],title:match[2]} : {kicker:'',title:text};
}

export function readerIntro(story,index,mode,previousIndex) {
  const ordinary=ordinaryIntro(story,index,mode,previousIndex);
  const u=story.units[index];
  const separator=(mode==='forward'&&previousIndex===index-1&&index===u.block.index)
    ?story.transitions?.find(t=>t.beforeBlock===u.block.id):null;
  if(separator)return {kind:'separator',duration:HOLDS.separator,chapterId:separator.chapterId,
    next:ordinary??(u.block.kind==='scene'?{kind:'scene',duration:HOLDS.scene}:null)};
  return ordinary;
}

function ordinaryIntro(story,index,mode,previousIndex) {
  const u=story.units[index];
  const chapterEntry=(mode==='start' || mode==='forward') && index===u.chapter.index;
  const chapterJump=mode==='jump' && story.units[previousIndex]?.chapter.id!==u.chapter.id;
  const heading=chapterHeading(u.chapter.title);
  if(heading && (chapterEntry || chapterJump))return {kind:'chapter',...heading,duration:HOLDS.chapter};
  if((mode==='start' || mode==='forward') && u.block.kind==='scene' && index===u.block.index) {
    // Without a title or place there is nothing to announce.
    if(!u.block.title && !u.block.loc && u.block.effect==='none')return null;
    let contextIndex=previousIndex;
    // Documents overlay the current scene; consecutive documents keep that context.
    while(contextIndex!=null && contextIndex>=0 && story.units[contextIndex]?.block.kind==='document'
      && story.units[contextIndex].chapter.id===u.chapter.id)contextIndex--;
    const previous=story.units[contextIndex];
    // Time/title edits alone do not mean a new place. Keep narrative-plane changes visible.
    const samePlace=previous?.chapter.id===u.chapter.id && previous.block.kind==='scene' && u.block.loc && previous.block.loc===u.block.loc;
    if(mode==='forward' && previousIndex===index-1 && samePlace && previous.block.effect===u.block.effect)return null;
    return {kind:'scene',duration:HOLDS.scene};
  }
  return null;
}

export function characterNotice(before,after) {
  const previous=new Map(before.map(c=>[c.id,c]));
  const changed=after.filter(c=>{
    const old=previous.get(c.id);
    return !old || ['label','fullName','summary','appearance','group'].some(key=>old[key]!==c[key])
      || JSON.stringify(old.entries)!==JSON.stringify(c.entries)
      || JSON.stringify(old.detailEntries)!==JSON.stringify(c.detailEntries);
  });
  if(!changed.length)return null;
  if(changed.length>1)return {text:t('人物资料更新 · {n} 人',{n:changed.length}),id:null};
  const c=changed[0],old=previous.get(c.id);
  const kind=!old?'新增人物':JSON.stringify(old.entries)!==JSON.stringify(c.entries)?'人物条目更新':'人物资料更新';
  return {text:`${t(kind)} · ${c.label}`,id:c.id};
}

// A navigation baseline prevents replaying skipped events or showing rollback as an update.
export function createDisclosureTracker() {
  let last=[],baseline=[],enabled=false;
  return {
    begin(mode) { baseline=mode==='start'?[]:last;enabled=mode==='start'||mode==='forward'; },
    observe(people) { last=people;return enabled?characterNotice(baseline,people):null; },
    sync(people) { last=people;baseline=people; },
  };
}
