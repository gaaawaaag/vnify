// @ts-check
/* Fish Audio for the asset manager (docs/dev/audio.md): speak a line with a voice, design voices from a description,
 * keep a designed candidate as a voice in the user's account, look a voice up, and read the API balance. The key comes
 * from the user's secrets; nothing here stores it. VNIFY_FISH_API points elsewhere for tests. */

const api=()=>process.env.VNIFY_FISH_API||'https://api.fish.audio';

/** @param {Response} response */
async function failure(response) {
  let message='';
  try {const body=await response.json();message=body?.message??(Array.isArray(body)?body.map(item=>item?.msg).filter(Boolean).join('；'):'');} catch {}
  return Object.assign(new Error(`Fish Audio：${message||`HTTP ${response.status}`}`),{status:response.status>=500?502:400,upstream:response.status});
}
/** @param {string} key @param {string} path @param {RequestInit} [init] */
async function call(key,path,init={}) {
  if(!key)throw Object.assign(new Error('还没有填写 Fish Audio 的 key。'),{status:400});
  let response;
  try {response=await fetch(`${api()}${path}`,{...init,headers:{Authorization:`Bearer ${key}`,...init.headers}});}
  catch {throw Object.assign(new Error('无法连接 Fish Audio。'),{status:502});}
  if(!response.ok)throw await failure(response);
  return response;
}

/** A line in a voice, as MP3 bytes. @param {string} key @param {{ref:string,text:string,model:string,speed?:number,language?:string}} line */
export async function speak(key,{ref,text,model,speed=1,language}) {
  const response=await call(key,'/v1/tts',{method:'POST',headers:{'Content-Type':'application/json',model},
    body:JSON.stringify({text,reference_id:ref,format:'mp3',mp3_bitrate:128,latency:'normal',prosody:{speed},...(language?{language}:{})})});
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Candidate voices for a description, each read with the sample text (WAV bytes).
 * @param {string} key @param {{instruction:string,text?:string,language?:string,n?:number}} request
 */
export async function design(key,{instruction,text,language,n=3}) {
  const response=await call(key,'/v1/voice-design',{method:'POST',headers:{'Content-Type':'application/json',model:'voice-design-1'},
    body:JSON.stringify({instruction,...(text?{reference_text:text}:{}),...(language?{language}:{}),n})});
  const body=await response.json();
  const candidates=Array.isArray(body?.candidates)?body.candidates:[];
  return candidates.filter((/** @type {any} */ c)=>typeof c?.audio_base64==='string').map((/** @type {any} */ c)=>Buffer.from(c.audio_base64,'base64'));
}

/**
 * Keeps a candidate as a private voice in the user's account; answers its ID.
 * @param {string} key @param {{title:string,audio:Uint8Array,text?:string,tags?:string[]}} voice
 */
export async function createVoice(key,{title,audio,text,tags=[]}) {
  const form=new FormData();
  form.append('type','tts');form.append('train_mode','fast');form.append('title',title);form.append('visibility','private');
  form.append('voices',new Blob([/** @type {Uint8Array<ArrayBuffer>} */(audio)],{type:'audio/wav'}),'voice.wav');
  if(text)form.append('texts',text);
  for(const tag of tags)form.append('tags',tag);
  const response=await call(key,'/model',{method:'POST',body:form});
  const body=await response.json();
  if(typeof body?._id!=='string')throw Object.assign(new Error('Fish Audio 没有返回音色 ID。'),{status:502});
  return {ref:body._id,title:typeof body.title==='string'?body.title:title};
}

/** A voice's name, tags and languages, or null when it does not exist. @param {string} key @param {string} ref */
export async function lookup(key,ref) {
  try {
    const body=await (await call(key,`/model/${encodeURIComponent(ref)}`)).json();
    return {title:typeof body?.title==='string'&&body.title.trim()?body.title.trim():ref,
      tags:Array.isArray(body?.tags)?body.tags.filter((/** @type {unknown} */ tag)=>typeof tag==='string').slice(0,12):[],
      languages:Array.isArray(body?.languages)?body.languages.filter((/** @type {unknown} */ code)=>typeof code==='string').slice(0,8):[],
      mine:body?.author?._id!==undefined&&body?.visibility==='private'};
  } catch(/** @type {any} */ error) {if(error.upstream===404)return null;throw error;}
}

/** The API credit left. @param {string} key */
export async function balance(key) {
  const body=await (await call(key,'/wallet/self/api-credit?check_free_credit=true')).json();
  return {credit:Number(body?.credit??0),freeCredit:body?.has_free_credit??null};
}
