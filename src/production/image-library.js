// @ts-check
import {getSecret} from './secrets.js';
import {IMAGE_SEARCH_SOURCES,imageCredit} from './image-search.js';
import {searchPexels,searchPixabay,downloadHit} from './generators/photo-libraries.js';
import {bindImage} from './director-edits.js';

/* Searching photo libraries for a work's backgrounds and binding a chosen picture (docs/dev/image-search.md), for the
 * asset manager and scripts/draw-images.mjs. A library without a key is skipped with a note; one that fails adds a note
 * instead of failing the search. */
const failure=(/** @type {number} */ status,/** @type {string} */ message)=>Object.assign(new Error(message),{status});

/**
 * Hits from the chosen libraries, in that order.
 * @param {string} query @param {{sources?:readonly string[],orientation?:'landscape'|'portrait',limit?:number}} [options]
 */
export async function searchImages(query,{sources=IMAGE_SEARCH_SOURCES,orientation='landscape',limit=24}={}) {
  const words=String(query??'').trim();
  if(!words||words.length>200)throw failure(400,'搜索词须为 1–200 字。');
  const results=[],notes=[];let ready=false;
  for(const source of sources) {
    const key=await getSecret(source);
    if(!key)continue;
    ready=true;
    try {results.push(...await (source==='pexels'?searchPexels:searchPixabay)(key,{query:words,orientation,limit}));}
    catch(/** @type {any} */ error) {notes.push(error.message);}
  }
  if(!ready)notes.push('还没有图库 key：在资产管理器“生成与搜索 → 图片 → 图库搜索”里填写 Pexels 或 Pixabay 的 API key。');
  return {results,notes};
}

/** Downloads a hit and binds it to a picture's target, recording where it came from. @param {string} projectPath @param {any} target @param {any} hit */
export async function bindHit(projectPath,target,hit) {
  if(!IMAGE_SEARCH_SOURCES.includes(hit?.source))throw failure(400,'不支持的图片来源。');
  const bytes=await downloadHit(hit);
  const source=Object.fromEntries(Object.entries({title:hit.name,author:hit.author,url:hit.url,license:hit.license})
    .filter(([,v])=>typeof v==='string'&&v.trim()).map(([k,v])=>[k,String(v).slice(0,500)]));
  return bindImage(projectPath,target,bytes,{mode:'search',generator:imageCredit(hit),source});
}
