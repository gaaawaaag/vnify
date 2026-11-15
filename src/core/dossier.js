import {readRecord} from './text-record.js';
import {normalizeScript,scriptLines} from './script-text.js';
import {matchTerms,termNames,personNames} from './glossary.js';

const ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const validId = id => { if (!ID.test(id || '') || id === 'none') throw new Error(`无效 ID：${id}`); return id; };

// Initial summaries use reveal entry; other new events use block boundaries.
// Legacy @at keeps its after-sentence timing.
// Keep all events for historical reconstruction; the live entry set has no count limit.
// Event timing comes only from @after blocks and first reveals; dossiers carry no source evidence.
export function validateDossiers(documents, story) {
  const blocks=new Map(), firstReveals=new Map();
  for(const [index,u] of story.units.entries()) {
    if(!blocks.has(u.block.id))blocks.set(u.block.id,[]);
    blocks.get(u.block.id).push({u,index});
    for(const id of u.revealed.keys())if(!firstReveals.has(id))firstReveals.set(id,{u,index,sources:u.source,position:index*2});
  }
  const events=[],terms=[];
  for(const document of documents) {
    if (!document.text?.trim()) continue;
    let anchor=null, header=false;
    // A record wrapped onto an indented "key=value" line is read as one record.
    const lines=[];
    for(const [n,raw] of normalizeScript(document.text).split('\n').entries()) {
      if(/^\s+\w+=/.test(raw)&&lines.at(-1)?.[1].trim().startsWith('@'))lines.at(-1)[1]+=' '+raw.trim();
      else lines.push([n,raw]);
    }
    for(const [n,raw] of lines) {
      const line=raw.trim(); if(!line || line.startsWith('//'))continue;
      try {
        if(!header) { if(line!=='@dossier 2')throw new Error('资料首行必须为 @dossier 2。'); header=true; continue; }
        if(line==='@after' || line.startsWith('@after ')) {
          const {pos:[block]}=readRecord(line,1,[]);
          const units=blocks.get(block);
          if(!units)throw new Error(`披露块 ${block} 不存在；请从本次块清单复制块 ID。`);
          const sources=[...new Set(units.flatMap(({u})=>u.source))];
          if(document.allowedSources && (!sources.length || sources.some(id=>!document.allowedSources.includes(id))))throw new Error(`披露块 ${block} 不完整地属于本次资料目标范围。`);
          const last=units.at(-1);
          // Two positions per unit: entry, then text complete. Final block has no next entry.
          anchor={...last,sources,block,position:last.index===story.units.length-1 ? last.index*2+1 : (last.index+1)*2};
          continue;
        }
        if(line.startsWith('@at ')) {
          const {pos:[block],attrs:a}=readRecord(line,1,['source','quote','occurrence'],['source','quote','occurrence']);
          const matches=story.units.map((u,index)=>({u,index})).filter(({u})=>u.block.id===block && u.source.includes(a.source) && u.text===a.quote);
          const occurrence=Number(a.occurrence);
          if(!Number.isSafeInteger(occurrence) || occurrence<1 || !matches[occurrence-1])throw new Error('披露锚点不能准确定位；请核对块 ID、来源、完整显示正文和出现次数。');
          if(document.allowedSources && !document.allowedSources.includes(a.source))throw new Error('披露锚点不在本次资料目标范围内。');
          const match=matches[occurrence-1];
          anchor={...match,sources:match.u.source,position:match.index*2+1}; continue;
        }
        const command=line.split(/\s/)[0];
        if(command==='@term'){terms.push({...readTerm(line),document,line:n+1,raw});continue;}
        const spec={
          '@intro':[1,['summary'],['summary']],
          '@person':[1,['fullName','summary','group'],[]],
          // reason is no longer requested; older drafts that still carry it remain readable.
          '@entry':[2,['text','importance','reason','replaces','category','target'],['text','importance']],
          '@remove':[2,['reason'],[]],
          '@portrait':[2,['facts','prompt'],['facts']],
        }[command];
        if(!spec)throw new Error(`未知资料指令：${command}`);
        const {pos,attrs}=readRecord(line,...spec);
        const eventAnchor=command==='@intro' ? firstReveals.get(pos[0]) : anchor;
        if(!eventAnchor)throw new Error(command==='@intro' ? `人物 ${pos[0]} 尚未公开，不能设置首次简介。` : '先写 @after 块ID 设置披露位置（旧稿 @at 仍兼容）。');
        if(command==='@intro' && document.allowedSources && (!eventAnchor.sources.length || eventAnchor.sources.some(id=>!document.allowedSources.includes(id))))throw new Error('人物首次公开不在本次资料目标范围内；后续简介更新请用 @after 和 @person。');
        const character=story.entities.get(pos[0]);
        if(character?.kind!=='character' || !eventAnchor.u.revealed.has(pos[0]))throw new Error(`人物 ${pos[0]} 在该位置尚未公开。`);
        if(command==='@person' && !('fullName' in attrs) && !('summary' in attrs) && !('group' in attrs))throw new Error('@person 至少更新 fullName、summary 或 group。');
        if(command==='@entry' && !['core','support'].includes(attrs.importance))throw new Error('importance 仅允许 core 或 support。');
        if(command==='@entry' && 'category' in attrs && !['alias','relation','background'].includes(attrs.category))throw new Error('category 仅允许 alias、relation 或 background。');
        if(command==='@entry' && 'target' in attrs) {
          validId(attrs.target);
          if(attrs.category!=='relation' || attrs.target===pos[0] || story.entities.get(attrs.target)?.kind!=='character' || !eventAnchor.u.revealed.has(attrs.target))throw new Error('关系 target 必须是该披露位置已公开的其他人物，且 category=relation。');
        }
        if(attrs.replaces)validId(attrs.replaces);
        if(command==='@intro' && document.allowedSources && blocks.get(eventAnchor.u.block.id).some(({u})=>u.source.some(id=>!document.allowedSources.includes(id))))
          throw new Error('首次简介所在块不完整地属于本次资料目标范围。');
        events.push({command,characterId:pos[0],id:pos[1] || null,attrs,index:eventAnchor.index,position:eventAnchor.position,afterBlock:eventAnchor.block || null,after:eventAnchor.u.id});
      } catch(e) { throw new Error(`资料第 ${n+1} 行：${e.message}\n出错内容：${raw}`); }
    }
  }
  events.sort((a,b)=>a.position-b.position);
  const characters=new Map(), seenEvents=new Set(), intros=new Set(), warnings=[];
  for(const e of events) {
    if(e.command==='@intro') {
      if(intros.has(e.characterId))throw new Error(`人物 ${e.characterId} 的首次简介只能登记一次；后续更新请用 @person。`);
      intros.add(e.characterId);
    }
    const signature=JSON.stringify([e.index,e.command,e.characterId,e.id,Object.entries(e.attrs).sort(([a],[b])=>a.localeCompare(b))]);
    if(seenEvents.has(signature))throw new Error(`重复资料事件：${e.characterId}/${e.id || e.command} 在 ${e.after} 已登记；不要重放此前资料。`);
    seenEvents.add(signature);
    const state=applyDossierEvent(characters.get(e.characterId),e);
    characters.set(e.characterId,state);
  }
  const glossary=checkTerms(terms,story,warnings);
  return {events,characters,warnings,terms:glossary};
}

// @term ID label="正文写法" aliases="其他写法|简称" summary="一句话释义"; no disclosure anchor:
// a term opens where its name first appears, which must lie in the range of the document registering it.
function readTerm(line) {
  const {pos:[id],attrs}=readRecord(line,1,['label','aliases','summary'],['label','summary']);
  validId(id);
  const aliases=attrs.aliases?attrs.aliases.split('|').map(a=>a.trim()).filter(Boolean):[];
  if(!attrs.summary.trim()||attrs.summary.length>300)throw new Error('词条 summary 须为不超过 300 字的简短释义。');
  return {id,label:attrs.label.trim(),aliases,summary:attrs.summary.trim()};
}
// Unusable terms are dropped with a warning instead of costing a repair request; the
// earliest registration of an ID or name wins. A term opens where its name first appears.
function checkTerms(terms,story,warnings) {
  const people=personNames(story),ids=new Set(),names=new Set();
  const drop=(term,message)=>{warnings.push(`资料第 ${term.line} 行的词条 ${term.id} 已忽略：${message}`);return false;};
  const usable=terms.filter(term=>{
    if(ids.has(term.id))return drop(term,'该 ID 已登记。');
    for(const name of termNames(term)) {
      if(name.length<2||name.length>40||/[{}|\r\n]/.test(name))return drop(term,`名称「${name}」须为 2—40 字的正文写法，不含 { } |。`);
      if(people.has(name))return drop(term,`名称「${name}」与人物称呼相同。`);
      if(names.has(name))return drop(term,`名称「${name}」已属于其他词条。`);
    }
    ids.add(term.id);for(const name of termNames(term))names.add(name);
    return true;
  });
  const found=matchTerms(story,usable).first,kept=usable.filter(term=>found.has(term.id)||drop(term,'名称没有在正文中逐字出现（人物名与原注内不计）。'));
  const {first}=matchTerms(story,kept);
  return kept.map(({id,label,aliases,summary})=>({id,label,aliases,summary,first:first.get(id)}));
}

// Produce a fresh state for every event so playback can retain historical snapshots.
export function applyDossierEvent(previous,e) {
  const state={fullName:previous?.fullName || '',summary:previous?.summary || '',group:previous?.group || '',entries:new Map(previous?.entries),portraits:new Map(previous?.portraits)};
  if(e.command==='@person' || e.command==='@intro')for(const key of ['fullName','summary','group'])if(key in e.attrs)state[key]=e.attrs[key];
  if(e.command==='@entry') {
    if(e.attrs.replaces) {
      if(e.attrs.replaces===e.id || !state.entries.has(e.attrs.replaces))throw new Error(`替换目标无效：${e.characterId}/${e.attrs.replaces}`);
      state.entries.delete(e.attrs.replaces);
    }
    state.entries.set(e.id,e.attrs);
  }
  if(e.command==='@remove' && !state.entries.delete(e.id))throw new Error(`删除目标不存在：${e.characterId}/${e.id}`);
  if(e.command==='@portrait')state.portraits.set(e.id,e.attrs);
  return state;
}

export function embedDossiers(output, documents) {
  const content=documents.filter(d=>d.text?.trim()).map(d=>d.text.trim());
  if(!content.length)return output;
  return output+'\n\n// @vn-dossiers-begin\n'+content.join('\n\n').split('\n').map(line=>'// '+line).join('\n')+'\n// @vn-dossiers-end\n';
}

export function extractDossiers(text) {
  const lines=scriptLines(text), script=[], documents=[];
  if(lines.some(l=>!l.literal&&l.text.trim()==='// @vn-dossiers-begin') && !lines.some(l=>!l.literal&&l.text.trim()==='// @vn-dossiers-end'))throw new Error('资料容器缺少结束标记。');
  let inside=false, seen=false, current=[];
  for(const {text:line,literal} of lines) {
    if(literal){script.push(line);continue;}
    if(line.trim()==='// @vn-dossiers-begin') {
      if(inside || seen)throw new Error('资料容器重复。');
      inside=true;seen=true;continue;
    }
    if(line.trim()==='// @vn-dossiers-end') {
      if(!inside)throw new Error('资料容器结束标记缺少起点。');
      inside=false;continue;
    }
    if(!inside){script.push(line);continue;}
    if(!line.startsWith('// '))throw new Error('资料容器每行必须以 // 加空格开头。');
    const content=line.slice(3);
    if(content.trim()==='@dossier 2' && current.length){documents.push({text:current.join('\n')});current=[];}
    current.push(content);
  }
  if(inside)throw new Error('资料容器缺少结束标记。');
  if(current.length)documents.push({text:current.join('\n')});
  return {script:script.join('\n'),documents};
}
