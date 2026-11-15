// @ts-check
import {apiBase} from '../image-presets.js';

/* An OpenAI-compatible image API from the local server: OpenAI, OpenRouter, a relay. The images API draws at a size
 * (/images/generations) and edits a picture sent as a file (/images/edits); chat completions take the picture as an
 * image part and answer with one in message.images (OpenRouter) or as a data URL in the text (some relays). */
const TIMEOUT_MS=10*60*1000;

/** @param {string} label @param {Response} response */
async function failure(label,response) {
  const body=(await response.text().catch(()=>'')).replace(/\s+/g,' ').slice(0,300);
  const reason=response.status===401||response.status===403?'密钥无效或没有权限':response.status===402?'余额不足':response.status===429?'请求过于频繁，稍后重试'
    :response.status===404?`接口或模型不存在：${body}`:response.status===400||response.status===422?`请求被拒绝：${body}`:`HTTP ${response.status} ${body}`;
  return Object.assign(new Error(`${label}：${reason}`),{status:response.status});
}
/** @param {string} url @param {RequestInit} init @param {AbortSignal} [signal] */
async function call(url,init,signal) {
  const label=new URL(url).host,timeout=AbortSignal.timeout(TIMEOUT_MS);
  let response;
  try{response=await fetch(url,{...init,signal:signal?AbortSignal.any([signal,timeout]):timeout});}
  catch(/** @type {any} */ error) {
    if(error.name==='AbortError'&&signal?.aborted)throw error;
    if(error.name==='TimeoutError')throw new Error(`${label} 超过 10 分钟没有返回。`);
    throw new Error(`连不上 ${label}，请检查地址和网络。`);
  }
  if(!response.ok)throw await failure(label,response);
  return response;
}
/** @param {string} key @returns {Record<string,string>} */
const auth=key=>key?{Authorization:`Bearer ${key}`}:{};
const dataUrl=(/** @type {Uint8Array} */ bytes)=>`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

// A picture given as base64, a data URL or a link to download.
/** @param {string} value @param {AbortSignal} [signal] */
async function picture(value,signal) {
  const data=/^data:image\/[\w.+-]+;base64,(.+)$/s.exec(value);
  if(data)return new Uint8Array(Buffer.from(data[1],'base64'));
  if(/^https?:\/\//.test(value))return new Uint8Array(await (await call(value,{},signal)).arrayBuffer());
  return new Uint8Array(Buffer.from(value,'base64'));
}
/** The first picture in a chat answer. @param {any} answer */
export function chatPicture(answer) {
  const message=answer?.choices?.[0]?.message;
  const image=message?.images?.find((/** @type {any} */ i)=>i?.image_url?.url)?.image_url.url;
  if(image)return image;
  const parts=Array.isArray(message?.content)?message.content:[];
  const part=parts.find((/** @type {any} */ p)=>p?.type==='image_url'&&p.image_url?.url)?.image_url.url;
  if(part)return part;
  const text=typeof message?.content==='string'?message.content:parts.map((/** @type {any} */ p)=>p?.text??'').join('');
  return /data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/.exec(text)?.[0]??/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/.exec(text)?.[1]??null;
}

/**
 * @param {{key:string,preset:any,prompt:string,width:number,height:number,ratio:string,images?:Uint8Array[],signal?:AbortSignal}} request
 * images: the default picture for a variant when the preset edits, or reference pictures (a CG's cast) in order.
 */
export async function generate({key,preset,prompt,width,height,ratio,images=[],signal}) {
  const o=preset.openai,url=apiBase(o.url);
  const parts=images.map(bytes=>({type:'image_url',image_url:{url:dataUrl(bytes)}}));
  // OpenRouter's own image endpoint: a shape rather than a size, pictures as references, transparency when asked.
  const native=async()=>{
    const fields={model:preset.model,prompt,n:1,aspect_ratio:ratio,...(parts.length?{input_references:parts}:{}),...(preset.transparent?{background:'transparent',output_format:'png'}:{})};
    const item=(await (await call(`${url}/images`,{method:'POST',headers:{...auth(key),'Content-Type':'application/json'},body:JSON.stringify(fields)},signal)).json())?.data?.[0];
    const value=item?.b64_json??item?.url;
    if(!value)throw new Error(`${new URL(url).host} 没有返回图片。`);
    return picture(value,signal);
  };
  if(o.protocol==='images'&&new URL(url).host==='openrouter.ai')return native();
  if(o.protocol==='images') {
    const fields={model:preset.model,prompt,n:1,size:`${width}x${height}`,...(preset.transparent?{background:'transparent'}:{})};
    let response;
    if(images.length) {
      const form=new FormData();
      for(const [name,value] of Object.entries(fields))form.append(name,String(value));
      // One picture is sent as image; several as image[] (gpt-image takes up to 16).
      images.forEach((bytes,i)=>form.append(images.length>1?'image[]':'image',new Blob([/** @type {BlobPart} */(bytes)],{type:'image/png'}),`image-${i+1}.png`));
      response=await call(`${url}/images/edits`,{method:'POST',headers:auth(key),body:form},signal);
    } else response=await call(`${url}/images/generations`,{method:'POST',headers:{...auth(key),'Content-Type':'application/json'},body:JSON.stringify(fields)},signal);
    const item=(await response.json())?.data?.[0];
    const value=item?.b64_json??item?.url;
    if(!value)throw new Error(`${new URL(url).host} 没有返回图片。`);
    return picture(value,signal);
  }
  const content=images.length?[{type:'text',text:prompt},...parts]:prompt;
  const body={model:preset.model,messages:[{role:'user',content}],modalities:['image','text'],image_config:{aspect_ratio:ratio}};
  let answer;
  try{answer=await (await call(`${url}/chat/completions`,{method:'POST',headers:{...auth(key),'Content-Type':'application/json'},body:JSON.stringify(body)},signal)).json();}
  catch(/** @type {any} */ error) {
    // OpenRouter turns image-only models (gpt-image) away from chat and draws them on its own /images endpoint.
    if(!/is an image generation/i.test(error.message))throw error;
    return native();
  }
  const value=chatPicture(answer);
  if(!value) {
    const said=String(answer?.choices?.[0]?.message?.content??answer?.error?.message??'').replace(/\s+/g,' ').slice(0,200);
    throw new Error(`${preset.model} 没有返回图片${said?`：${said}`:'（模型可能不支持出图）'}。`);
  }
  return picture(value,signal);
}

/* The service's models. OpenRouter marks what each model can output, and is asked for the image ones; other services
 * list everything, so all are shown and a model can also be typed in. */
/** @param {string} address @param {string} key @returns {Promise<{models:{id:string,name:string}[],filtered:boolean}>} */
export async function listModels(address,key) {
  const url=apiBase(address),openrouter=new URL(url).host==='openrouter.ai';
  const data=(await (await call(`${url}/models${openrouter?'?output_modalities=image':''}`,{headers:auth(key)})).json())?.data;
  if(!Array.isArray(data))throw new Error(`${new URL(url).host} 返回的模型列表格式不对。`);
  const marked=data.some(m=>Array.isArray(m?.architecture?.output_modalities));
  const models=data.filter(m=>typeof m?.id==='string'&&(!marked||m.architecture?.output_modalities?.includes('image')))
    .map(m=>({id:m.id,name:typeof m.name==='string'&&m.name!==m.id?m.name:''})).sort((a,b)=>a.id.localeCompare(b.id));
  return {models,filtered:marked};
}
/** Checks the address and key without drawing: OpenRouter reports the key's credit, others list models. @param {string} address @param {string} key */
export async function probe(address,key) {
  const url=apiBase(address);
  if(new URL(url).host==='openrouter.ai') {
    if(!key)throw new Error('还没有填写这个地址的密钥。');
    const data=(await (await call(`${url}/key`,{headers:auth(key)})).json())?.data??{};
    return {service:'OpenRouter',credit:data.limit_remaining==null?'':String(Math.round(data.limit_remaining*100)/100)};
  }
  const {models}=await listModels(url,key);
  return {service:new URL(url).host,credit:'',models:String(models.length)};
}
