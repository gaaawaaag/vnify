// @ts-check
import {renderPrompt} from '../prompts/library.js';
import {annotationCandidates,annotationPacket} from './annotation-context.js';
import {numberedText} from './workflow.js';
import {splitUnitsEn,stripOuterQuotesEn,speechTagEn,wholeWord} from './sentences-en.js';

/* Shorthand drafts: the tool splits each source paragraph into numbered sentences (5a, 5b …); the writer keeps the
 * script's directives and speaker labels but writes a copied sentence as its number, a changed one as `number: text`
 * and a removed one as `-number`. Expansion yields a normal .vn.txt with @source lines, dialogue quotes removed and
 * declared names linked, plus a review sheet of every rewrite and removal. */

export const SHORTHAND_SUFFIX='.vns.txt';

const OPEN='“「『';
const CLOSE='”」』';
const END='。！？!?…．';
const RUN='。！？!?…．—～~';
const CLOSERS='”」』’）)】》';
const BEFORE_QUOTE='：:，,—…';
const REF_ITEM=String.raw`\d+[a-z]+(?:-(?:\d+)?[a-z]+)?`;
const REFS=new RegExp(String.raw`^(${REF_ITEM}(?:\+${REF_ITEM})*)`);

/** @typedef {{text:string,gap:string}} SplitUnit */
/** @typedef {{key:string,pid:string,pos:number,k:number,text:string,gap:string}} SourceUnit */

/** Bijective base-26 letters: 0→a, 25→z, 26→aa. @param {number} n */
export function unitLetters(n) {
  let s='';
  for(let x=n+1;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(97+(x-1)%26)+s;
  return s;
}

/** Sentence units of one paragraph in the work's language. @param {string} text @param {string} [lang] @returns {SplitUnit[]} */
export const splitUnits=(text,lang='zh')=>lang==='en'?splitUnitsEn(text):splitUnitsZh(text);

/** Sentence units of one Chinese paragraph: split after sentence ends (with trailing closers), after a quote that opens the unit
 * and is followed by narration, and before a quote that follows a colon or comma (the speech tag stands alone).
 * @param {string} text @returns {SplitUnit[]} */
function splitUnitsZh(text) {
  /** @type {SplitUnit[]} */
  const units=[];
  const chars=[...text.replace(/^[\s　]+/,'')];
  let cur='',depth=0;
  const push=()=>{
    const m=/^([\s\S]*?)([\s　]*)$/.exec(cur);
    if(m&&m[1])units.push({text:m[1],gap:m[2]});
    else if(units.length)units[units.length-1].gap+=cur;
    cur='';depth=0;
  };
  // A mark alone in brackets, （？） or （！）, is a comment on the word before it and does not end the sentence.
  const bracketed=(/** @type {number} */ i)=>{
    let a=i,b=i;
    while(a>0&&RUN.includes(chars[a-1]))a--;
    while(b+1<chars.length&&RUN.includes(chars[b+1]))b++;
    return a>0&&b+1<chars.length&&'（(〔['.includes(chars[a-1])&&'）)〕]'.includes(chars[b+1]);
  };
  for(let i=0;i<chars.length;i++) {
    const c=chars[i];
    if(!cur.trim()&&/[\s　]/.test(c)&&units.length){units[units.length-1].gap+=c;continue;}
    if(OPEN.includes(c)&&cur.trim()&&depth===0&&BEFORE_QUOTE.includes(cur.trimEnd().at(-1)??''))push();
    cur+=c;
    if(OPEN.includes(c))depth++;
    else if(CLOSE.includes(c))depth=Math.max(0,depth-1);
    // Punctuation that opens a unit (“……算了”) does not end it.
    if(END.includes(c)&&/[\p{L}\p{N}]/u.test(cur)&&!bracketed(i)) {
      // “？！”“……？” stay together; an ellipsis or dash after a full stop opens the next sentence.
      while(i+1<chars.length&&RUN.includes(chars[i+1])&&!('。．'.includes(cur.at(-1)??'')&&'…—'.includes(chars[i+1])))cur+=chars[++i];
      // A sentence end inside an open quote only ends the unit together with the quote's closing mark, or at a new sentence.
      while(i+1<chars.length&&CLOSERS.includes(chars[i+1])){cur+=chars[++i];if(CLOSE.includes(chars[i]))depth=Math.max(0,depth-1);}
      push();
    } else if(CLOSE.includes(c)&&depth===0&&OPEN.includes(cur.trimStart()[0])&&i+1<chars.length&&!(END+CLOSERS+'，,、：:；;').includes(chars[i+1])) push();
  }
  if(cur)push();
  return units;
}

/** @param {any} map @param {string} id */
export function paragraphLabel(map,id) {
  const digits=String(id).slice(String(map.prefix??'').length);
  if(!/^\d+$/.test(digits))throw new Error(`来源编号 ${id} 不能简写。`);
  return String(Number(digits));
}

/** Numbered units of the whole source map, keyed `5a`. @param {any} map */
export function sourceUnits(map) {
  /** @type {Map<string,SourceUnit>} */
  const units=new Map();
  /** @type {Map<string,{pid:string,pos:number,keys:string[]}>} */
  const paragraphs=new Map();
  map.paragraphs.forEach((p,pos)=>{
    const label=paragraphLabel(map,p.id),keys=[];
    splitUnits(p.text,map.lang).forEach((u,k)=>{
      const key=label+unitLetters(k);
      units.set(key,{key,pid:p.id,pos,k,...u});
      keys.push(key);
    });
    paragraphs.set(label,{pid:p.id,pos,keys});
  });
  return {units,paragraphs};
}

/** The batch source with every unit numbered; read-only context and outside notes as in the normal request.
 * @param {any} map @param {string} from @param {string} to */
export function unitsView(map,from,to) {
  const a=map.paragraphs.findIndex(p=>p.id===from),b=map.paragraphs.findIndex(p=>p.id===to);
  if(a<0||b<a)throw new Error(`来源范围无效：${from}—${to}`);
  const batch=map.paragraphs.slice(a,b+1),label=id=>paragraphLabel(map,id);
  const source=batch.map(p=>[`[${p.id}]`,...splitUnits(p.text,map.lang).map((u,k)=>`${label(p.id)}${unitLetters(k)} ${u.text}`)].join('\n')).join('\n\n');
  const context=map.paragraphs.slice(Math.max(0,a-2),a);
  return renderPrompt('source.request',{context:numberedText(context)||'无',firstSource:from,lastSource:to,sourceCount:batch.length,source},map.lang)
    +annotationPacket(annotationCandidates(map),batch);
}

/** Remove the quote marks that wrap a dialogue unit; inner quotes stay. @param {string} s @param {string} [lang] */
export const stripOuterQuotes=(s,lang='zh')=>lang==='en'?stripOuterQuotesEn(s):stripOuterQuotesZh(s);

/** @param {string} s */
function stripOuterQuotesZh(s) {
  const chars=[...s];
  let start=0,end=chars.length;
  if(OPEN.includes(chars[0])) {
    let depth=0,match=-1;
    for(let i=0;i<chars.length;i++) {
      if(OPEN.includes(chars[i]))depth++;
      else if(CLOSE.includes(chars[i])&&--depth===0){match=i;break;}
    }
    if(match===-1||match===chars.length-1)start=1;
    if(match===chars.length-1)end=chars.length-1;
  } else if(chars[0]==='"'&&chars.at(-1)==='"'&&chars.length>1){start=1;end=chars.length-1;}
  if(end===chars.length&&CLOSE.includes(chars.at(-1)??'')) {
    let depth=0;
    for(let i=start;i<chars.length;i++){if(OPEN.includes(chars[i]))depth++;else if(CLOSE.includes(chars[i]))depth--;}
    if(depth<0)end=chars.length-1;
  }
  return chars.slice(start,end).join('');
}

/** @param {string} text @param {{label:string,id:string}[]} aliases @param {string} lang */
function linkAliases(text,aliases,lang) {
  if(!aliases.length)return text;
  let out='';
  for(let i=0;i<text.length;) {
    const hit=aliases.find(a=>text.startsWith(a.label,i)&&(lang!=='en'||wholeWord(text,i,a.label.length)));
    if(hit){out+=`{{${hit.id}|${hit.label}}}`;i+=hit.label.length;}
    else out+=text[i++];
  }
  return out;
}

const latin=c=>/[A-Za-z0-9.,;:!?'"’)]/.test(c??'');
/** @param {SourceUnit[]} list @param {boolean} dialogue @param {string} lang */
function joinUnits(list,dialogue,lang) {
  let out='';
  list.forEach((u,i)=>{
    const text=dialogue?stripOuterQuotes(u.text,lang):u.text,prev=list[i-1];
    if(prev) {
      const adjacent=prev.pos===u.pos&&prev.k+1===u.k;
      if((adjacent&&prev.gap)||(!adjacent&&latin(out.at(-1))&&latin(text[0])))out+=' ';
    }
    out+=text;
  });
  return out;
}

/** The body text a copied line expands to. @param {SourceUnit[]} list @param {boolean} tagged @param {{label:string,id:string}[]} aliases @param {string} [lang] */
export const copiedText=(list,tagged,aliases,lang='zh')=>copiedBody(joinUnits(list,tagged,lang),aliases,tagged,lang);

/** Plain reading text of a written line, for the review diff. @param {string} s */
const plainText=s=>s.replace(/\\\{\{/g,'{{').replace(/\{\{(?:note:[^|}]+|[^|}]+)\|([^|}]+)(?:\|[^}]*)?\}\}/g,'$1').replace(/^\\/,'');
// Chinese compares characters without spaces; English compares words, spaces and punctuation marks.
const comparable=(s,lang)=>lang==='en'?s.replace(/\s+/g,' ').trim().match(/ |[\p{L}\p{N}’'-]+|./gu)??[]:[...s.replace(/[\s　]/g,'')];

/** Removed and added runs between an original and its rewrite (LCS over characters, or words in English). @param {string} a @param {string} b @param {string} [lang] */
export function textDiff(a,b,lang='zh') {
  const x=comparable(a,lang),y=comparable(b,lang);
  if(x.length*y.length>4e6)return {removed:[a],added:[b]};
  const w=y.length+1,dp=new Uint16Array((x.length+1)*w);
  for(let i=x.length-1;i>=0;i--)for(let j=y.length-1;j>=0;j--)
    dp[i*w+j]=x[i]===y[j]?dp[(i+1)*w+j+1]+1:Math.max(dp[(i+1)*w+j],dp[i*w+j+1]);
  /** @type {string[]} */
  const removed=[],added=[];
  let i=0,j=0,r='',d='';
  const flush=()=>{if(r)removed.push(r);if(d)added.push(d);r='';d='';};
  while(i<x.length||j<y.length) {
    if(i<x.length&&j<y.length&&x[i]===y[j]){flush();i++;j++;}
    else if(j<y.length&&(i===x.length||dp[i*w+j+1]>=dp[(i+1)*w+j]))d+=y[j++];
    else r+=x[i++];
  }
  flush();
  return {removed,added};
}

// Chinese in either script.
const SPEECH_TAG=/(?:[说說]|道|[问問]|答|喊|叫|嚷|嘟囔|低[语語]|[开開]口|回答|[补補]充|插嘴)(?:[着著]|了|道)?[：:，,。]?$/;
/** A short line that only says who spoke. @param {string} body @param {string} lang */
// 「…」と彼は言った。 The tag follows the quote and opens with と.
const SPEECH_TAG_JA=/^と[^「」。]{0,14}(?:言[っいうわ]|云[っいうわ]|いった|いいました|答え|こたえ|訊[いねく]|尋ね|たずね|聞い|叫[んび]|呟|つぶや|囁|ささや|怒鳴|呼[んび])[^「」。]{0,6}[。、]?$/;
const speechTag=(body,lang)=>lang==='en'?speechTagEn(body):body.length<=24&&(lang==='ja'?SPEECH_TAG_JA:SPEECH_TAG).test(body);

/** Copied source text as a body line: literal `{{` escaped, names linked, reserved line starts escaped.
 * @param {string} text @param {{label:string,id:string}[]} aliases @param {boolean} tagged @param {string} lang */
function copiedBody(text,aliases,tagged,lang) {
  const body=linkAliases(text.replace(/\{\{/g,'\\{{'),aliases,lang);
  return !tagged&&/^(?:@|\[|\/\/|\\(?!\{\{))/.test(body)?`\\${body}`:body;
}

/**
 * Expand a shorthand draft into a .vn.txt part.
 * @param {string} text
 * @param {any} map a loaded source map
 * @param {{from?:string,to?:string}} [range] the batch range; given, every unit of a touched paragraph must be accounted for
 */
export function expandShorthand(text,map,range={}) {
  const {units,paragraphs}=sourceUnits(map);
  const lang=map.lang??'zh';
  const positions=new Map(map.paragraphs.map((p,i)=>[p.id,i]));
  const lo=range.from===undefined?0:positions.get(range.from),hi=range.to===undefined?map.paragraphs.length-1:positions.get(range.to);
  if(lo===undefined||hi===undefined||lo>hi)throw new Error(`来源范围无效：${range.from}—${range.to}`);
  /** @type {string[]} */
  const out=[];
  /** @type {string[]} */
  const errors=[];
  const rewrites=[],drops=[],warnings=[];
  /** @type {Map<string,{line:number,copied:boolean}>} */
  const used=new Map();
  const touched=new Set(),literal=new Set();
  /** @type {{label:string,id:string}[]} */
  let aliases=[];
  /** @type {{kind:string,sources:string|null,insertAt:number,explicit:boolean,textDone:boolean}|null} */
  let block=null;
  let inDoc=false;
  const fail=(n,message)=>errors.push(`第 ${n} 行：${message}`);
  /** Sources in // @source-use, @vn-transition and @vn-note may be written as paragraph labels (1595 for p001595).
   * @param {string} raw */
  const fullSourceIds=raw=>{
    const id=label=>paragraphs.get(label)?.pid??label;
    const trimmed=raw.trim();
    if(/^\/\/\s*@source-use\s/.test(trimmed))return raw.replace(/(@source-use\s+)(\d+)(?=\s|$)/,(m,head,label)=>head+id(label));
    if(/^\/\/\s*@vn-transition\s/.test(trimmed))
      return raw.replace(/source=([^\s]+)/,(m,list)=>`source=${list.split(',').map(s=>/^\d+$/.test(s)?id(s):s).join(',')}`);
    if(/^\/\/\s*@vn-note\s/.test(trimmed))
      return raw.replace(/("source"\s*:\s*\[)([^\]]*)\]/,(m,head,list)=>head+list.replace(/"(\d+)"/g,(q,label)=>JSON.stringify(id(label)))+']');
    return raw;
  };

  /** A copied or removed sentence is used once; rewritten lines may also name a sentence another line uses, e.g. when
   * one sentence becomes several lines. Rewrites are listed in the review sheet either way.
   * @param {string} spec @param {number} n @param {boolean} copied */
  const resolve=(spec,n,copied)=>{
    /** @type {SourceUnit[]} */
    const list=[];
    for(const item of spec.split('+')) {
      const m=/^(\d+)([a-z]+)(?:-(\d+)?([a-z]+))?$/.exec(item);
      if(!m){fail(n,`编号 ${item} 写法不对`);continue;}
      const first=units.get(m[1]+m[2]);
      if(!first){fail(n,`没有句子 ${m[1]+m[2]}`);continue;}
      if(!m[4]){list.push(first);continue;}
      const last=units.get((m[3]??m[1])+m[4]);
      if(!last||last.pos<first.pos||(last.pos===first.pos&&last.k<first.k)){fail(n,`句子范围 ${item} 无效`);continue;}
      for(let pos=first.pos;pos<=last.pos;pos++) {
        const keys=paragraphs.get(paragraphLabel(map,map.paragraphs[pos].id))?.keys??[];
        for(const key of keys) {
          const u=/** @type {SourceUnit} */(units.get(key));
          if((pos===first.pos&&u.k<first.k)||(pos===last.pos&&u.k>last.k))continue;
          list.push(u);
        }
      }
    }
    for(const u of list) {
      const prior=used.get(u.key);
      if(u.pos<lo||u.pos>hi)fail(n,`句子 ${u.key} 不在本批范围内`);
      else if(prior&&copied&&prior.copied)fail(n,`句子 ${u.key} 已在第 ${prior.line} 行用过`);
      else if(!prior||copied)used.set(u.key,{line:n,copied});
      touched.add(u.pid);
    }
    return list;
  };

  /** A body line, with @source written before it when its sources differ from the line above.
   * @param {SourceUnit[]} list @param {string} tag @param {string} body */
  const pushLine=(list,tag,body)=>{
    if(!block)return;
    const sources=[...new Set(list.map(u=>u.pid))].sort((a,b)=>(positions.get(a)??0)-(positions.get(b)??0)).join(',');
    if(sources&&sources!==block.sources){out.splice(block.insertAt,0,`@source ${sources}`);block.sources=sources;}
    out.push(tag?`${tag} ${body}`:body);
    block.insertAt=out.length;
  };
  /** The sentences of one paragraph, all marked as copied. A unit the splitter cut off at a colon or comma (a speech tag
   * before its quote) stays with what follows, so each line is a sentence of the original. @param {number} pos @param {number} n */
  const paragraphSentences=(pos,n)=>{
    const keys=paragraphs.get(paragraphLabel(map,map.paragraphs[pos].id))?.keys??[];
    if(!keys.length)return [];
    const list=resolve(keys.length>1?`${keys[0]}-${keys.at(-1)}`:keys[0],n,true);
    /** @type {SourceUnit[][]} */
    const sentences=[];
    let open=false;
    for(const u of list) {
      if(open)sentences[sentences.length-1].push(u);
      else sentences.push([u]);
      open=/[：:，,；;]$/.test(u.text.trimEnd());
    }
    return sentences;
  };

  const lines=text.replace(/\r\n?/g,'\n').split('\n');
  lines.forEach((raw,i)=>{
    const n=i+1,line=raw.trim();
    if(inDoc){out.push(raw);if(line==='@enddocument'){inDoc=false;if(block)block.textDone=true;}return;}
    if(!line){out.push(raw);return;}
    if(line.startsWith('@alias')) {
      const m=/^@alias\s+([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.*)$/.exec(line);
      if(!m){fail(n,'别名写作 @alias 人物ID=称呼1,称呼2');return;}
      const labels=m[2].split(/[,，]/).map(s=>s.trim()).filter(Boolean);
      aliases=aliases.filter(a=>a.id!==m[1]);
      for(const label of labels) {
        const other=aliases.find(a=>a.label===label);
        if(other){fail(n,`称呼「${label}」已是 ${other.id} 的别名`);continue;}
        aliases.push({label,id:m[1]});
      }
      aliases.sort((a,b)=>b.label.length-a.label.length);
      return;
    }
    if(/^@(?:scene|narration|document)\s/.test(line)) {
      out.push(raw);
      block={kind:line.slice(1).split(/\s/)[0],sources:null,insertAt:out.length,explicit:false,textDone:false};
      return;
    }
    if(line.startsWith('@source')) {
      if(block?.kind!=='document'||block.textDone){fail(n,'简写稿不写 @source，来源由句子编号推出（document 的原样全文除外）');return;}
      block.explicit=true;
      for(const id of line.slice(7).split(',').map(s=>s.trim()))literal.add(id);
      out.push(raw);
      return;
    }
    if(line==='@text') {
      if(block?.kind!=='document'||!block.explicit){fail(n,'原样全文的 document 须先写 @source；也可以写 @text 段落编号');return;}
      inDoc=true;out.push(raw);return;
    }
    if(line.startsWith('@text ')) {
      if(block?.kind!=='document'||block.explicit||block.textDone){fail(n,'@text 段落编号只用于 document，且不再另写 @source');return;}
      const ids=[];
      for(const item of line.slice(6).split(/[,，]/).map(s=>s.trim())) {
        const m=/^(\d+)(?:-(\d+))?$/.exec(item);
        const a=m&&paragraphs.get(m[1]),b=m&&paragraphs.get(m[2]??m[1]);
        if(!a||!b||b.pos<a.pos){fail(n,`段落编号 ${item} 无效`);continue;}
        for(let pos=a.pos;pos<=b.pos;pos++) {
          const id=map.paragraphs[pos].id;
          if(pos<lo||pos>hi)fail(n,`段落 ${id} 不在本批范围内`);
          ids.push(id);literal.add(id);
        }
      }
      out.splice(block.insertAt,0,`@source ${ids.join(',')}`);
      const body=ids.map(id=>{
        const t=map.paragraphs[positions.get(id)??0].text.replace(/^[\s　]+|[\s　]+$/g,'');
        return t==='@enddocument'?'\\@enddocument':t;
      });
      out.push('@text',...body,'@enddocument');
      block.textDone=true;
      return;
    }
    if(line.startsWith('@')||line.startsWith('//')) {
      if(/^@(?:chapter|book|vn)\b/.test(line))block=null;
      out.push(line.startsWith('//')?fullSourceIds(raw):raw);
      return;
    }
    // A paragraph range copies those paragraphs whole, each original sentence on its own narration line.
    const range=/^(\d+)(?:-(\d+))?$/.exec(line);
    if(range) {
      if(!block||block.kind==='document'){fail(n,'正文行须写在 @scene 或 @narration 之后');return;}
      const a=paragraphs.get(range[1]),b=paragraphs.get(range[2]??range[1]);
      if(!a||!b||b.pos<a.pos){fail(n,`段落编号 ${line} 无效`);return;}
      for(let pos=a.pos;pos<=b.pos;pos++)for(const list of paragraphSentences(pos,n)) {
        const body=copiedBody(joinUnits(list,false,lang),aliases,false,lang);
        if(/[：:，,；;]$/.test(body))warnings.push({line:n,refs:list[0].key,message:'行末不是句末标点',text:body});
        pushLine(list,'',body);
      }
      return;
    }
    // Body lines: [tag] refs | [tag] refs: text | -refs
    const tagMatch=/^(\[[^\[\]]+\])\s*/.exec(line);
    const tag=tagMatch?tagMatch[1]:'';
    let rest=tagMatch?line.slice(tagMatch[0].length):line;
    const drop=!tag&&rest.startsWith('-');
    if(drop)rest=rest.slice(1);
    const refMatch=REFS.exec(rest);
    if(!refMatch){fail(n,'正文行须以句子编号开头：照抄写编号，改写写「编号: 全文」，删去写「-编号」');return;}
    const after=rest.slice(refMatch[1].length);
    const list=resolve(refMatch[1],n,drop||!after.trim());
    if(drop) {
      if(after&&!/^\s/.test(after)){fail(n,'删去行写作 -编号，后面可空一格写备注');return;}
      drops.push({line:n,refs:refMatch[1],text:list.map(u=>u.text).join('')});
      return;
    }
    if(!block||block.kind==='document'){fail(n,'正文行须写在 @scene 或 @narration 之后');return;}
    let body;
    if(!after.trim()) {
      body=copiedBody(joinUnits(list,Boolean(tag),lang),aliases,Boolean(tag),lang);
      if(/[：:，,；;]$/.test(body))warnings.push({line:n,refs:refMatch[1],message:'行末不是句末标点',text:body});
      else if(!tag&&speechTag(body,lang))warnings.push({line:n,refs:refMatch[1],message:'疑似说话提示',text:body});
    } else {
      const m=/^\s*[:：]\s?(.*)$/.exec(after);
      if(!m||!m[1].trim()){fail(n,'改写行写作「编号: 全文」');return;}
      body=m[1];
      const original=joinUnits(list,Boolean(tag),lang);
      const diff=textDiff(original,plainText(body),lang);
      if(diff.removed.length||diff.added.length)rewrites.push({line:n,refs:refMatch[1],original,text:body,...diff});
    }
    pushLine(list,tag,body);
  });

  // Every sentence of a paragraph the draft uses is copied, rewritten or removed.
  for(const pid of touched) {
    if(literal.has(pid))continue;
    const pos=positions.get(pid)??0;
    const missing=(paragraphs.get(paragraphLabel(map,pid))?.keys??[]).filter(k=>!used.has(k));
    if(pos>=lo&&pos<=hi&&missing.length)errors.push(`未处理的句子：${missing.map(k=>`${k}「${units.get(k)?.text}」`).join('；')}`);
  }
  if(errors.length)throw new Error(`简写稿有 ${errors.length} 处问题：\n${errors.slice(0,60).join('\n')}${errors.length>60?'\n……':''}`);
  return {script:out.join('\n'),review:{rewrites,drops,warnings}};
}

/** Text review sheet: only rewrites, removals and warnings need reading against the original. @param {any} review */
export function renderReview(review) {
  const lines=[];
  if(review.rewrites.length) {
    lines.push(`# 改写（${review.rewrites.length}）`);
    for(const r of review.rewrites) {
      const notes=[...r.removed.map(s=>`删「${s}」`),...r.added.map(s=>`增「${s}」`)].join(' ');
      lines.push(`${r.line}\t${r.refs}\t${notes}`,`\t原：${r.original}`,`\t改：${r.text}`);
    }
  }
  if(review.drops.length) {
    lines.push('',`# 删去（${review.drops.length}）`);
    for(const d of review.drops)lines.push(`${d.line}\t${d.refs}\t${d.text}`);
  }
  if(review.warnings.length) {
    lines.push('',`# 提示（${review.warnings.length}）`);
    for(const w of review.warnings)lines.push(`${w.line}\t${w.refs}\t${w.message}\t${w.text}`);
  }
  return lines.length?lines.join('\n')+'\n':'（无改写、删去或提示）\n';
}
