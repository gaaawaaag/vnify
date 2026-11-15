import {zipFiles} from '../core/zip-store.js';
import {parseScript} from '../core/parser.js';
import {readPackage,packageEntries} from '../reader/story-package.js';
import {emptyBackgrounds,IMAGE_TYPES} from '../reader/backgrounds.js';
import {libraryKey} from '../reader/library-client.js';

// Puts books on the shelf from their files: a package archive, an unpacked package folder, or a lone text.
// The files are checked here first, so a broken book fails before anything is uploaded; the shelf checks them again.
const TEXT_FILES=new Set(['manifest.json','story.vn.txt','extra.json']);
const THUMB_WIDTH=640;
export async function thumbnail(blob) {
  const bitmap=await createImageBitmap(blob),scale=Math.min(1,THUMB_WIDTH/bitmap.width);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  return new Promise((resolve,reject)=>canvas.toBlob(out=>out?resolve(out):reject(new Error('封面缩略图生成失败。')),'image/webp',.85));
}

export const filesOfArchive=file=>zipFiles(file);
// A chosen folder lists its files under its own name; system files (.DS_Store, Thumbs.db) are left out.
export function filesOfFolder(list) {
  const files=new Map();
  for(const file of list) {
    const parts=file.webkitRelativePath.split('/').slice(1),last=parts.at(-1);
    if(!parts.length||parts.some(p=>p.startsWith('.'))||['Thumbs.db','desktop.ini'].includes(last))continue;
    files.set(parts.join('/'),file);
  }
  return files;
}
export async function filesOfText(raw) {
  const entries=await packageEntries(raw,emptyBackgrounds(parseScript(raw).book.id));
  return new Map(entries.map(([name,bytes])=>[name,new Blob([bytes])]));
}

// The book the files hold, checked as the shelf will check it.
export async function inspectFiles(files,{strictSources=false}={}) {
  const book=await readPackage({
    text:async(name,limit)=>{const file=files.get(name);return file&&file.size<=limit?file.text():null;},
    image:async path=>{if(!files.has(path))throw new Error('作品包缺少图片。');return {};},
  },{strictSources});
  if([...files.keys()].some(name=>!book.files.has(name)))throw new Error('作品包包含未声明的文件。');
  return book;
}

// The cover thumbnail comes from the title card, else from the original book's cover.
function coverOf(book) {
  const path=(folder,id,img)=>`assets/${folder}/${id}.${IMAGE_TYPES[img.type]}`;
  const card=book.backgrounds.bindings.titleCard,original=book.extra.cover;
  if(card)return {id:`title:${card}`,path:path('backgrounds',card,book.backgrounds.images[card])};
  if(original)return {id:`extra:${original}`,path:path('extra',original,book.extra.images[original])};
  return null;
}
// Uploads the images the shelf lacks (onProgress(done,total)), commits the text files, then sets the cover thumbnail.
export async function uploadBook(client,files,book,{onProgress=()=>{}}={}) {
  const key=libraryKey(book.story.book.id),present=new Set(await client.assets(key));
  const images=[...book.files].filter(name=>!TEXT_FILES.has(name)),missing=images.filter(name=>!present.has(name));
  onProgress(0,missing.length);
  for(const [i,name] of missing.entries()) {await client.putAsset(key,name,files.get(name));onProgress(i+1,missing.length);}
  const text=name=>files.has(name)?files.get(name).text():null;
  const result=await client.commit(key,{manifest:await text('manifest.json'),story:book.raw,extra:await text('extra.json'),assets:images});
  // The book is on the shelf now; a cover that cannot be drawn leaves the shelf card without one.
  const cover=coverOf(book);
  try {await client.saveCover(key,cover?.id??null,cover?await thumbnail(files.get(cover.path)):null);} catch {}
  return {key,...result};
}
