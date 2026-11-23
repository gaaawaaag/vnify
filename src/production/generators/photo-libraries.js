// @ts-check
/** @import {ImageHit} from '../image-search.js' */
/* Pexels and Pixabay photo search (docs/dev/image-search.md) with the user's API keys. Results keep a small preview for
 * the page and the address of a large copy to download; only the libraries' own image hosts are downloaded from.
 * VNIFY_PEXELS_API / VNIFY_PIXABAY_API point elsewhere for tests. */
const PEXELS=()=>process.env.VNIFY_PEXELS_API||'https://api.pexels.com';
const PIXABAY=()=>process.env.VNIFY_PIXABAY_API||'https://pixabay.com';
const HOSTS={pexels:/^https:\/\/images\.pexels\.com\//,pixabay:/^https:\/\/(cdn\.)?pixabay\.com\//};
const failure=(/** @type {number} */ status,/** @type {string} */ message)=>Object.assign(new Error(message),{status});

/** @param {string} url @param {RequestInit} init @param {string} name @returns {Promise<any>} */
async function getJson(url,init,name) {
  let response;
  try {response=await fetch(url,init);} catch {throw failure(502,`无法连接 ${name}。`);}
  /** @type {any} */
  let body=null;
  try {body=await response.json();} catch {}
  if(!response.ok)throw failure(response.status===401||response.status===403?400:502,`${name}：${body?.error??body?.message??`HTTP ${response.status}`}`);
  return body;
}

/**
 * Pexels photos for a query in the book's orientation. The download is the original scaled to 2400 pixels on its long side.
 * @param {string} key @param {{query:string,orientation:'landscape'|'portrait',limit?:number}} search @returns {Promise<ImageHit[]>}
 */
export async function searchPexels(key,{query,orientation,limit=24}) {
  if(!key)throw failure(400,'还没有填写 Pexels 的 API key。');
  const params=new URLSearchParams({query,orientation,per_page:String(limit)});
  const body=await getJson(`${PEXELS()}/v1/search?${params}`,{headers:{Authorization:key}},'Pexels');
  return (Array.isArray(body?.photos)?body.photos:[]).filter((/** @type {any} */ p)=>typeof p?.src?.original==='string').map((/** @type {any} */ p)=>({
    source:'pexels',key:`pexels:${p.id}`,id:String(p.id),name:String(p.alt||p.id),author:String(p.photographer??''),license:'Pexels License',
    url:String(p.url??''),width:Number(p.width)||0,height:Number(p.height)||0,thumb:String(p.src.medium??p.src.small??p.src.original),
    download:`${p.src.original}?auto=compress&cs=tinysrgb&${orientation==='portrait'?'h':'w'}=2400`,
  }));
}

/**
 * Pixabay photos and illustrations for a query in the book's orientation; the download is its large copy (1280 pixels).
 * @param {string} key @param {{query:string,orientation:'landscape'|'portrait',limit?:number}} search @returns {Promise<ImageHit[]>}
 */
export async function searchPixabay(key,{query,orientation,limit=24}) {
  if(!key)throw failure(400,'还没有填写 Pixabay 的 API key。');
  const params=new URLSearchParams({key,q:query.slice(0,100),image_type:'all',orientation:orientation==='portrait'?'vertical':'horizontal',
    per_page:String(Math.max(3,limit)),safesearch:'true'});
  const body=await getJson(`${PIXABAY()}/api/?${params}`,{},'Pixabay');
  return (Array.isArray(body?.hits)?body.hits:[]).filter((/** @type {any} */ h)=>typeof h?.largeImageURL==='string').map((/** @type {any} */ h)=>({
    source:'pixabay',key:`pixabay:${h.id}`,id:String(h.id),name:String(h.tags||h.id),author:String(h.user??''),license:'Pixabay Content License',
    url:String(h.pageURL??''),width:Number(h.imageWidth)||0,height:Number(h.imageHeight)||0,thumb:String(h.webformatURL??h.previewURL??h.largeImageURL),
    download:String(h.largeImageURL),
  }));
}

/** A hit's image bytes, only from its library's own hosts. @param {{source:string,download:string}} hit */
export async function downloadHit(hit) {
  const host=HOSTS[/** @type {'pexels'|'pixabay'} */(hit?.source)],url=String(hit?.download??'');
  const test=process.env.VNIFY_PEXELS_API&&url.startsWith(process.env.VNIFY_PEXELS_API)||process.env.VNIFY_PIXABAY_API&&url.startsWith(process.env.VNIFY_PIXABAY_API);
  if(!host||!host.test(url)&&!test)throw failure(400,'只能下载图库自己的图片。');
  let response;
  try {response=await fetch(url);} catch {throw failure(502,'无法下载图片。');}
  if(!response.ok)throw failure(502,`下载图片失败：HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
