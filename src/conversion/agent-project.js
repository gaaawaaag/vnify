import {readSourceMap, inspectScript} from './workflow.js';
import {mergeBatches, requireDossierSummaries, missingDossierSummaries, continuityPacket, dossierBlockPacket, dossierStatePacket} from './conversion-project.js';
import {validateDossiers, embedDossiers} from '../core/dossier.js';
import {dossierOptions,validateDossierMode} from './dossier-options.js';
import {completeEntityDeclarations} from './entity-declarations.js';

// The agent owns planning and prose; shared conversion code owns assembly and checks.
export function assembleAgentProject(project, sourceMap, scripts, dossierTexts, {bodyOnly=false,lengths=false}={}) {
  if(project.schema!=='vn-agent-1')throw new Error('制作清单 schema 须为 vn-agent-1。');
  const map=readSourceMap(sourceMap), positions=new Map(map.paragraphs.map((p,i)=>[p.id,i]));
  const through=project.through ?? map.paragraphs.at(-1).id;
  const end=positions.get(through);
  if(end===undefined)throw new Error(`目标末尾来源不存在：${through}`);
  const range=({from,to})=>{
    const a=positions.get(from),b=positions.get(to);
    if(a===undefined || b===undefined || a>b || b>end)throw new Error(`来源范围无效：${from}—${to}`);
    return {start:a,end:b,paragraphs:map.paragraphs.slice(a,b+1)};
  };
  if(!Array.isArray(project.parts) || !project.parts.length || scripts.length!==project.parts.length)throw new Error('制作清单需要按原文顺序列出正文 parts。');
  let next=0,lastChapter=null;
  const chapters=new Map();
  const plan=project.parts.map((part,i)=>{
    const r=range(part);
    if(r.start!==next)throw new Error(`第 ${i+1} 批须从 ${map.paragraphs[next]?.id ?? '目标末尾之后'} 开始，来源不能跳过或重叠。`);
    next=r.end+1;
    const chapter=part.chapter;
    if(!chapter?.id || typeof chapter.title!=='string')throw new Error(`第 ${i+1} 批需要 chapter.id 和 chapter.title。`);
    if(chapters.has(chapter.id) && (lastChapter!==chapter.id || chapters.get(chapter.id)!==chapter.title))throw new Error(`章节 ${chapter.id} 须连续且标题一致。`);
    chapters.set(chapter.id,chapter.title);lastChapter=chapter.id;
    return {chapter,paragraphs:r.paragraphs,annotationSources:map.paragraphs};
  });
  if(next!==end+1)throw new Error(`正文批次尚未覆盖目标末尾 ${through}；下一来源为 ${map.paragraphs[next].id}。`);
  const lang=project.book?.lang ?? map.lang;
  if(lang!==map.lang)throw new Error(`制作清单的 book.lang（${lang}）与编号原文的语言（${map.lang}）不一致。`);
  const {output,story}=mergeBatches(scripts.map(script=>({script,accepted:true})),plan,{...project.book,lang});
  if(!story.units.length)throw new Error('目标范围没有可播放正文。');
  const paragraphs=map.paragraphs.slice(0,end+1);
  const documents=(project.dossiers ?? []).map((item,i)=>({text:dossierTexts[i],allowedSources:range(item).paragraphs.map(p=>p.id)}));
  if(documents.length!==dossierTexts.length || documents.some(d=>typeof d.text!=='string'))throw new Error('资料文件与制作清单不一致。');
  // mode=off: character colors only; agent batching is informational, so off needs no explicit group.
  const options=dossierOptions(project.dossier?.mode==='off'?{batching:'group',...project.dossier}:project.dossier);
  if(options.mode==='off'&&documents.length)throw new Error('人物资料已关闭（mode=off），清单不能登记 dossiers。');
  const dossiers=validateDossierMode(validateDossiers(documents,story),options);
  if(!bodyOnly&&options.mode!=='off')requireDossierSummaries(story,dossiers);
  const check=inspectScript(output,paragraphs,{annotationSources:map.paragraphs});
  // Extra text must be material the body already left out of the reading flow.
  // Batches may omit declarations known from earlier batches, as merging allows.
  const known=[...story.entities.values()];
  const excluded=new Set(scripts.flatMap((script,i)=>inspectScript(completeEntityDeclarations(script,known),plan[i].paragraphs,{annotationSources:map.paragraphs})
    .dispositions.filter(d=>d.kind==='excluded').map(d=>d.id)));
  const extraRanges=agentExtraRanges(project.extra,map,excluded);
  return {
    output:embedDossiers(output,documents),
    report:{
      ok:true,mode:bodyOnly?'body':'with-dossiers',dossier:options,through,sourceComplete:end===map.paragraphs.length-1,
      chapters:story.chapters.length,blocks:story.blocks.length,units:story.units.length,
      warnings:story.warnings,duplicates:check.duplicates,extra:extraRanges.map(r=>r.title),
      missingSummaries:options.mode==='off'?[]:missingDossierSummaries(story,dossiers),
      ...(lengths?{lengths:lengthReport(story,map,project.parts)}:{}),
      note:'程序检查不替代原文忠实度、说话人和剧透审阅。',
    },
    extraSource:{ranges:extraRanges,excluded:[...excluded]},
    context:{continuity:continuityPacket(story),blocks:dossierBlockPacket(story,paragraphs.map(p=>p.id)),dossiers:JSON.parse(dossierStatePacket(dossiers)),missingSummaries:missingDossierSummaries(story,dossiers)},
  };
}

// project.extra: [{title, from, to}] names book-external material kept as Extra (prefaces, afterwords, character lists).
function agentExtraRanges(value,map,excluded) {
  if(value===undefined)return [];
  const positions=new Map(map.paragraphs.map((p,i)=>[p.id,i]));
  if(!Array.isArray(value)||value.length>64)throw new Error('extra 须为最多 64 项的数组。');
  let last=-1;
  return value.map((item,i)=>{
    const a=positions.get(item?.from),b=positions.get(item?.to),ref=`extra 第 ${i+1} 项`;
    const title=typeof item?.title==='string'?item.title:'';
    if(!title.trim()||title.length>100||/[\r\n]/.test(title))throw new Error(`${ref}需要不超过 100 字的单行 title。`);
    if(a===undefined||b===undefined||a>b||a<=last)throw new Error(`${ref}的来源范围无效，或与前项重叠、未按原文顺序。`);
    last=b;
    const kept=map.paragraphs.slice(a,b+1).find(p=>!excluded.has(p.id));
    if(kept)throw new Error(`${ref}的来源 ${kept.id} 未在正文中登记为 excluded。`);
    return {start:item.from,end:item.to,kind:'external',title:title.trim()};
  });
}

/* Length check for omissions and additions: units that share a source form one group, and each group compares the
 * letters and digits of its sources with those of its units. Removed speech tags and normal tightening stay inside the
 * bounds; groups outside them are listed for reading against the original. */
const LENGTH_BOUNDS={low:0.6,high:1.5,min:30};
const letters=text=>(String(text).match(/[\p{L}\p{N}]/gu)||[]).length;
function lengthReport(story,map,parts) {
  const texts=new Map(map.paragraphs.map(p=>[p.id,p.text])),positions=new Map(map.paragraphs.map((p,i)=>[p.id,i]));
  const groups=[];
  for(const u of story.units) {
    const last=groups.at(-1);
    if(last&&u.source.some(id=>last.sources.has(id))){u.source.forEach(id=>last.sources.add(id));last.body+=letters(u.text);continue;}
    groups.push({sources:new Set(u.source),body:letters(u.text)});
  }
  const rows=groups.map(g=>{
    const ids=[...g.sources].sort((a,b)=>positions.get(a)-positions.get(b));
    const source=ids.reduce((n,id)=>n+letters(texts.get(id)),0);
    return {from:ids[0],to:ids.at(-1),source,body:g.body,ratio:source?Math.round(g.body/source*100)/100:null,start:positions.get(ids[0])};
  });
  const flagged=rows.filter(r=>Math.max(r.source,r.body)>=LENGTH_BOUNDS.min
    &&(r.ratio===null||r.ratio<LENGTH_BOUNDS.low||r.ratio>LENGTH_BOUNDS.high));
  const byPart=parts.map(part=>{
    const a=positions.get(part.from),b=positions.get(part.to),inside=rows.filter(r=>r.start>=a&&r.start<=b);
    const source=inside.reduce((n,r)=>n+r.source,0),body=inside.reduce((n,r)=>n+r.body,0);
    return {script:part.script,source,body,ratio:source?Math.round(body/source*100)/100:null};
  });
  return {bounds:LENGTH_BOUNDS,parts:byPart,
    outside:flagged.map(({from,to,source,body,ratio})=>({sources:from===to?from:`${from}—${to}`,source,body,ratio}))};
}

/* context.json as text for the dossier stage: one unit per line, publicNames in full on the first block and then only
 * as they change. A range keeps the blocks wholly inside it, plus the first-reveal blocks before it of characters
 * whose summary is still missing. */
/** @param {any} context @param {any} sourceMap @param {{from:string,to:string}|null} [range] */
export function renderContext(context,sourceMap,range=null) {
  const positions=new Map(readSourceMap(sourceMap).paragraphs.map((p,i)=>[p.id,i]));
  const at=id=>{const i=positions.get(id);if(i===undefined)throw new Error(`来源不存在：${id}`);return i;};
  const [a,b]=range?[at(range.from),at(range.to)]:[0,Infinity];
  if(a>b)throw new Error('context 范围须由前到后。');
  const inside=block=>block.source.every(id=>positions.get(id)>=a&&positions.get(id)<=b);
  const blocks=context.blocks.filter(inside);
  const shown=new Set(blocks.map(x=>x.block));
  const reference=context.blocks.filter(x=>!shown.has(x.block)&&positions.get(x.source[0])<a
    &&context.missingSummaries.some(m=>m.firstReveal?.block===x.block));
  const names=n=>Object.entries(n).map(([id,label])=>`${id}=${label}`).join(' ');
  const render=list=>{
    let previous=null;
    return list.map(x=>{
      const lines=[`@block ${x.block} kind=${x.kind} sources=${x.source[0]}${x.source.length>1?`—${x.source.at(-1)}`:''}`];
      for(const u of x.body) {
        lines.push([u.source.join(','),u.speakerId??'',u.text.replace(/\r?\n/g,'\n\t\t')].join('\t'));
        if(Object.keys(u.firstReveals).length)lines.push(`\tfirstReveals ${names(u.firstReveals)}`);
      }
      const changed=previous?Object.fromEntries(Object.entries(x.publicNames).filter(([id,label])=>previous[id]!==label)):x.publicNames;
      if(!previous||Object.keys(changed).length)lines.push(`${previous?'publicNames+':'publicNames'} ${names(changed)}`);
      previous=x.publicNames;
      return lines.join('\n');
    }).join('\n\n');
  };
  const dossiers=context.dossiers.characters.map(c=>JSON.stringify(c)).join('\n');
  const missing=context.missingSummaries.map(m=>`${m.id}\t${m.label}\t首次公开 ${m.firstReveal?.block??'—'}`).join('\n');
  return [
    '# 实体登记（continuity；最新称呼不代表早期读者已知）',context.continuity,
    '# 已有资料（每行一个人物）',dossiers||'（无）',
    ...(context.dossiers.terms?['# 已登记词条',JSON.stringify(context.dossiers.terms)]:[]),
    '# 待补简介（missingSummaries）',missing||'（无）',
    `# 正文块${range?`（${range.from}—${range.to} 内的完整块）`:''}`,
    '每块先列 @block 行；其后每行一个单元，以制表符分隔：来源、说话人 ID（旁白为空）、文字；单元下的 firstReveals 为人物首次公开名；'
      +'块末 publicNames 为读完该块时的公开名，之后的块只用 publicNames+ 列出变化。',
    render(blocks)||'（无）',
    ...(reference.length?['# 范围外首次公开参考（待补简介人物的首次公开块，只用来核实事实）',render(reference)]:[]),
  ].join('\n\n')+'\n';
}
