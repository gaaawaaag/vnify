import {renderPrompt} from '../prompts/library.js';
import {completeEntityDeclarations} from './entity-declarations.js';
import {validateDossiers, applyDossierEvent} from '../core/dossier.js';
export {validateDossiers, applyDossierEvent, embedDossiers, extractDossiers} from '../core/dossier.js';
import {inspectScript} from './workflow.js';
import {readRecord} from '../core/text-record.js';
import {requireValid} from '../core/validation.js';
import {scriptLines} from '../core/script-text.js';

const ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const validId = id => { if (!ID.test(id || '') || id === 'none') throw new Error(`无效 ID：${id}`); return id; };
const quote = value => JSON.stringify(value);

export function validateBatch(script, batch, book, initialRevealed = new Map(), additionalChecks = []) {
  if(scriptLines(script).some(l=>!l.literal&&l.text.trim()==='// @vn-dossiers-begin'))throw new Error('此稿包含资料容器，请使用“导入 AI 脚本”提取资料，再核对本批范围。');
  const check = inspectScript(script,batch.paragraphs,{initialRevealed,annotationSources:batch.annotationSources});
  const errors=[];
  if (check.story.book.id !== book.id || check.story.book.title !== book.title) errors.push({code:'book',message:'书籍 ID／标题与项目设置不一致。'});
  if (check.story.chapters.length !== 1 || check.story.chapters[0].id !== batch.chapter.id || check.story.chapters[0].title !== batch.chapter.title) errors.push({code:'chapter',message:`本批只允许章节 ${batch.chapter.id} title=${quote(batch.chapter.title)}。`});
  if (check.missing.length || check.unknown.length) errors.push({code:'coverage',message:`来源未对齐：缺失 ${check.missing.join(', ') || '无'}；范围外 ${check.unknown.join(', ') || '无'}。${check.sourceHints.join(' ')}`});
  for(const validate of additionalChecks) {
    try {validate(check);}
    catch(e){errors.push(...(e.issues??[{code:'additional',message:e.message}]));}
  }
  requireValid(errors);
  return check;
}

export function mergeBatches(records, plan, book, end = plan.length-1) {
  validId(book.id);
  if (end < 0 || end >= plan.length) throw new Error('没有可合并的范围。');
  const headers = new Map(), profiles = new Map(), chapters = new Map(), body = [], registry=new Map();
  const inherited=new Map(), playable=new Set();
  let version;
  for (let i=0;i<=end;i++) {
    const r = records[i];
    if (!r?.accepted) throw new Error(`第 ${i+1} 批尚未验收，不能跳批合并。`);
    const script=completeEntityDeclarations(r.script,[...registry.values()]);
    const {story} = validateBatch(script,plan[i],book,inherited);
    for(const u of story.units)playable.add(u.chapter.id);
    version ??= story.version;
    if (version !== story.version) throw new Error('不同脚本版本不能自动混合；请统一版本后再验收。');
    for (const e of story.entities.values()) {
      registry.set(e.id,e);
      const declaration = `@${e.kind} ${e.id} label=${quote(e.label)}${e.color ? ` color=${quote(e.color)}` : ''}`;
      if (headers.has(e.id) && headers.get(e.id)!==declaration) throw new Error(renderPrompt('repair.entity-conflict', {id: e.id}));
      headers.set(e.id,declaration);
      for (const [id,p] of e.profiles) {
        const key=`${e.id}/${id}`, value=`@profile ${e.id} ${id} facts=${quote(p.facts)} prompt=${quote(p.prompt)} inferred=${quote(p.inferred)}`;
        if (profiles.has(key) && profiles.get(key)!==value) throw new Error(`外观档案冲突：${key}`);
        profiles.set(key,value);
      }
    }
    for(const [id,state] of story.units.at(-1)?.revealed || [])inherited.set(id,state);
    for (const {text:line,literal} of scriptLines(script)) {
      if(literal){body.push(line);continue;}
      const trimmed=line.trim();
      if (/^@(vn|book|character|location|profile)\b/.test(trimmed)) continue;
      if (trimmed.startsWith('@chapter ')) {
        const c=story.chapters[0];
        if (chapters.has(c.id)) continue;
        chapters.set(c.id,c.title);
      }
      body.push(line);
    }
  }
  const selectedBody=scriptLines(`@vn ${version}\n${body.join('\n')}`).slice(1).flatMap(({text:line,literal})=>{
    if(literal)return [line];
    const trimmed=line.trim();
    if(trimmed.startsWith('@chapter ') && !playable.has(trimmed.split(/\s+/)[1]))return [];
    if(trimmed.startsWith('// @source-use ')) {
      const {pos:[id],attrs}=readRecord(trimmed.slice(3),1,['kind','target','reason'],['kind','reason']);
      if(attrs.kind==='chapter' && !playable.has(attrs.target))return [`// @source-use ${id} kind=excluded reason=${quote(attrs.reason)}`];
    }
    return [line];
  });
  // Batches declare only id and title; the author comes from the project settings.
  const author=book.author?.trim()?` author=${quote(book.author.trim())}`:'';
  // Chinese is the default, so only other languages are written out.
  const lang=book.lang&&book.lang!=='zh'?` lang=${book.lang}`:'';
  const output=[`@vn ${version}`,`@book ${book.id} title=${quote(book.title)}${author}${lang}`,...headers.values(),...profiles.values(),'',...selectedBody].join('\n');
  // Full parse catches cross-batch block collisions and state/reference problems.
  const check=inspectScript(output,plan.slice(0,end+1).flatMap(b=>b.paragraphs),{requireAnnotationContent:end===plan.length-1,annotationSources:plan.slice(0,end+1).flatMap(b=>b.annotationSources??[])});
  if(check.missing.length || check.unknown.length) throw new Error('合并后的来源覆盖不一致。');
  return { output, story:check.story };
}

export function continuityPacket(story) {
  if (!story?.units.length) return renderPrompt('body.empty-registry');
  const last=story.units.at(-1);
  const aliases=new Map();
  for(const u of story.units){
    for(const [id,state] of u.revealed){if(!aliases.has(id))aliases.set(id,new Set());aliases.get(id).add(state.label);}
    for(const run of u.runs)if(run.characterId && aliases.has(run.characterId))aliases.get(run.characterId).add(run.text);
  }
  return [...story.entities.values()].map(e=>renderPrompt('body.entity-state', {kind: e.kind, id: e.id, label: quote(e.label), color: e.color ? ` color=${quote(e.color)}` : '', aliases: JSON.stringify([...(aliases.get(e.id)||[])]), state: JSON.stringify(last.revealed.get(e.id) || null)})).join('\n');
}

export function dossierBlockPacket(story, targetSources) {
  const allowed=new Set(targetSources),blocks=new Map(),seen=new Set();
  for(const u of story.units) {
    if(!blocks.has(u.block.id))blocks.set(u.block.id,{block:u.block.id,kind:u.block.kind,source:[],body:[],publicNames:{}});
    const block=blocks.get(u.block.id);
    block.source.push(...u.source);
    const firstReveals={};
    for(const [id,state] of u.revealed)if(!seen.has(id)) {
      seen.add(id);
      if(story.entities.get(id)?.kind==='character')firstReveals[id]=state.label;
    }
    block.body.push({source:u.source,text:u.text,speakerId:u.speakerId,firstReveals});
    block.publicNames=Object.fromEntries([...u.revealed].map(([id,state])=>[id,state.label]));
  }
  return [...blocks.values()].map(b=>({...b,source:[...new Set(b.source)]})).filter(b=>b.source.length && b.source.every(id=>allowed.has(id)));
}

export function dossierStatePacket(result, targetIndices=[]) {
  const indices=new Set(targetIndices);
  return JSON.stringify({
    characters:[...result.characters].map(([id,c])=>({id,fullName:c.fullName,summary:c.summary,group:c.group,entries:Object.fromEntries(c.entries),defaultPortrait:[...c.portraits][0]||null})),
    existingEventsInTarget:result.events.filter(e=>indices.has(e.index)).map(e=>({afterBlock:e.afterBlock,after:e.after,command:e.command,characterId:e.characterId,id:e.id,attrs:e.attrs})),
    ...(result.terms?.length?{terms:result.terms.map(({id,label,aliases})=>({id,label,aliases}))}:{}),
  },null,2);
}

// Completion is a conversion requirement, not a reader-format restriction:
// old files and intermediate dossier drafts may still contain no summaries.
export function missingDossierSummaries(story, result) {
  const first=new Map();
  for(const u of story.units)for(const [id,state] of u.revealed) {
    if(story.entities.get(id)?.kind==='character' && !first.has(id))
      first.set(id,{block:u.block.id,label:state.label,source:[...u.source]});
  }
  const summaries=new Map();
  for(const e of result.events)if('summary' in e.attrs)summaries.set(e.characterId,e.attrs.summary);
  return [...(story.units.at(-1)?.revealed || [])].flatMap(([id,state])=>{
    if(story.entities.get(id)?.kind!=='character')return [];
    const summary=summaries.get(id)?.trim();
    return summary && !/^[?？\s]+$/.test(summary) ? [] : [{id,label:state.label,firstReveal:first.get(id)}];
  });
}

export function requireDossierSummaries(story, result) {
  const missing=missingDossierSummaries(story,result);
  if(missing.length)throw new Error(renderPrompt('repair.dossier-missing', {characters: missing.map(c=>`${c.id}（${c.label}）`).join('、')}));
  return result;
}
