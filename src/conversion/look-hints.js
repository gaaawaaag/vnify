// @ts-check
import {splitUnits} from './shorthand.js';
import {quoteRun,checkLookProfiles} from './looks.js';

/* Reminders for whoever registers a book, read against the numbered source. None of them is an error: a quote that is
 * not in its source, sentences with appearance words that no quote covers, and first-seen sources that name the entity
 * by none of its registered names. The registrar looks at each and decides. */

const WORDS={
  // Chinese in either script.
  zh:new RegExp(['[头頭][发髮]','[发髮]色','[黑金银銀白灰红紅棕褐栗蓝藍紫粉][发髮]','[长長][发髮]','短[发髮]','[卷捲][发髮]','[秃禿]','[刘劉]海','[辫辮]',
    '[胡鬍]子','[胡鬍][须鬚]','[络絡]腮','髭','眼眸','瞳','[黑蓝藍绿綠碧灰褐棕红紅金]色?的?眼','眼[镜鏡]','眼罩','[伤傷]疤','疤痕','雀斑',
    '[肤膚]色','皮[肤膚]','身材','身高','[个個]子','高大','矮小','瘦削','魁梧','肥胖','[一二三四五六七八九十两兩\\d]+[岁歲]','年近','年逾','年[约約]',
    '身穿','身[着著]','穿[着著]','戴[着著]','[系繫][着著]','披[着著]'].join('|')),
  ja:new RegExp(['髪','赤毛','禿','坊主頭','おさげ','三つ編','[髭鬚髯]','ひげ','瞳','眼鏡','めがね','眼帯','傷[痕跡]','そばかす','雀斑','肌','色白',
    '背丈','身長','背[がの]','[痩瘦]せ','やせ[たて]','太っ[たて]','肥[っえ]','小柄','大柄','[一二三四五六七八九十\\d０-９]+歳','年の頃','年[恰格]好',
    '着[てた]','纏[っい]','まとっ','羽織','[被か]ぶっ[たて]','穿い'].join('|')),
  en:new RegExp(String.raw`\b(?:hair(?:ed)?|blonde?|brunette|bald|beard(?:ed)?|moustache|mustache|whiskers|spectacles|eyeglasses|monocle|`
    +String.raw`eye-?patch|scar(?:red)?|freckle[sd]?|complexion|(?:blue|green|gr[ae]y|brown|black|hazel|dark|pale|amber|violet)[ -]eye[sd]?|`
    +String.raw`years old|aged \w+|in (?:his|her|their) (?:teens|twenties|thirties|forties|fifties|sixties|seventies|eighties)|`
    +String.raw`stout|slender|burly|plump|wore|wearing|dressed in|clad in)\b`,'i'),
};
export const CANDIDATE_MAX=200;

/** @param {any} map */
const language=map=>map.lang==='en'?'en':'zh';
// Japanese has its own appearance words; its sentences and quotes compare as Chinese ones do.
/** @param {any} map @returns {'zh'|'en'|'ja'} the word list: Chinese in either script shares one */
const wordLanguage=map=>map.lang==='ja'?'ja':language(map);

// Quotes whose source is missing, or whose source holds nothing like them.
/** @param {any[]} profiles @param {any} map */
export function strayQuotes(profiles,map) {
  const byId=new Map(map.paragraphs.map((/** @type {any} */ p)=>[p.id,p.text])),lang=language(map),stray=[];
  for(const p of profiles)for(const item of p.look??[]) {
    const text=byId.get(item.source);
    if(text===undefined)stray.push({id:p.id,source:item.source,text:item.text,reason:'没有这个来源'});
    else if(!quoteRun(text,item.text,lang))stray.push({id:p.id,source:item.source,text:item.text,reason:'该来源里没有相近的句子'});
  }
  return stray;
}

// Sentences with appearance words that no quote of the same source covers.
/** @param {any[]} profiles @param {any} map */
export function uncoveredCandidates(profiles,map) {
  const lang=language(map),words=WORDS[wordLanguage(map)],quotes=new Map();
  for(const p of profiles)for(const item of p.look??[])quotes.set(item.source,[...(quotes.get(item.source)??[]),item.text]);
  const found=[];
  for(const p of map.paragraphs)for(const unit of splitUnits(p.text,lang)) {
    if(!words.test(unit.text))continue;
    if((quotes.get(p.id)??[]).some((/** @type {string} */ q)=>quoteRun(unit.text,q,lang)))continue;
    found.push({source:p.id,text:unit.text.trim()});
  }
  return found;
}

const cells=(/** @type {string} */ line)=>line.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());

// Rows of the registry's character and location tables whose first-seen source uses none of the entity's names.
/** @param {string} registry @param {any} map */
export function firstSeenHints(registry,map) {
  const byId=new Map(map.paragraphs.map((/** @type {any} */ p)=>[p.id,p.text])),hints=[];
  let section='';
  /** @type {string[]} */
  let header=[];
  for(const line of registry.split(/\r?\n/)) {
    const title=/^##\s+(.+)$/.exec(line.trim());
    if(title){section=title[1].trim();header=[];continue;}
    if(!['人物','地点','Characters','Locations'].includes(section)||!line.trim().startsWith('|'))continue;
    const row=cells(line);
    if(!header.length){header=row;continue;}
    if(row.every(c=>/^:?-+:?$/.test(c)))continue;
    const get=(/** @type {string[]} */ names)=>row[header.findIndex(h=>names.includes(h))]??'';
    const id=row[0],seen=get(['首见','First seen']);
    const listed=[get(['初始称呼','Initial name']),get(['称呼','Names']),...get(['名称','Name']).split('·').slice(-1)]
      .flatMap(v=>v.split(/[、,，]/)).map(v=>v.replace(/[（(][^）)]*[）)]/g,'').trim()).filter(v=>v&&v!=="—"&&v!=="-");
    const names=[...new Set(listed)];
    if(!id||!seen||seen==='—')continue;
    const text=byId.get(seen);
    if(text===undefined)hints.push({id,source:seen,reason:'没有这个来源'});
    else if(names.length&&!names.some(n=>text.toLowerCase().includes(n.toLowerCase())))
      hints.push({id,source:seen,reason:`这个来源里没有出现 ${names.slice(0,4).join('、')} 等称呼`,text:text.slice(0,60)});
  }
  return hints;
}

/** @param {{profiles:any,map:any,registry?:string|null,known?:(id:string)=>boolean}} input */
export function lookHints({profiles,map,registry=null,known=()=>true}) {
  const checked=checkLookProfiles(profiles,known);
  const stray=strayQuotes(checked,map),candidates=uncoveredCandidates(checked,map),firstSeen=registry?firstSeenHints(registry,map):[];
  const lines=['# 登记提醒','','以下都是提醒，不是错误：逐条对照原文看一眼，确有问题再改，没有问题不用处理。',''];
  lines.push(`## 摘录在来源里找不到（${stray.length}）`,'导演阶段会略去这些摘录。核对来源编号，或从原文重新摘。');
  for(const s of stray)lines.push(`- ${s.id} ${s.source}「${s.text}」：${s.reason}`);
  lines.push('',`## 含外观用词、尚未被摘录的句子（${candidates.length}）`,
    '按用词找出，只作补充：会漏掉不含这些词的描写（地点的描写尤其如此），也会列出与外观无关的句子。写的是登记对象的外观就补进摘录，其余略过。');
  for(const c of candidates.slice(0,CANDIDATE_MAX))lines.push(`- ${c.source} ${c.text}`);
  if(candidates.length>CANDIDATE_MAX)lines.push(`（另有 ${candidates.length-CANDIDATE_MAX} 句未列出）`);
  if(registry!==null) {
    lines.push('',`## 首见来源里没有出现登记的称呼（${firstSeen.length}）`,'初登场只有代词或泛称时属正常；编号指错了段落时改正。');
    for(const h of firstSeen)lines.push(`- ${h.id} ${h.source}：${h.reason}${h.text?`｜${h.text}`:''}`);
  }
  return {text:lines.join('\n')+'\n',stray,candidates,firstSeen};
}
