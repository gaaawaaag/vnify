import {packageEntries} from './story-package.js';

// Talks to the bookshelf behind /api/library (the local service today; any host serving the same routes later).
const decoder=new TextDecoder();
const TEXT_FILES=new Set(['manifest.json','story.vn.txt','extra.json']);
export const libraryKey=bookId=>String(bookId).toLowerCase();

export function createLibraryClient({request=globalThis.fetch.bind(globalThis),base='/api/library'}={}) {
  async function call(path,options={},parse='json') {
    let response;
    try {response=await request(base+path,options);}
    catch {throw new Error('无法连接书架服务。');}
    if(!response.ok) {
      // A reverse proxy answers some failures itself (HTML, no JSON message), e.g. 413 for an upload over its limit.
      let message='';try{message=(await response.json()).error;}catch{}
      const fallback=response.status===413?'上传内容超过服务器限制（HTTP 413）。':`书架存储不可用（HTTP ${response.status}）。`;
      throw Object.assign(new Error(message||fallback),{status:response.status});
    }
    return parse==='json'?response.json():parse==='text'?response.text():parse==='response'?response:response.blob();
  }
  const json=(method,value)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  const at=key=>`/${encodeURIComponent(key)}`;
  return {
    list:async()=>(await call('')).books,
    story:key=>call(`${at(key)}/story`,{},'text'),
    // One text file of a book's package; null when the book has no such file.
    // With a version (meta.updatedAt), the shelf refuses with 409 once another import replaced that version.
    file:async(key,name,version)=>{
      try {return await call(`${at(key)}/file/${name}${version!==undefined?`?v=${encodeURIComponent(version)}`:''}`,{},'text');}
      catch(error) {if(error.status===404)return null;throw error;}
    },
    // Where a file of a book is served; images there are cached for good.
    fileURL:(key,name)=>`${base}${at(key)}/file/${name}`,
    progress:async key=>(await call(`${at(key)}/progress`)).progress,
    // The reading position together with the version of the book on the shelf.
    opening:async key=>{const {progress,updatedAt}=await call(`${at(key)}/progress`);return {progress,updatedAt};},
    // The book as a .vn.zip, for exporting it.
    packageURL:key=>`${base}${at(key)}/package`,
    // Uploads only the images the book's folder lacks, then replaces its text files in one commit.
    // onProgress(done,total) follows the image uploads.
    async saveBook({raw,backgrounds,characterImages,extra,complete,title,author,bookId},{onProgress=()=>{}}={}) {
      const key=libraryKey(bookId);
      const entries=await packageEntries(raw,backgrounds,{complete,characterImages,extra});
      const present=new Set((await call(`${at(key)}/assets`)).assets);
      const files=Object.fromEntries(entries.filter(([name])=>TEXT_FILES.has(name)).map(([name,bytes])=>[name,decoder.decode(bytes)]));
      const assets=entries.filter(([name])=>!TEXT_FILES.has(name)),missing=assets.filter(([name])=>!present.has(name));
      if(missing.length)onProgress(0,missing.length);
      for(const [index,[name,bytes]] of missing.entries()) {
        await call(`${at(key)}/asset/${name}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:bytes});
        onProgress(index+1,missing.length);
      }
      return call(`${at(key)}/commit`,json('POST',{
        manifest:files['manifest.json'],story:files['story.vn.txt'],extra:files['extra.json']??null,assets:assets.map(([name])=>name),
        meta:{bookId,title,author:author??null,complete},
      }));
    },
    // Image paths the book's folder already holds; a new import uploads only the others.
    assets:async key=>(await call(`${at(key)}/assets`)).assets,
    putAsset:(key,name,blob)=>call(`${at(key)}/asset/${name}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:blob}),
    // The package's text files; the shelf checks the whole book before it replaces anything.
    commit:(key,{manifest,story,extra,assets})=>call(`${at(key)}/commit`,json('POST',{manifest,story,extra,assets})),
    // keepalive lets the last save finish while the page is being hidden or closed (phones).
    saveProgress:(key,record)=>call(`${at(key)}/progress`,{...json('PUT',record),keepalive:true}),
    // The book's reading over every device ({finishedAt,startedAt,active,days,rating,review}), for its end card.
    record:key=>call(`${at(key)}/record`),
    // This device's rating (1–5 or null) and review; answers with the book's record.
    saveReview:(key,device,{rating,review})=>call(`${at(key)}/review`,{...json('PUT',{device,rating,review}),keepalive:true}),
    // Adds or updates one reading session of this device (src/reader/reading-time.js).
    saveSession:(key,device,session)=>call(`${at(key)}/session`,{...json('PUT',{device,session}),keepalive:true}),
    // The home page background choice ({background:{kind,dim,custom}}), kept on the shelf for every device.
    home:()=>call('/_home'),
    saveHome:value=>call('/_home',json('PUT',value)),
    saveHomeBackground:blob=>call('/_home/background',{method:'PUT',headers:{'Content-Type':blob.type||'application/octet-stream'},body:blob}),
    homeBackgroundURL:at=>`${base}/_home/background?v=${encodeURIComponent(at)}`,
    // Reading time per local date (YYYY-MM-DD, both ends included) over the whole shelf.
    days:async(from,to)=>{
      const query=new URLSearchParams(Object.entries({from,to}).filter(([,value])=>value));
      return (await call(`/_days${query.size?`?${query}`:''}`)).days;
    },
    // Reading per day and every book read ({days,books}), for the shelf's statistics.
    stats:()=>call('/_stats'),
    // A new title, author and blurb ({title,author,blurb}); the shelf rewrites the book's @book line and blurb record and moves
    // its version on.
    saveInfo:(key,info)=>call(`${at(key)}/info`,json('PUT',info)),
    // A null blob clears the cover.
    saveCover:(key,id,blob)=>call(`${at(key)}/cover?id=${encodeURIComponent(id??'')}`,
      {method:'PUT',headers:{'Content-Type':blob?.type||'application/octet-stream'},body:blob??new Uint8Array()}),
    coverURL:(key,version)=>`${base}${at(key)}/cover?v=${encodeURIComponent(version??'')}`,
    remove:key=>call(at(key),{method:'DELETE'}),
  };
}
