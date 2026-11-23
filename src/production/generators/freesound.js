// @ts-check
import {LICENSES,licenseLabel} from '../sound-services.js';

/* Freesound for sound effects (docs/dev/audio.md): text search with the user's API token, filtered by licence and
 * length; a chosen sound is taken from its high-quality MP3 preview, which needs no OAuth. VNIFY_FREESOUND_API points
 * elsewhere for tests. */
const api=()=>process.env.VNIFY_FREESOUND_API||'https://freesound.org/apiv2';
const PREVIEW_HOSTS=/^https:\/\/(cdn\.)?freesound\.org\//;

/** @typedef {{id:number,name:string,author:string,license:string,duration:number,url:string,preview:string,tags?:string[]}} FreesoundHit */

/**
 * Sounds for a query, at most `limit`, in the chosen licences and no longer than maxDuration seconds.
 * `music` keeps to the Music category and to pieces at least 20 seconds long.
 * @param {string} token @param {{query:string,licenses:string[],maxDuration?:number,limit?:number,music?:boolean}} search
 * @returns {Promise<FreesoundHit[]>}
 */
export async function search(token,{query,licenses,maxDuration=60,limit=15,music=false}) {
  if(!token)throw Object.assign(new Error('还没有填写 Freesound 的 API token。'),{status:400});
  const names=licenses.map(code=>`"${LICENSES[code].name}"`).join(' OR ');
  const filter=`license:(${names}) duration:[${music?20:0} TO ${maxDuration}]${music?' category:Music':''}`;
  const params=new URLSearchParams({query,filter,
    fields:'id,name,username,license,duration,previews,url,tags',page_size:String(limit),token});
  let response;
  try {response=await fetch(`${api()}/search/text/?${params}`);}
  catch {throw Object.assign(new Error('无法连接 Freesound。'),{status:502});}
  if(!response.ok) {
    let message='';try{message=(await response.json()).detail??'';}catch{}
    throw Object.assign(new Error(`Freesound：${message||`HTTP ${response.status}`}`),{status:response.status===401?400:502});
  }
  const body=await response.json();
  return (Array.isArray(body?.results)?body.results:[]).filter((/** @type {any} */ r)=>typeof r?.previews?.['preview-hq-mp3']==='string').map((/** @type {any} */ r)=>{
    const tags=Array.isArray(r.tags)?r.tags.filter((/** @type {any} */ t)=>typeof t==='string'&&t.trim()).map((/** @type {string} */ t)=>t.trim()):[];
    return {
      id:Number(r.id),name:String(r.name??''),author:String(r.username??''),license:licenseLabel(r.license),
      duration:Number(r.duration)||0,url:String(r.url??''),preview:r.previews['preview-hq-mp3'],...(tags.length?{tags}:{}),
    };
  });
}

/** A preview's MP3 bytes; only Freesound's own addresses are fetched. @param {string} url */
export async function downloadPreview(url) {
  if(!PREVIEW_HOSTS.test(url)&&!(process.env.VNIFY_FREESOUND_API&&url.startsWith(process.env.VNIFY_FREESOUND_API)))
    throw Object.assign(new Error('只能下载 Freesound 的音频。'),{status:400});
  let response;
  try {response=await fetch(url);} catch {throw Object.assign(new Error('无法下载 Freesound 音频。'),{status:502});}
  if(!response.ok)throw Object.assign(new Error(`下载 Freesound 音频失败：HTTP ${response.status}`),{status:502});
  return new Uint8Array(await response.arrayBuffer());
}
