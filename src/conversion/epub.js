// EPUB input: the spine becomes plain source lines (one paragraph per line), the
// table of contents becomes a fixed chapter table, and image positions are recorded
// beside the text. The source text itself never contains image placeholders.
import {openArchive} from './epub-archive.js';
import {parseMarkup,elements,first,textContent,attr} from './markup.js';

const BLOCK=new Set(['p','div','h1','h2','h3','h4','h5','h6','li','ul','ol','dl','dt','dd','blockquote','pre','table','tr','td','th',
  'section','article','header','footer','aside','nav','figure','figcaption','hr','center','address','body','main','caption']);
const SKIP=new Set(['head','script','style','rt','rp','title','noscript','template']);
const IMAGE=/^image\/(?:png|jpeg|gif|webp|svg\+xml)$/;
const FONT=/\.(?:ttf|otf|woff2?)$/i;
const space=text=>text.replace(/\s+/g,' ').trim();

function decodeDocument(bytes) {
  if(bytes[0]===0xff&&bytes[1]===0xfe)return new TextDecoder('utf-16le').decode(bytes);
  if(bytes[0]===0xfe&&bytes[1]===0xff)return new TextDecoder('utf-16be').decode(bytes);
  const head=new TextDecoder('latin1').decode(bytes.subarray(0,200));
  const label=/^<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(head)?.[1]??'utf-8';
  try {return new TextDecoder(label).decode(bytes);} catch {return new TextDecoder('utf-8').decode(bytes);}
}
// Paths inside the archive; external links resolve to null.
export function resolveHref(base,href) {
  if(typeof href!=='string'||/^[a-z][a-z0-9+.-]*:/i.test(href))return null;
  const hash=href.indexOf('#'),raw=hash<0?href:href.slice(0,hash),fragment=hash<0?'':href.slice(hash+1);
  const decode=value=>{try{return decodeURIComponent(value);}catch{return value;}};
  const parts=base.split('/').slice(0,-1);
  if(!raw)return {path:base,fragment:decode(fragment)};
  for(const part of decode(raw).split('/')) {
    if(part==='..')parts.pop();
    else if(part&&part!=='.')parts.push(part);
  }
  return {path:parts.join('/'),fragment:decode(fragment)};
}

function extract(doc,path,state) {
  let buffer='';
  const flush=()=>{if(buffer.trim())state.lines.push(buffer.replace(/^[ \t]+|[ \t]+$/g,''));buffer='';};
  const image=href=>{
    const target=resolveHref(path,href);
    if(!target||!state.images.has(target.path))return;
    // The image follows the line it appears in, or the last completed line.
    state.positions.push({path:target.path,file:path,after:state.lines.length-(buffer.trim()?0:1)});
  };
  const walk=(node,pre)=>{
    for(const child of node.children) {
      if(typeof child==='string') {
        if(!pre){buffer+=child.replace(/[ \t\r\n\f]+/g,' ');continue;}
        const parts=child.split(/\r\n|\r|\n/);
        parts.forEach((part,i)=>{if(i)flush();buffer+=part;});
        continue;
      }
      if(SKIP.has(child.name))continue;
      const id=attr(child,'id');
      if(id&&!state.anchors.has(`${path}#${id}`))state.anchors.set(`${path}#${id}`,state.lines.length);
      if(child.name==='br'){flush();continue;}
      if(child.name==='img'){image(attr(child,'src'));continue;}
      if(child.name==='image'){image(attr(child,'href'));continue;}
      const block=BLOCK.has(child.name);
      if(block)flush();
      walk(child,pre||child.name==='pre');
      if(block)flush();
    }
  };
  state.anchors.set(path,state.lines.length);
  const start=state.lines.length;
  walk(first(doc,'body')??doc,false);
  flush();
  state.textLines.set(path,state.lines.length-start);
}

// DRM encrypts content documents; font obfuscation alone is harmless for text.
async function rejectEncryption(archive) {
  if(!archive.has('META-INF/encryption.xml'))return;
  const doc=parseMarkup(decodeDocument(await archive.read('META-INF/encryption.xml')));
  for(const ref of elements(doc,'cipherreference'))
    if(!FONT.test(attr(ref,'uri')??''))throw new Error('EPUB 已加密（DRM），无法读取。');
}

function tocEntries(doc,path,kind) {
  if(kind==='ncx')return [...elements(doc,'navpoint')].map(point=>({
    title:space(textContent(first(point,'navlabel')??{children:[]})),target:resolveHref(path,attr(first(point,'content')??{attrs:{}},'src')),
  }));
  const navs=[...elements(doc,'nav')],toc=navs.find(nav=>/(?:^|\s)toc(?:\s|$)/.test(attr(nav,'type')??''))??navs[0];
  return toc?[...elements(toc,'a')].map(a=>({title:space(textContent(a)),target:resolveHref(path,attr(a,'href'))})):[];
}

export async function readEpub(bytes) {
  const archive=openArchive(bytes);
  await rejectEncryption(archive);
  if(!archive.has('META-INF/container.xml'))throw new Error('EPUB 缺少 META-INF/container.xml。');
  const container=parseMarkup(decodeDocument(await archive.read('META-INF/container.xml')));
  const opfPath=attr(first(container,'rootfile')??{attrs:{}},'full-path');
  if(!opfPath||!archive.has(opfPath))throw new Error('EPUB 缺少内容清单（OPF）。');
  const opf=parseMarkup(decodeDocument(await archive.read(opfPath)));
  const items=new Map();
  for(const item of elements(first(opf,'manifest')??opf,'item')) {
    const target=resolveHref(opfPath,attr(item,'href'));
    if(target)items.set(attr(item,'id'),{path:target.path,type:attr(item,'media-type')??'',properties:attr(item,'properties')??''});
  }
  const spineNode=first(opf,'spine');
  if(!spineNode)throw new Error('EPUB 缺少阅读顺序（spine）。');
  const nav=[...items.values()].find(item=>/(?:^|\s)nav(?:\s|$)/.test(item.properties));
  const ncx=items.get(attr(spineNode,'toc'))??[...items.values()].find(item=>item.type==='application/x-dtbncx+xml');
  const images=new Set([...items.values()].filter(item=>IMAGE.test(item.type)&&archive.has(item.path)).map(item=>item.path));
  const state={lines:[],anchors:new Map(),positions:[],images,textLines:new Map()};
  for(const ref of elements(spineNode,'itemref')) {
    const item=items.get(attr(ref,'idref'));
    // The EPUB 3 navigation document is the table of contents, not book text.
    if(!item||item===nav||!/x?html/.test(item.type)||!archive.has(item.path))continue;
    extract(parseMarkup(decodeDocument(await archive.read(item.path))),item.path,state);
  }
  if(!state.lines.length)throw new Error('EPUB 中没有可读取的正文文字。');
  const tocSource=nav?{item:nav,kind:'nav'}:ncx&&archive.has(ncx.path)?{item:ncx,kind:'ncx'}:null;
  const entries=tocSource?tocEntries(parseMarkup(decodeDocument(await archive.read(tocSource.item.path))),tocSource.item.path,tocSource.kind):[];
  const chapters=[],captions=new Map();let pending=null;
  for(const {title,target} of entries) {
    if(!title||!target)continue;
    let line=state.anchors.get(target.fragment?`${target.path}#${target.fragment}`:target.path)??state.anchors.get(target.path);
    // A page without text (a map, a plate) names its image instead of starting a chapter;
    // unlisted text after it joins the next chapter.
    if(state.textLines.get(target.path)===0) {
      if(!captions.has(target.path))captions.set(target.path,title.slice(0,100));
      if(line!==undefined)pending??=line;
      continue;
    }
    if(line===undefined||line>=state.lines.length)continue;
    const last=chapters.at(-1),anchor=line;
    // Nested entries at the same place keep the innermost title.
    if(last&&last.anchor===anchor){last.title=title.slice(0,300);continue;}
    if(pending!==null&&pending<line)line=pending;
    pending=null;
    if(!last||line>last.line)chapters.push({line,anchor,title:title.slice(0,300)});
  }
  for(const chapter of chapters)delete chapter.anchor;
  if(chapters.length&&chapters[0].line>0)chapters.unshift({line:0,title:'卷首'});
  const coverItem=[...items.values()].find(item=>/(?:^|\s)cover-image(?:\s|$)/.test(item.properties))
    ??items.get(attr([...elements(opf,'meta')].find(meta=>attr(meta,'name')==='cover')??{attrs:{}},'content'));
  return {
    title:space(textContent(first(first(opf,'metadata')??opf,'title')??{children:[]})).slice(0,300),
    // Every dc:creator, in order (EPUB 2 role attributes and EPUB 3 refinements are not distinguished).
    author:[...elements(first(opf,'metadata')??opf,'creator')].map(node=>space(textContent(node))).filter(Boolean).join('、').slice(0,300),
    text:state.lines.join('\n'),chapters,
    images:state.positions.map(({path,file,after})=>({path,after,...(captions.has(file)?{caption:captions.get(file)}:{})})),
    cover:coverItem&&images.has(coverItem.path)?coverItem.path:null,read:archive.read,
  };
}

// Line N of the EPUB text is source paragraph N in line mode.
export function epubChapterTable(map,epub) {
  return epub.chapters.map((chapter,i)=>`${map.paragraphs[chapter.line].id} ch${String(i+1).padStart(2,'0')} ${chapter.title}`).join('\n');
}
