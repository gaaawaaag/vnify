// @ts-check
/* Image service presets (image-presets.json at the workspace root, edited on the manager's 生图服务 page).
 * A preset says how one kind of image is drawn: the source (NovelAI, a ComfyUI workflow or an OpenAI-compatible API), the fixed prompts, the
 * sizes per shape and whether what comes back is already transparent. Keys never go here; they stay in the user's
 * secrets file. */

/** @typedef {'background'|'cg'|'cutin'|'cover'|'standing'|'variant'|'cutout'} ImageUse */
/** @type {ImageUse[]} */
export const IMAGE_USES=['background','cg','cutin','cover','standing','variant','cutout'];
export const USE_LABELS={background:'背景',cg:'CG',cutin:'特写',cover:'封面',standing:'立绘',variant:'差分编辑',cutout:'去背'};
export const IMAGE_SOURCES=['novelai','comfyui','openai'];
export const SOURCE_LABELS={novelai:'NovelAI',comfyui:'ComfyUI',openai:'OpenAI 兼容'};
export const NAI_MODELS={'nai-diffusion-5-full':'V5 Full','nai-diffusion-5-curated':'V5 Curated','nai-diffusion-4-5-full':'V4.5 Full','nai-diffusion-4-5-curated':'V4.5 Curated'};
export const NAI_SAMPLERS=['k_euler_ancestral','k_euler','k_dpmpp_2m','k_dpmpp_2s_ancestral','k_dpmpp_2m_sde','k_dpmpp_sde'];
export const NAI_SCHEDULES=['karras','exponential','polyexponential'];
export const SHAPES=['16:9','3:2','4:3','1:1','3:4','2:3','9:16'];
// Sizes in multiples of 64 within about one megapixel (NovelAI's free range for Opus).
export const DEFAULT_SIZES={'16:9':[1344,768],'3:2':[1216,832],'4:3':[1152,896],'1:1':[1024,1024],'3:4':[896,1152],'2:3':[832,1216],'9:16':[768,1344]};
export const WORKFLOW_LIMIT=300000;

/* An OpenAI-compatible API is reached at its base address (…/v1) in one of two ways: the images API
 * (/images/generations and /images/edits, with a size) or chat completions that answer with a picture (only a shape).
 * Its key is kept per address, so presets on one service share it. */
/** @typedef {'images'|'chat'} ApiProtocol */
export const API_PROTOCOLS=['images','chat'];
export const API_SERVICES=[
  {label:'OpenRouter',url:'https://openrouter.ai/api/v1',protocol:'chat'},
  {label:'OpenAI',url:'https://api.openai.com/v1',protocol:'images'},
];
/** The address as stored: without a trailing slash. @param {string} url */
export const apiBase=url=>String(url??'').trim().replace(/\/+$/,'');
/** The secret holding the key for an address. @param {string} url */
export const apiSecret=url=>`openai:${apiBase(url)}`;
/** The service's short name: a known one, or the host. @param {string} url */
export function apiLabel(url) {
  const base=apiBase(url),known=API_SERVICES.find(s=>s.url===base);
  if(known)return known.label;
  try{return new URL(base).host;}catch{return base;}
}

const fail=(/** @type {string} */ message)=>{throw new Error(message);};
const text=(/** @type {unknown} */ v,max=4000)=>typeof v==='string'&&v.length<=max;
const number=(/** @type {unknown} */ v,min=-Infinity,max=Infinity)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;

/* A ComfyUI API workflow (导出（API）) is filled by node: each field names the node input it goes into ([node, input]).
 * The inputs are found from the sampler when a workflow is read and can be changed on the 生图服务 page. */
/** @typedef {'prompt'|'negative'|'seed'|'width'|'height'|'image'|'image2'|'image3'} WorkflowField */
/** @typedef {Partial<Record<WorkflowField,[string,string]>>} WorkflowMap */
/** @type {WorkflowField[]} */
export const WORKFLOW_FIELDS=['prompt','negative','seed','width','height','image','image2','image3'];
// A reference workflow (a CG drawn with the cast's portraits) takes up to three pictures, in the order the prompt numbers them.
export const REFERENCE_IMAGES=/** @type {const} */(['image','image2','image3']);
export const FIELD_LABELS={prompt:'提示词',negative:'负面提示词',seed:'种子',width:'宽度',height:'高度',image:'底图',image2:'参考图 2',image3:'参考图 3'};
/** @param {WorkflowField} field */
export const fieldKind=field=>['prompt','negative','image','image2','image3'].includes(field)?'text':'number';
const TEXT_INPUTS=['text','prompt','string','text_g'];
const isLink=(/** @type {unknown} */ v)=>Array.isArray(v)&&v.length===2&&typeof v[0]==='string'&&Number.isInteger(v[1]);
const holds=(/** @type {unknown} */ v,/** @type {string} */ kind)=>kind==='text'?typeof v==='string':typeof v==='number'&&Number.isFinite(v);

/** The workflow's nodes, checked to be ComfyUI's API format. @param {string} workflow @returns {Record<string,any>} */
export function parseWorkflow(workflow) {
  if(typeof workflow!=='string'||!workflow.trim())fail('工作流是空的。');
  if(workflow.length>WORKFLOW_LIMIT)fail('工作流太大（超过 300 KB）。');
  let data;try{data=JSON.parse(workflow);}catch{fail('工作流不是有效的 JSON。');}
  if(!data||typeof data!=='object'||Array.isArray(data))fail('工作流格式不对。');
  if(Array.isArray(data.nodes))fail('这是界面格式的工作流：请在 ComfyUI 里用“导出（API）”重新保存。');
  if(!Object.values(data).some(node=>typeof node?.class_type==='string'))fail('工作流里没有节点（需要 API 格式）。');
  return data;
}

/** Every input that holds a value (not a link), for choosing where a field goes. @param {Record<string,any>} data */
export function workflowInputs(data) {
  return Object.entries(data).flatMap(([node,n])=>Object.entries(n?.inputs??{})
    .filter(([,value])=>holds(value,'text')||holds(value,'number'))
    .map(([input,value])=>({node,input,title:String(n._meta?.title||n.class_type),kind:typeof value==='string'?'text':'number',value})));
}

/** The first of names holding a value, or the value on the node it is linked from (a primitive).
 * @param {Record<string,any>} data @param {string} node @param {string[]} names @param {string} kind @returns {[string,string]|null} */
function valueOf(data,node,names,kind) {
  const inputs=data[node]?.inputs??{};
  for(const name of names) {
    const v=inputs[name];
    if(holds(v,kind))return [node,name];
    if(isLink(v)) {
      const from=data[v[0]]?.inputs??{},key=['value',name].find(k=>holds(from[k],kind));
      if(key)return [v[0],key];
    }
  }
  return null;
}
// The nearest text upstream of a conditioning link: CLIPTextEncode and the like, or a string node feeding it.
/** @param {Record<string,any>} data @param {unknown} start @returns {[string,string]|null} */
function textFrom(data,start) {
  if(!isLink(start))return null;
  const queue=[/** @type {any} */(start)[0]],seen=new Set();
  while(queue.length) {
    const node=queue.shift();
    if(seen.has(node)||!data[node])continue;
    seen.add(node);
    const found=valueOf(data,node,TEXT_INPUTS,'text');
    if(found)return found;
    for(const v of Object.values(data[node].inputs??{}))if(isLink(v))queue.push(v[0]);
  }
  return null;
}
/** Where prompt, negative, seed and size go, found from the sampler; a picture workflow takes its image instead of a size,
 * a reference workflow both the size and its image loaders in order.
 * @param {Record<string,any>} data @param {boolean|'reference'} [image] @returns {WorkflowMap} */
export function detectWorkflow(data,image=false) {
  const nodes=Object.entries(data).filter(([,n])=>n?.inputs&&typeof n.inputs==='object');
  const sampler=nodes.find(([,n])=>isLink(n.inputs.positive))??nodes.find(([,n])=>/Guider/.test(n.class_type)&&isLink(n.inputs.conditioning));
  /** @type {WorkflowMap} */
  const map={};
  const encoder=nodes.find(([,n])=>/TextEncode/.test(n.class_type));
  const prompt=sampler?textFrom(data,sampler[1].inputs.positive??sampler[1].inputs.conditioning):encoder?valueOf(data,encoder[0],TEXT_INPUTS,'text'):null;
  if(prompt)map.prompt=prompt;
  // A negative that leads back to the prompt (ConditioningZeroOut) is not one.
  const negative=sampler?textFrom(data,sampler[1].inputs.negative):null;
  if(negative&&String(negative)!==String(prompt))map.negative=negative;
  // The sampler's own seed first, then a noise node (SamplerCustomAdvanced takes RandomNoise).
  const seed=[...(sampler?[sampler]:[]),...nodes].map(([node])=>valueOf(data,node,['seed','noise_seed'],'number')).find(Boolean);
  if(seed)map.seed=seed;
  const loads=nodes.filter(([,n])=>/^LoadImage/.test(n.class_type)&&typeof n.inputs.image==='string');
  if(image==='reference')loads.slice(0,REFERENCE_IMAGES.length).forEach(([node],i)=>{map[REFERENCE_IMAGES[i]]=[node,'image'];});
  else if(image&&loads[0])map.image=[loads[0][0],'image'];
  if(!image||image==='reference') {
    const latent=nodes.find(([,n])=>/Latent/.test(n.class_type)&&'width' in n.inputs&&'height' in n.inputs);
    const width=latent&&valueOf(data,latent[0],['width'],'number'),height=latent&&valueOf(data,latent[0],['height'],'number');
    if(width&&height&&String(width)!==String(height))Object.assign(map,{width,height});
  }
  return map;
}

/** The map with each field on an input holding its kind of value; a picture workflow needs its image, others the prompt
 * (a reference workflow both).
 * @param {Record<string,any>} data @param {unknown} map @param {boolean|'reference'} [image] @returns {WorkflowMap} */
export function checkWorkflowMap(data,map,image=false) {
  if(!map||typeof map!=='object'||Array.isArray(map))fail('工作流的节点对应格式不对。');
  /** @type {WorkflowMap} */
  const out={};
  const used=new Set();
  for(const field of WORKFLOW_FIELDS) {
    const target=/** @type {any} */(map)[field];
    if(target==null)continue;
    const fits=Array.isArray(target)&&target.length===2&&target.every(x=>typeof x==='string')&&holds(data[target[0]]?.inputs?.[target[1]],fieldKind(field));
    if(!fits)fail(`工作流里没有可以填${FIELD_LABELS[field]}的输入 ${JSON.stringify(target)}。`);
    if(used.has(String(target)))fail('同一个输入不能同时填两项。');
    used.add(String(target));
    out[field]=[target[0],target[1]];
  }
  if(image&&!out.image)fail('选择底图交给哪个“加载图像”节点。');
  if((!image||image==='reference')&&!out.prompt)fail('选择提示词填进哪个节点。');
  if(!image&&(out.image||out.image2||out.image3)||image===true&&(out.image2||out.image3))fail('这个工作流不接收参考图。');
  if(image==='reference'&&out.image3&&!out.image2)fail('参考图按顺序填：先选参考图 2。');
  return out;
}

/** The preset's name: 来源 · 模型 · 用途 · 自定义 (an API is named by its service, its model without the vendor). @param {any} p */
/** The model a preset draws with, as credits name it. @param {any} p */
export function presetModel(p) {
  const cutoutOnly=p.uses.length===1&&p.uses[0]==='cutout';
  return p.source==='novelai'?(cutoutOnly?'去背景':/** @type {Record<string,string>} */(NAI_MODELS)[p.model]?.replace(' Full','')??p.model)
    :p.source==='openai'?String(p.model).split('/').pop():p.model;
}
/** The model as credits name it: NovelAI's carry the service's name. @param {any} p */
export const creditModel=p=>p.source==='novelai'?`NovelAI ${presetModel(p)}`:presetModel(p);
/** @param {any} p */
export function presetName(p) {
  const cutoutOnly=p.uses.length===1&&p.uses[0]==='cutout',model=presetModel(p);
  const use=cutoutOnly?(p.source==='novelai'?'':'去背')
    :p.uses.length===1?(p.uses[0]==='standing'?(p.transparent?'透明背景立绘':'立绘'):p.uses[0]==='variant'?'立绘差分编辑':/** @type {any} */(USE_LABELS)[p.uses[0]])
      :p.uses.map((/** @type {string} */ u)=>/** @type {any} */(USE_LABELS)[u]).join('／');
  const source=p.source==='openai'?apiLabel(p.openai?.url):/** @type {any} */(SOURCE_LABELS)[p.source];
  return [source,model,use,p.custom].filter(Boolean).join(' · ');
}

/* How prompts are written for a preset (see docs/prompt-formats.md): notes are the agent's rewriting requirement ('' sends
 * the composed prompt); edit says what an edit from the default picture is sent: the edit instruction, or the variant's
 * full description (NovelAI image-to-image does not follow instructions); refLabel names reference pictures in the prompt
 * ('image {n}', '图{n}'; '' leaves them unnumbered); transparent wraps a portrait's prompt for a preset that draws transparent
 * pictures itself, around {prompt} (Qwen Image asks for its own wording; '' sends the prompt as it is). */
/** @typedef {{notes:string,edit:'instruction'|'full',refLabel:string,transparent:string}} PromptFormat */
export const NOTES_LIMIT=12000;
/** @param {string} source @returns {PromptFormat} */
export const defaultFormat=source=>({notes:'',edit:source==='novelai'?'full':'instruction',refLabel:'',transparent:''});
/** A reference picture's name in the prompt: the label with its number, or null when the preset does not number them.
 * @param {{format:PromptFormat}} preset @param {number} n from 1 */
export const refLabel=(preset,n)=>preset.format.refLabel?preset.format.refLabel.replaceAll('{n}',String(n)):null;
/** A short fingerprint of a text (FNV-1a). @param {string} text */
export function fingerprint(text) {
  let hash=0x811c9dc5;
  for(const char of text){hash^=char.codePointAt(0)??0;hash=Math.imul(hash,0x01000193)>>>0;}
  return hash.toString(16).padStart(8,'0');
}
/** The rewriting requirement's fingerprint; '' when nothing is rewritten. @param {{format:PromptFormat}} preset */
export const formatKey=preset=>preset.format.notes.trim()?fingerprint(preset.format.notes.trim()):'';

// Can this preset edit a picture rather than draw anew?
/** @param {any} preset */
export const canEdit=preset=>preset.source==='novelai'?preset.novelai.variantMode==='img2img':preset.source==='openai'?preset.openai.edit:!!preset.comfyui.edit;
/* How many reference pictures a preset takes with a text prompt (a CG with the cast's portraits): an API that accepts
 * pictures takes up to four, a ComfyUI reference workflow one per mapped image loader, NovelAI none. */
/** @param {any} preset */
export function referenceLimit(preset) {
  if(preset.source==='openai')return preset.openai.edit?4:0;
  if(preset.source==='comfyui')return preset.comfyui.reference?REFERENCE_IMAGES.filter(f=>preset.comfyui.referenceMap?.[f]).length:0;
  return 0;
}

/** @param {string} source @param {string} id */
export function newPreset(source,id) {
  const base={id,source,model:source==='novelai'?'nai-diffusion-4-5-full':'',uses:[],custom:'',positive:'',positiveAt:'after',negative:'',
    seed:'random',sizes:structuredClone(DEFAULT_SIZES),transparent:false,format:defaultFormat(source)};
  if(source==='openai')return {...base,model:'',openai:{url:API_SERVICES[0].url,protocol:API_SERVICES[0].protocol,edit:true}};
  return source==='novelai'
    ?{...base,novelai:{sampler:'k_euler_ancestral',schedule:'karras',steps:28,scale:5,rescale:0,free:true,variantMode:'img2img',strength:.55,noise:.1}}
    :{...base,comfyui:{url:'http://127.0.0.1:8188',generate:null,edit:null,reference:null,generateMap:{},editMap:{},referenceMap:{}}};
}

/** @param {any} p */
function validatePreset(p) {
  if(!p||typeof p!=='object'||!text(p.id,64)||!/^[\w-]+$/.test(p.id))fail('生图预设需要 ID。');
  const where=`生图预设 ${p.id}`;
  if(!IMAGE_SOURCES.includes(p.source))fail(`${where} 的来源无效。`);
  if(!Array.isArray(p.uses)||p.uses.some((/** @type {any} */ u)=>!IMAGE_USES.includes(u))||new Set(p.uses).size!==p.uses.length)fail(`${where} 的用途无效。`);
  if(!text(p.model,120)||!text(p.custom,60)||!text(p.positive)||!text(p.negative)||!['before','after'].includes(p.positiveAt))fail(`${where} 的名称或提示词无效。`);
  if(p.seed!=='random'&&!(Number.isInteger(p.seed)&&number(p.seed,0,4294967295)))fail(`${where} 的种子须为 random 或 0–4294967295 的整数。`);
  if(typeof p.transparent!=='boolean')fail(`${where} 需要说明生成结果是否已是透明背景。`);
  if(!p.sizes||typeof p.sizes!=='object')fail(`${where} 需要尺寸。`);
  const sizes={};
  for(const shape of SHAPES) {
    const size=p.sizes[shape]??/** @type {any} */(DEFAULT_SIZES)[shape];
    if(!Array.isArray(size)||size.length!==2||size.some(n=>!Number.isInteger(n)||n<64||n>4096))fail(`${where} 的 ${shape} 尺寸须为 64–4096 的整数。`);
    /** @type {any} */(sizes)[shape]=[size[0],size[1]];
  }
  const f=p.format??defaultFormat(p.source);
  const label=f?.refLabel??'',wrap=f?.transparent??'';
  if(!f||typeof f!=='object'||typeof f.notes!=='string'||!['instruction','full'].includes(f.edit))fail(`${where} 的提示词写法无效。`);
  // A model's prompting guide can run to a few pages; the agent reads it whole for every packet.
  if(f.notes.length>NOTES_LIMIT)fail(`${where} 的提示词写法最多 ${NOTES_LIMIT} 字（现在 ${f.notes.length} 字）。`);
  if(!text(label,40)||label&&!label.includes('{n}'))fail(`${where} 的参考图编号须含 {n}，如 image {n}。`);
  if(!text(wrap,1000)||wrap&&wrap.split('{prompt}').length!==2)fail(`${where} 的透明写法须含一处 {prompt}。`);
  const base={id:p.id,source:p.source,model:p.model,uses:[...p.uses],custom:p.custom,positive:p.positive,positiveAt:p.positiveAt,negative:p.negative,
    seed:p.seed,sizes,transparent:p.transparent,format:{notes:f.notes,edit:f.edit,refLabel:label,transparent:wrap}};
  if(p.source==='novelai') {
    const n=p.novelai??{};
    const cutoutOnly=p.uses.length===1&&p.uses[0]==='cutout';
    if(!cutoutOnly&&!Object.hasOwn(NAI_MODELS,p.model))fail(`${where} 的 NovelAI 模型无效。`);
    if(!NAI_SAMPLERS.includes(n.sampler)||!NAI_SCHEDULES.includes(n.schedule)||!number(n.steps,1,50)||!number(n.scale,0,10)||!number(n.rescale,0,1)
      ||typeof n.free!=='boolean'||!['img2img','generate'].includes(n.variantMode)||!number(n.strength,.01,.99)||!number(n.noise,0,.99))fail(`${where} 的 NovelAI 参数无效。`);
    if(p.transparent&&!cutoutOnly&&!p.model.startsWith('nai-diffusion-5'))fail(`${where}：NovelAI 只有 V5 能直接生成透明背景。`);
    return {...base,novelai:{sampler:n.sampler,schedule:n.schedule,steps:Math.round(n.steps),scale:n.scale,rescale:n.rescale,free:n.free,
      variantMode:n.variantMode,strength:n.strength,noise:n.noise}};
  }
  if(p.source==='openai') {
    const o=p.openai??{};
    let url;try{url=new URL(apiBase(o.url));}catch{fail(`${where} 的接口地址无效。`);}
    if(!['http:','https:'].includes(/** @type {URL} */(url).protocol)||/** @type {URL} */(url).search||/** @type {URL} */(url).hash)fail(`${where} 的接口地址须为 http(s)://…/v1，不带 ? 和 #。`);
    if(!API_PROTOCOLS.includes(o.protocol)||typeof o.edit!=='boolean')fail(`${where} 的接口方式无效。`);
    if(p.uses.includes('cutout'))fail(`${where}：生图 API 不能用来去背。`);
    // The images API can ask for a transparent background (gpt-image); chat answers cannot. Neither takes a negative prompt or a seed.
    return {...base,negative:'',seed:'random',transparent:o.protocol==='images'&&p.transparent,openai:{url:apiBase(o.url),protocol:o.protocol,edit:o.edit}};
  }
  const c=p.comfyui??{};
  let url;try{url=new URL(c.url);}catch{fail(`${where} 的 ComfyUI 地址无效。`);}
  if(!['http:','https:'].includes(/** @type {URL} */(url).protocol)||/** @type {URL} */(url).search||/** @type {URL} */(url).hash)fail(`${where} 的 ComfyUI 地址须为 http(s)://主机:端口，不带 ? 和 #。`);
  // A workflow without a saved map (none, or empty) takes the one found from its sampler.
  const mapOf=(/** @type {string|null|undefined} */ workflow,/** @type {any} */ map,/** @type {boolean|'reference'} */ image=false)=>{
    if(workflow==null)return {};
    const data=parseWorkflow(workflow);
    return checkWorkflowMap(data,map&&Object.keys(map).length?map:detectWorkflow(data,image),image);
  };
  const generateMap=mapOf(c.generate,c.generateMap),editMap=mapOf(c.edit,c.editMap,true),referenceMap=mapOf(c.reference,c.referenceMap,'reference');
  return {...base,comfyui:{url:/** @type {string} */(c.url).replace(/\/+$/,''),generate:c.generate,edit:c.edit,reference:c.reference??null,
    generateMap,editMap,referenceMap}};
}

/** The file as saved; a missing file is no presets. @param {unknown} value */
export function validateImagePresets(value) {
  if(value==null)return {version:1,presets:[]};
  const v=/** @type {any} */(value);
  if(typeof v!=='object'||v.version!==1||!Array.isArray(v.presets)||v.presets.length>100)fail('image-presets.json 格式不对。');
  const presets=v.presets.map(validatePreset);
  if(new Set(presets.map((/** @type {any} */ p)=>p.id)).size!==presets.length)fail('生图预设 ID 重复。');
  return {version:1,presets};
}

/* A work's choice of preset for each use (cutout: 'program' or a background-removal preset) and per-image overrides,
 * kept in the director project as imageScheme. */
/** @param {unknown} value @param {any[]} presets */
export function validateImageScheme(value,presets) {
  const v=/** @type {any} */(value??{}),ids=new Set(presets.map(p=>p.id));
  if(typeof v!=='object'||Array.isArray(v))fail('生图方案格式不对。');
  const uses={};
  for(const use of IMAGE_USES.filter(u=>u!=='cutout')) {
    const id=v.uses?.[use];
    if(id!=null&&typeof id!=='string')fail('生图方案的预设无效。');
    if(id&&ids.has(id))/** @type {any} */(uses)[use]=id;
  }
  // How a portrait that comes back on a solid colour loses it: not at all (later, by hand), the program, or a preset.
  const cutout=v.cutout==='none'?'none':v.cutout==null||v.cutout==='program'||!ids.has(v.cutout)?'program':v.cutout;
  const overrides=Object.fromEntries(Object.entries(v.overrides??{}).filter(([key,id])=>typeof key==='string'&&typeof id==='string'&&ids.has(id)));
  // cgReferences: a CG is drawn with the bound portraits of the characters in its range, when its preset takes pictures.
  return {uses,cutout,overrides,cgReferences:v.cgReferences===true};
}

// Which use draws an image: the catalog's category, and variants of characters by the edit use.
/** @param {{cat:string}} asset @param {{variantId?:string}} image @returns {ImageUse} */
export function imageUse(asset,image) {
  if(image.variantId&&asset.cat==='character')return 'variant';
  return /** @type {any} */({cover:'cover',ambient:'background',location:'background',character:'standing',cg:'cg',cutin:'cutin'})[asset.cat];
}
