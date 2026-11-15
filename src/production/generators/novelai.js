// @ts-check
import {inflateRawSync} from 'node:zlib';

/* NovelAI image generation from the local server. A drawing, an image-to-image pass from a base picture (used for
 * variants, with the base's seed) and background removal all come back as a ZIP holding one PNG.
 * VNIFY_NAI_HOST / VNIFY_NAI_API point elsewhere for tests. */
const host=()=>process.env.VNIFY_NAI_HOST||'https://image.novelai.net';
const api=()=>process.env.VNIFY_NAI_API||'https://api.novelai.net';
export const FREE_STEPS=28,FREE_PIXELS=1024*1024;

// Opus draws for free up to 28 steps and one megapixel; larger sizes shrink to fit, keeping the shape (multiples of 64).
/** @param {number} width @param {number} height @param {number} steps */
export function freeRange(width,height,steps) {
  if(width*height<=FREE_PIXELS)return {width,height,steps:Math.min(steps,FREE_STEPS)};
  const k=Math.sqrt(FREE_PIXELS/(width*height));
  return {width:Math.max(64,Math.floor(width*k/64)*64),height:Math.max(64,Math.floor(height*k/64)*64),steps:Math.min(steps,FREE_STEPS)};
}

// The first file in a ZIP (stored or deflated), read from the central directory.
/** @param {Uint8Array} bytes */
export function firstZipFile(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(view.getUint32(at,true)===0x06054b50){end=at;break;}
  if(end<0)throw new Error('NovelAI 返回的不是 ZIP。');
  const central=view.getUint32(end+16,true);
  if(view.getUint32(central,true)!==0x02014b50)throw new Error('NovelAI 返回的 ZIP 已损坏。');
  const method=view.getUint16(central+10,true),compressed=view.getUint32(central+20,true),local=view.getUint32(central+42,true);
  const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),data=bytes.subarray(start,start+compressed);
  if(method===0)return data;
  if(method===8)return new Uint8Array(inflateRawSync(data));
  throw new Error('NovelAI 返回的 ZIP 压缩方式不支持。');
}

/** @param {Response} response */
async function failure(response) {
  const body=(await response.text().catch(()=>'')).replace(/\s+/g,' ').slice(0,300);
  const reason=response.status===401?'密钥无效或已过期':response.status===402?'点数不足或需要订阅':response.status===429?'请求过于频繁，稍后重试'
    :response.status===400||response.status===422?`请求被拒绝：${body}`:`HTTP ${response.status} ${body}`;
  return Object.assign(new Error(`NovelAI：${reason}`),{status:response.status});
}
/** @param {string} url @param {string} key @param {any} body @param {AbortSignal} [signal] */
async function post(url,key,body,signal) {
  let response;
  try{response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal});}
  catch(/** @type {any} */ error){if(error.name==='AbortError')throw error;throw new Error('连不上 NovelAI，请检查网络。');}
  if(!response.ok)throw await failure(response);
  return firstZipFile(new Uint8Array(await response.arrayBuffer()));
}
const base64=(/** @type {Uint8Array} */ bytes)=>Buffer.from(bytes).toString('base64');

/**
 * @param {{key:string,preset:any,prompt:string,negative:string,width:number,height:number,seed:number,
 *   base?:{image:Uint8Array,width:number,height:number}|null,signal?:AbortSignal}} request
 */
export async function generate({key,preset,prompt,negative,width,height,seed,base=null,signal}) {
  const n=preset.novelai,v5=preset.model.startsWith('nai-diffusion-5');
  let steps=n.steps;
  if(base){width=base.width;height=base.height;}
  if(n.free)({width,height,steps}=freeRange(width,height,steps));
  const parameters={
    params_version:v5?4:3,width,height,scale:n.scale,sampler:n.sampler,steps,n_samples:1,seed,noise_schedule:n.schedule,cfg_rescale:n.rescale,
    ucPreset:0,qualityToggle:false,dynamic_thresholding:false,legacy:false,add_original_image:false,prefer_brownian:true,negative_prompt:negative,
    use_coords:false,characterPrompts:[],
    v4_prompt:{caption:{base_caption:prompt,char_captions:[]},use_coords:false,use_order:true},
    v4_negative_prompt:{caption:{base_caption:negative,char_captions:[]},legacy_uc:false},
    // A transparent picture (V5) comes back with straight alpha.
    ...(preset.transparent&&v5?{straight_alpha:true,tag_hint_transparent_background:true}:{}),
    ...(base?{image:base64(base.image),strength:n.strength,noise:n.noise,extra_noise_seed:seed,add_original_image:true}:{}),
  };
  const image=await post(`${host()}/ai/generate-image`,key,{input:prompt,model:preset.model,action:base?'img2img':'generate',parameters},signal);
  return {image,width,height,seed,steps};
}
/** NovelAI's background removal tool. @param {{key:string,image:Uint8Array,width:number,height:number,signal?:AbortSignal}} request */
export async function removeBackground({key,image,width,height,signal}) {
  return post(`${host()}/ai/augment-image`,key,{req_type:'bg-removal',image:base64(image),width,height},signal);
}
/** Checks the key: the subscription tier, without drawing. @param {string} key */
export async function probe(key) {
  let response;
  try{response=await fetch(`${api()}/user/subscription`,{headers:{Authorization:`Bearer ${key}`}});}
  catch{throw new Error('连不上 NovelAI，请检查网络。');}
  if(!response.ok)throw await failure(response);
  const data=await response.json();
  return {tier:['未订阅','Tablet','Scroll','Opus'][data?.tier]??String(data?.tier??'未知'),active:!!data?.active};
}
