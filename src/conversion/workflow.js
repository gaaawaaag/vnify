import {renderPrompt} from '../prompts/library.js';
import {annotationCandidates,annotationPacket} from './annotation-context.js';
import {normalizeScript,scriptLines} from '../core/script-text.js';
export {normalizeScript} from '../core/script-text.js';
import { parseScript } from '../core/parser.js';
import { readRecord } from '../core/text-record.js';
import { detectLanguage, isBookLanguage, BOOK_LANGUAGES } from '../core/language.js';

export function decodeText(bytes, encoding = 'utf-8') {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  try { return new TextDecoder(encoding, { fatal:true, ignoreBOM:true }).decode(bytes); }
  catch { throw new Error(`不能按 ${encoding} 解码；请选择正确编码，不要用乱码继续。`); }
}

export function numberSource(original, { mode = 'line', prefix = 'p', start = 1, lang = undefined } = {}) {
  if (typeof original !== 'string' || !original.trim()) throw new Error('原文为空。');
  if (lang !== undefined && !isBookLanguage(lang)) throw new Error(`原文语言须为 ${BOOK_LANGUAGES.join('／')}。`);
  if (!['line','blank'].includes(mode)) throw new Error('分段方式须为 line 或 blank。');
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(prefix)) throw new Error('编号前缀须以英文字母开头，只含字母、数字、_、-。');
  if (!Number.isSafeInteger(start) || start < 1) throw new Error('起始编号须为正整数。');
  const paragraphs = [];
  let open = null;
  function add(from, to) {
    const number = start + paragraphs.length;
    if (!Number.isSafeInteger(number)) throw new Error('编号超出范围。');
    paragraphs.push({ id:prefix + String(number).padStart(6,'0'), start:from, end:to, text:original.slice(from,to) });
  }
  // Offsets refer to UTF-16 string indices in the unchanged decoded source.
  for (const match of original.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    if (!match[0]) continue;
    const content = match[0].replace(/(?:\r\n|\r|\n)$/, '');
    const from = match.index === 0 && content.startsWith('\uFEFF') ? 1 : match.index;
    const to = match.index + content.length;
    if (!content.trim()) {
      if (open) { add(open.start, open.end); open = null; }
    } else if (mode === 'line') add(from, to);
    else { open ??= { start:from }; open.end = to; }
  }
  if (open) add(open.start,open.end);
  // The language decides how sentences split and how the body is written; detected when not given.
  return { schema:'vn-source-1', mode, prefix, start, lang:lang ?? detectLanguage(original), original, paragraphs };
}

export function readSourceMap(value) {
  if (!value || value.schema !== 'vn-source-1') throw new Error('不是有效的 source-map.json。');
  const rebuilt = numberSource(value.original, value);
  if (JSON.stringify(rebuilt.paragraphs) !== JSON.stringify(value.paragraphs)) throw new Error('来源映射与原文不一致；拒绝加载损坏的编号。');
  return rebuilt;
}

export function numberedText(paragraphs) {
  return paragraphs.map(p => `[${p.id}]\n${p.text}`).join('\n\n');
}

export function splitBatches(paragraphs, maxChars = 12000) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1) throw new Error('每批参考字符数须为正整数。');
  const batches = []; let batch = [], size = 0;
  for (const p of paragraphs) {
    if (size && size + p.text.length > maxChars) { batches.push(batch); batch = []; size = 0; }
    batch.push(p); size += p.text.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export function sourcePacket(map, batch, {contextParagraphs = map.paragraphs, annotationSources = annotationCandidates(map)} = {}) {
  const first = map.paragraphs.findIndex(p => p.id === batch[0]?.id);
  if (first < 0) throw new Error('目标来源范围无效。');
  const allowed=new Set(contextParagraphs.map(p=>p.id));
  const context=map.paragraphs.slice(0,first).filter(p=>allowed.has(p.id)).slice(-2);
  return renderPrompt('source.request', {context: numberedText(context) || '无', firstSource: batch[0].id, lastSource: batch.at(-1).id, sourceCount: batch.length, source: numberedText(batch)})+annotationPacket(annotationSources.filter(p=>allowed.has(p.id)),batch);
}


export async function scriptHash(text) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalizeScript(text)));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,'0')).join('');
}
export function sourceDispositions(text) {
  return scriptLines(text).filter(l=>!l.literal&&l.text.trim().startsWith('// @source-use')).map(({text:line})=>{
    const {command,pos:[id],attrs:a}=readRecord(line.trim().slice(3),1,['kind','target','reason'],['kind','reason']);
    if(command!=='@source-use'||!['chapter','annotation','excluded'].includes(a.kind))throw new Error('来源去向只允许 chapter、annotation 或 excluded。');
    return {id,...a};
  });
}

export function inspectScript(text, expected = [], options = {}) {
  const story = parseScript(text,{...options,allowEmptyContent:true,strictSources:true});
  const referenced = new Set(story.units.flatMap(u => u.source));
  const dispositions = [];
  for (const {id,...a} of sourceDispositions(text)) {
    if (!['chapter','annotation','excluded'].includes(a.kind) || !a.reason.trim()) throw new Error(`来源 ${id} 的去向只允许 chapter、annotation 或 excluded，并须说明理由。`);
    if (referenced.has(id) || dispositions.some(d=>d.id===id)) throw new Error(`来源 ${id} 同时用于正文或被重复登记。`);
    if (a.kind==='chapter' && !story.chapters.some(c=>c.id===a.target)) throw new Error(`来源 ${id} 的章节去向不存在。`);
    if (a.kind!=='chapter' && a.target) throw new Error('非章节的移出记录不接受 target。');
    dispositions.push({id,...a});
  }
  const noteSources=new Set([...story.annotations.values()].flatMap(note=>note.source));
  for(const d of dispositions)if(noteSources.has(d.id)&&d.kind!=='annotation')throw new Error(`注解来源 ${d.id} 不能同时登记为 ${d.kind}。`);
  if(options.requireAnnotationContent)for(const d of dispositions)if(d.kind==='annotation'&&!noteSources.has(d.id))story.warnings.push({line:1,message:renderPrompt('repair.annotation', {sourceId: d.id})});
  const available=new Set([...expected,...options.annotationSources??[]].map(p=>p.id));
  if(expected.length)for(const id of noteSources)if(!available.has(id))throw new Error(`注解来源不存在或未提供：${id}`);
  for(const id of noteSources)if(expected.some(p=>p.id===id))referenced.add(id);
  for(const d of dispositions)referenced.add(d.id);
  for(const transition of story.transitions)for(const id of transition.source) {
    if(dispositions.some(d=>d.id===id))throw new Error(`过渡来源 ${id} 已登记为其他去向。`);
    referenced.add(id);
  }
  if(!story.units.length && (!referenced.size || story.entities.size))throw new Error('跳过批次须登记全部来源去向，不声明人物或地点。');
  const ids = new Set(expected.map(p => p.id));
  const missing = expected.filter(p => !referenced.has(p.id)).map(p => p.id);
  const unknown = expected.length ? [...referenced].filter(id => !ids.has(id)) : [];
  const sourceHints=[];
  const numericKey=id=>{const m=/^(.*?)(\d+)$/.exec(id);return m ? `${m[1]}:${m[2].replace(/^0+(?=\d)/,'')}` : null;};
  for(const id of unknown) {
    const key=numericKey(id),matches=key ? missing.filter(candidate=>numericKey(candidate)===key) : [];
    if(matches.length===1)sourceHints.push(renderPrompt('repair.source-id', {actual: id, expected: matches[0]}));
  }
  const locations=[...story.entities.values()].filter(e=>e.kind==='location');
  for(const a of locations.filter(e=>!e.label.includes('·'))) {
    for(const b of locations.filter(e=>e.label.includes('·') && e.label.split('·').at(-1)===a.label)) {
      story.warnings.push({line:1,message:renderPrompt('repair.location', {firstId: a.id, firstLabel: a.label, secondId: b.id, secondLabel: b.label})});
    }
  }
  const duplicates = [], seen = new Map();
  for (const u of story.units) {
    const key = JSON.stringify([u.source,u.speakerId,u.kind,u.text]);
    if (seen.has(key)) duplicates.push({ line:u.line, previous:seen.get(key) });
    else seen.set(key,u.line);
  }
  return { story, missing, unknown, duplicates, dispositions, sourceHints, skipped:!story.units.length };
}

// All operations refer to one immutable input snapshot, never a global search.
export async function applyPatches(input, document, options = {}) {
  if (!document || document.schema !== 'vn-patch-1' || !Array.isArray(document.patches)) throw new Error('补丁必须是 vn-patch-1 JSON 对象。');
  const base = normalizeScript(input);
  if (document.baseSha256 !== await scriptHash(base)) throw new Error('补丁版本不匹配：脚本已变化，请重新生成第二轮请求。');
  const lines = base.split('\n');
  const patches = [...document.patches].sort((a,b) => a.startLine-b.startLine);
  let end = 0;
  for (const p of patches) {
    if (!Number.isSafeInteger(p.startLine) || !Number.isSafeInteger(p.endLine) || p.startLine < 1 || p.endLine < p.startLine || p.endLine > lines.length) throw new Error('补丁行范围无效。');
    if (p.startLine <= end) throw new Error('补丁范围重叠，拒绝应用。');
    if (typeof p.before !== 'string' || typeof p.after !== 'string' || typeof p.reason !== 'string' || !p.reason.trim()) throw new Error('补丁缺少 before、after 或 reason 字符串。');
    if (p.before.includes('\r') || p.after.includes('\r')) throw new Error('补丁正文使用 LF 换行（JSON 中写 \\n）。');
    if (lines.slice(p.startLine-1,p.endLine).join('\n') !== p.before) throw new Error(`第 ${p.startLine}–${p.endLine} 行与 before 不一致，拒绝模糊替换。`);
    end = p.endLine;
  }
  for (const p of patches.reverse()) lines.splice(p.startLine-1,p.endLine-p.startLine+1,...(p.after === '' ? [] : p.after.split('\n')));
  const output = lines.join('\n');
  const validation = inspectScript(output,[],options); // Atomic: never return an invalid partial result.
  return { output, validation, changes:document.patches.length };
}
