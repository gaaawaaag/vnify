// @ts-check
import {randomUUID} from 'node:crypto';

/* A ComfyUI server, local or in the cloud: the preset's API workflow, with each value put into the node input its map
 * names, is queued, the history is polled until it has an output image, and that image is downloaded. A workflow that
 * works on a picture (editing, background removal) gets it uploaded first and named in its image input. */
const POLL_MS=1000,TIMEOUT_MS=15*60*1000;

/** Puts each value into the node input its field is mapped to; unmapped fields keep the workflow's own values.
 * @param {string} workflow @param {Record<string,[string,string]|undefined>} map @param {Record<string,unknown>} values */
export function fillWorkflow(workflow,map,values) {
  const data=JSON.parse(workflow);
  for(const [field,target] of Object.entries(map)) {
    if(!target||values[field]===undefined)continue;
    const inputs=data[target[0]]?.inputs;
    if(!inputs||!Object.hasOwn(inputs,target[1]))throw new Error(`工作流里没有节点 ${target[0]} 的 ${target[1]}：请在生图服务页重新选择。`);
    inputs[target[1]]=values[field];
  }
  return data;
}

/* Image loaders a run has no picture for are taken out, so ComfyUI does not look for a file that is not there: the loader,
 * any node left with no other input once its links to removed nodes are dropped (a resize that only served it), and the
 * links into the rest (an optional image2 of an edit encoder). */
/** @param {Record<string,any>} data @param {string[]} nodes */
export function pruneNodes(data,nodes) {
  const removed=new Set(nodes.filter(id=>data[id]));
  const links=(/** @type {any} */ inputs)=>Object.entries(inputs??{}).filter(([,v])=>Array.isArray(v)&&v.length===2&&typeof v[0]==='string');
  for(let grew=true;grew;) {
    grew=false;
    for(const [id,node] of Object.entries(data)) {
      if(removed.has(id))continue;
      const all=links(node?.inputs),cut=all.filter(([,v])=>removed.has(v[0]));
      if(cut.length&&cut.length===all.length){removed.add(id);grew=true;}
    }
  }
  for(const id of removed)delete data[id];
  for(const node of Object.values(data))for(const [name,v] of links(node?.inputs))if(removed.has(v[0]))delete node.inputs[name];
  return data;
}

/** @param {string} url @param {RequestInit} [init] @param {Record<string,string>} [headers] */
async function call(url,init={},headers={}) {
  let response;
  try{response=await fetch(url,{...init,headers:{...headers,...(init.headers??{})}});}
  catch(/** @type {any} */ error){if(error.name==='AbortError')throw error;throw new Error(`连不上 ComfyUI（${new URL(url).origin}）：请确认它开着、地址正确。`);}
  if(!response.ok) {
    const body=(await response.text().catch(()=>'')).replace(/\s+/g,' ').slice(0,400);
    throw new Error(`ComfyUI：HTTP ${response.status} ${body}`);
  }
  return response;
}
const wait=(/** @type {number} */ ms,/** @type {AbortSignal|undefined} */ signal)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(resolve,ms);
  signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(Object.assign(new Error('已取消'),{name:'AbortError'}));},{once:true});
});

/**
 * Runs a workflow and returns the first image it saves. images: pictures by the field that names their loader (image,
 * image2, image3), each uploaded first; unused: mapped loaders this run has no picture for, taken out of the workflow.
 * @param {{url:string,workflow:string,map:Record<string,[string,string]|undefined>,values:Record<string,unknown>,images?:Record<string,Uint8Array>,
 *   unused?:string[],headers?:Record<string,string>,signal?:AbortSignal,mark?:(stage:string)=>void,output?:'images'|'audio'}} request
 * output: what the workflow saves, pictures (images) or sound (audio).
 * mark: called as each stage ends (上传, 生成, 下载), for the queue's timing log.
 */
export async function run({url,workflow,map,values,images={},unused=[],headers={},signal,mark=()=>{},output='images'}) {
  const filled={...values};
  for(const [field,image] of Object.entries(images)) {
    const form=new FormData();
    form.append('image',new Blob([/** @type {BlobPart} */(image)],{type:'image/png'}),`vnify-${randomUUID()}.png`);
    form.append('overwrite','true');
    const uploaded=await (await call(`${url}/upload/image`,{method:'POST',body:form,signal},headers)).json();
    filled[field]=uploaded.subfolder?`${uploaded.subfolder}/${uploaded.name}`:uploaded.name;
  }
  if(Object.keys(images).length)mark('上传');
  const kept=Object.fromEntries(Object.entries(map).filter(([field])=>!unused.includes(field)));
  const prompt=pruneNodes(fillWorkflow(workflow,kept,filled),unused.map(field=>/** @type {any} */(map)[field]?.[0]).filter(Boolean)),client=randomUUID();
  const queued=await (await call(`${url}/prompt`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,client_id:client}),signal},headers)).json();
  if(queued.node_errors&&Object.keys(queued.node_errors).length)throw new Error(`ComfyUI 拒绝了工作流：${JSON.stringify(queued.node_errors).slice(0,400)}`);
  const id=queued.prompt_id;
  for(const started=Date.now();Date.now()-started<TIMEOUT_MS;) {
    await wait(POLL_MS,signal);
    const history=await (await call(`${url}/history/${id}`,{signal},headers)).json(),entry=history[id];
    if(!entry)continue;
    if(entry.status?.status_str==='error')throw new Error(`ComfyUI 运行出错：${JSON.stringify(entry.status.messages?.find((/** @type {any} */ m)=>m[0]==='execution_error')?.[1]?.exception_message??'').slice(0,300)}`);
    const saved=Object.values(entry.outputs??{}).flatMap((/** @type {any} */ out)=>out[output]??[]);
    const picture=saved.find((/** @type {any} */ i)=>i.type!=='temp')??saved[0];
    if(!picture) {
      if(entry.status?.completed)throw new Error(output==='audio'?'ComfyUI 没有输出音频：工作流里要有保存音频的节点（如 SaveAudioMP3）。'
        :'ComfyUI 没有输出图片：工作流里要有保存图片的节点。');
      continue;
    }
    mark('生成');
    const query=new URLSearchParams({filename:picture.filename,subfolder:picture.subfolder??'',type:picture.type??'output'});
    const bytes=new Uint8Array(await (await call(`${url}/view?${query}`,{signal},headers)).arrayBuffer());
    mark('下载');
    return bytes;
  }
  throw new Error('ComfyUI 超过 15 分钟没有完成。');
}
/** Checks the address: the ComfyUI version and the first device. @param {string} url @param {Record<string,string>} [headers] */
export async function probe(url,headers={}) {
  const stats=await (await call(`${url}/system_stats`,{},headers)).json();
  const device=stats.devices?.[0];
  return {version:stats.system?.comfyui_version??'',device:device?`${device.name} · ${Math.round((device.vram_total??0)/2**30)} GB`:''};
}
