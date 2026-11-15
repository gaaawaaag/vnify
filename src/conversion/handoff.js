// A handoff package from another tool (e.g. a comic transcriber): narrative text with stable 1-based line numbers,
// reference images bound to line ranges, and a glossary. This module checks it and turns line numbers into source IDs.
export const HANDOFF_SCHEMA='vn-handoff-1';
const KINDS=['character','location','prop','highlight'];
const ID=/^[A-Za-z][A-Za-z0-9_-]*$/;
const MIN_REFERENCE_SIDE=384;
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value,limit=2000)=>typeof value==='string'&&!!value.trim()&&value.length<=limit;
const relativeFile=value=>typeof value==='string'&&!!value&&!/^([a-z]:|[\\/])/i.test(value)&&!value.split(/[\\/]/).includes('..');
export const isDefaultLook=ref=>ref.stage===undefined||ref.stage==='默认';

// Each physical line (1-based) maps to the paragraph numbered from it; a range edge on a blank line moves inward.
export function lineSources(map) {
  if(map.mode!=='line')throw new Error('交接包的正文须按行编号（number-source 默认方式）。');
  let next=0;
  const byLine=map.original.split(/\r\n|\r|\n/).map(line=>line.trim()?next++:null);
  return function range([from,to]) {
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>byLine.length)return null;
    let a=from-1,b=to-1;
    while(a<=b&&byLine[a]===null)a++;
    while(b>=a&&byLine[b]===null)b--;
    return a>b?null:{from:byLine[a],to:byLine[b]};
  };
}

// Chapters come from the manifest ({title,line}) or else the heading lines that start with '# '.
export function handoffChapters(map,range,manifestChapters) {
  if(manifestChapters!==undefined) {
    if(!Array.isArray(manifestChapters))throw new Error('handoff.json 的 chapters 须为 [{title,line}] 数组。');
    return manifestChapters.map((c,i)=>{
      const at=record(c)&&text(c.title,200)?range([c.line,c.line]):null;
      if(!at)throw new Error(`handoff.json 第 ${i+1} 个章节需要 title 与指向非空行的 line。`);
      return {start:map.paragraphs[at.from].id,title:c.title.trim()};
    });
  }
  return map.paragraphs.filter(p=>/^#\s+\S/.test(p.text.trim())).map(p=>({start:p.id,title:p.text.trim().replace(/^#\s+/,'')}));
}

export function readGlossary(value) {
  if(!Array.isArray(value))throw new Error('glossary.json 须为 [{term, aliases, definition}] 数组。');
  return value.map((g,i)=>{
    const aliases=g?.aliases??[];
    if(!record(g)||!text(g.term,100)||!text(g.definition)||!Array.isArray(aliases)||aliases.some(a=>!text(a,100)))
      throw new Error(`glossary.json 第 ${i+1} 项需要 term、definition 与字符串 aliases。`);
    return {term:g.term.trim(),aliases:aliases.map(a=>a.trim()),definition:g.definition.trim()};
  });
}

/* refs: [{id, kind, name, aliases?, file, stage?, source:{lines:[from,to]}, notes?, origin?, url?, quality?}].
 * sizes(file) gives {width,height} of a reference image or null when it is not a PNG/JPEG/WebP.
 * Returns the refs with source IDs plus warnings about what a downstream step will have to work around. */
export function readRefs(value,map,range,sizes) {
  if(!Array.isArray(value))throw new Error('refs.json 须为数组。');
  const warnings=[],seen=new Set();
  const refs=value.map((r,i)=>{
    const where=`refs.json 第 ${i+1} 项`;
    if(!record(r)||!ID.test(r.id??'')||!KINDS.includes(r.kind)||!text(r.name,100)||!relativeFile(r.file))
      throw new Error(`${where}需要 id（英文字母开头）、kind（${KINDS.join('/')}）、name 与包内相对 file。`);
    if(r.aliases!==undefined&&(!Array.isArray(r.aliases)||r.aliases.some(a=>!text(a,100))))throw new Error(`${where}的 aliases 须为字符串数组。`);
    if(r.stage!==undefined&&(r.kind!=='character'||!text(r.stage,40)))throw new Error(`${where}的 stage 只用于 character，且为简短文字。`);
    const at=range(r.source?.lines??[]);
    if(!at)throw new Error(`${where}的 source.lines 须为 text.txt 内有正文的 [起, 止] 行号。`);
    const key=`${r.id}\u0000${r.stage??'默认'}`;
    if(seen.has(key))warnings.push(`${r.id}（${r.stage??'默认'}）有多张参考图，只用第一张。`);
    seen.add(key);
    const size=sizes(r.file);
    if(!size)throw new Error(`${where}的图片不是 PNG／JPEG／WebP：${r.file}`);
    if(['character','prop'].includes(r.kind)&&Math.min(size.width,size.height)<MIN_REFERENCE_SIDE)
      warnings.push(`${r.id} 的参考图只有 ${size.width}×${size.height}，作身份参考偏小。`);
    return {id:r.id,kind:r.kind,name:r.name.trim(),aliases:(r.aliases??[]).map(a=>a.trim()),file:r.file,
      ...(r.stage!==undefined?{stage:r.stage.trim()}:{}),from:map.paragraphs[at.from].id,to:map.paragraphs[at.to].id,
      ...(text(r.notes)?{notes:r.notes.trim()}:{}),...Object.fromEntries(['origin','url','quality'].filter(k=>text(r[k])).map(k=>[k,r[k]])),
      width:size.width,height:size.height,fromIndex:at.from,toIndex:at.to};
  });
  for(const id of new Set(refs.filter(r=>r.kind==='character').map(r=>r.id)))
    if(!refs.some(r=>r.id===id&&r.kind==='character'&&isDefaultLook(r)))
      warnings.push(`${id} 没有默认形象（stage 省略或“默认”）的参考图，默认立绘不会附参考图。`);
  return {refs,warnings};
}

// Visual references for vn-convert to start its visual-profiles.json from: the reference images' notes per character
// and location. They are not quotes from the text, so they go in `note`.
export function visualProfileSeed(refs) {
  const byId=new Map();
  for(const r of refs.filter(r=>['character','location'].includes(r.kind)&&r.notes)) {
    const line=isDefaultLook(r)?r.notes:`（${r.stage}）${r.notes}`;
    byId.set(r.id,[...(byId.get(r.id)??[]),line]);
  }
  return [...byId].map(([id,lines])=>({id,note:lines.join(' ').slice(0,1000)}));
}

// References for vn-director in its own format: characters and places by entity ID (the ref ID unless registered
// otherwise), looks other than the default awaiting a variantId, props awaiting a cutInId, and highlights with the
// source range a CG has to cover for the panel to serve as its composition reference.
export function directorReferences(refs) {
  return refs.map(r=>({file:r.file,refId:r.id,kind:r.kind,name:r.name,
    ...(['character','location'].includes(r.kind)?{entityId:r.id}:{}),...(r.stage!==undefined&&!isDefaultLook(r)?{stage:r.stage}:{}),
    ...(r.kind==='highlight'?{from:r.from,to:r.to}:{})}));
}
