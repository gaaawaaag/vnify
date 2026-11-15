// @ts-check
/** @import {Story} from '../types/story.js' */
/** @import {Extra,ImageMeta,ValidatedExtra} from '../types/assets.js' */
// Extra holds book material kept outside the reading flow: book-external writing shown
// as original text, and the book's own images (illustrations, gallery, cover).
export const EXTRA_VERSION=2;
export const EXTRA_IMAGE_TYPES=['image/png','image/jpeg','image/webp'];
const ITEM_LIMIT=64,TEXT_LIMIT=2*1024*1024,IMAGE_COUNT=4096;
/** @param {unknown} value @returns {value is string} */
const label=value=>typeof value==='string'&&!!value.trim()&&value.length<=100&&!/[\r\n\u0000]/.test(value);
const imageKey=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const sourceId=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]*\d$/.test(value);

/** @template {ImageMeta} [I=ImageMeta] @returns {Extra<I>} */
export const emptyExtra=()=>({version:EXTRA_VERSION,items:[],images:{},illustrations:[],gallery:[],cover:null});
/** @param {Extra<any>|null|undefined} extra */
export const hasExtra=extra=>!!(extra?.items?.length||extra?.gallery?.length||extra?.illustrations?.length||extra?.cover);

// Image metadata only; Blob bytes are checked by whoever stores or packages them.
// Image records are copied whole, so a typed input keeps its image type; an unknown one promises metadata only.
/** @template V @param {V} value @returns {ValidatedExtra<V>} */
export const validateExtra=value=>/** @type {any} */(checkExtra(value));
/** @param {any} value @returns {Extra<any>} */
function checkExtra(value) {
  const invalid=!value||value.version!==EXTRA_VERSION||!Array.isArray(value.items)||value.items.length>ITEM_LIMIT
    ||value.items.some(item=>!item||!label(item.title)||!Array.isArray(item.paragraphs)||!item.paragraphs.length
      ||item.paragraphs.some(p=>typeof p!=='string'||!p.trim()))
    ||!value.images||typeof value.images!=='object'||Array.isArray(value.images)||Object.keys(value.images).length>IMAGE_COUNT
    ||Object.entries(value.images).some(([id,img])=>!imageKey(id)||!img||!EXTRA_IMAGE_TYPES.includes(img.type)
      ||![img.width,img.height].every(n=>Number.isInteger(n)&&n>0&&n<=8192)||typeof img.name!=='string'||img.name.length>255
      ||img.caption!==undefined&&!label(img.caption))
    ||!Array.isArray(value.illustrations)||value.illustrations.length>IMAGE_COUNT
    ||value.illustrations.some(ill=>!ill||!Object.hasOwn(value.images,ill.imageId)||!sourceId(ill.after))
    ||!Array.isArray(value.gallery)||value.gallery.some(id=>!Object.hasOwn(value.images,id))||new Set(value.gallery).size!==value.gallery.length
    ||value.cover!==null&&!Object.hasOwn(value.images,value.cover);
  if(invalid)throw new Error('Extra 内容无效。');
  const items=value.items.map(item=>({title:item.title.trim(),paragraphs:[...item.paragraphs]}));
  if(items.reduce((sum,item)=>sum+item.paragraphs.join('').length,0)>TEXT_LIMIT)throw new Error('Extra 文字须在 2 MB 以内。');
  const used=new Set([...value.illustrations.map(ill=>ill.imageId),...value.gallery,...(value.cover?[value.cover]:[])]);
  const images=Object.fromEntries(Object.entries(value.images).filter(([id])=>used.has(id)).map(([id,img])=>[id,{...img}]));
  return {version:EXTRA_VERSION,items,images,illustrations:value.illustrations.map(ill=>({imageId:ill.imageId,after:ill.after})),
    gallery:[...value.gallery],cover:value.cover};
}

// book: {images:{id:meta}, placements:[{imageId, after: source line or -1}], cover:id|null} from an EPUB.
// An image between two kept paragraphs is an illustration; anything before the text or
// beside excluded material (cover pages, character lists, colophons) goes to the gallery.
// excluded: further source IDs left out of the reading flow (the agent body marks them itself).
/**
 * @param {{paragraphs:{id:string,text:string}[]}} map @param {{start:string,end:string,kind:string,title?:string}[]} [ranges]
 * @param {{images:Record<string,ImageMeta>,placements:{imageId:string,after:number}[],cover:string|null}|null} [book] @param {string[]} [excluded]
 */
export function sourceExtra(map,ranges=[],book=null,excluded=[]) {
  const positions=new Map(map.paragraphs.map((p,i)=>[p.id,i])),removed=new Set(excluded.map(id=>positions.get(id)));
  // Ranges and exclusions name paragraphs of this source map.
  const at=(/** @type {string} */ id)=>/** @type {number} */(positions.get(id));
  for(const range of ranges)for(let i=at(range.start);i<=at(range.end);i++)removed.add(i);
  const items=ranges.filter(r=>r.kind==='external').map((range,i)=>{
    const paragraphs=map.paragraphs.slice(at(range.start),at(range.end)+1).map(p=>p.text.trim()).filter(Boolean);
    const first=paragraphs[0]??'',heading=!/[\r\n]/.test(first)&&first.length<=40?first:'';
    const title=label(range.title)?range.title.trim():heading||`书外内容 ${i+1}`;
    // The heading is already the entry title; do not repeat it as the first line.
    const body=paragraphs.length>1&&paragraphs[0]===title?paragraphs.slice(1):paragraphs;
    return {title,paragraphs:body};
  }).filter(item=>item.paragraphs.length);
  const illustrations=[],gallery=[];
  for(const {imageId,after} of book?.placements??[]) {
    const next=after+1<map.paragraphs.length?after+1:after;
    if(after>=0&&!removed.has(after)&&!removed.has(next))illustrations.push({imageId,after:map.paragraphs[after].id});
    else if(!gallery.includes(imageId))gallery.push(imageId);
  }
  const cover=book?.cover??null;
  if(cover&&!gallery.includes(cover))gallery.unshift(cover);
  else if(cover)gallery.splice(0,0,...gallery.splice(gallery.indexOf(cover),1));
  return validateExtra({version:EXTRA_VERSION,items,images:book?.images??{},illustrations,gallery,cover});
}

// Source IDs end in their paragraph number.
const sourceNumber=(/** @type {string} */ id)=>Number(/** @type {RegExpExecArray} */(/\d+$/.exec(id))[0]);
// An illustration appears from the first unit after its place in the book (the last
// unit at the end of the book) until that unit's block ends; a later one replaces it.
// While later chapters are still pending, an image past the published text waits for them.
/** @param {Story} story @param {Extra<any>|null|undefined} extra @param {boolean} [complete] @returns {{imageId:string,start:number,end:number}[]} */
export function illustrationRanges(story,extra,complete=true) {
  const units=story.units,ranges=[];
  const reach=units.map(u=>u.source.length?Math.max(...u.source.map(sourceNumber)):-1);
  for(const ill of extra?.illustrations??[]) {
    const anchor=sourceNumber(ill.after);
    let start=reach.findIndex(n=>n>anchor);
    if(start<0){if(!complete)continue;start=reach.findLastIndex(n=>n>=0);}
    if(start<0)continue;
    let end=start;
    while(end+1<units.length&&units[end+1].block.id===units[start].block.id)end++;
    ranges.push({imageId:ill.imageId,start,end});
  }
  return ranges.sort((a,b)=>a.start-b.start);
}
/** @param {{imageId:string,start:number,end:number}[]} ranges @param {number} index */
export function activeIllustration(ranges,index) {
  return ranges.findLast(r=>r.start<=index&&index<=r.end)?.imageId??null;
}
