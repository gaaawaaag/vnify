// Rewrites a work's prompts for the image service presets its 生图方案 uses (docs/prompt-formats.md).
// --list                         presets in the scheme, whether each rewrites, and how many prompts wait
// --packet <预设ID> [--max N] [--all] --out <file>   the requirement and the prompts to rewrite, as JSON
// --apply <预设ID> <file>        saves {任务ID: 改写后的提示词} under the preset's current format
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDirectors} from '../src/core/director.js';
import {loadDirectorProject} from '../src/production/director-project.js';
import {assetCatalog} from '../src/production/asset-catalog.js';
import {validateImagePresets,validateImageScheme,presetName,formatKey,fingerprint} from '../src/production/image-presets.js';
import {formatItems,castTokens,keptFraming,framingKept} from '../src/production/prompt-formats.js';
import {setFormattedPrompts} from '../src/production/director-edits.js';

const usage='node scripts/format-prompts.mjs <project.json> (--list | --packet <预设ID> [--max N] [--all] --out <file> | --apply <预设ID> <file>)';
// The production folder holding image-presets.json: this kit or repository, or VN_PRODUCTION_DIR as for the manager.
const imageFile=path.join(process.env.VN_PRODUCTION_DIR??fileURLToPath(new URL('../',import.meta.url)),'image-presets.json');
try {
  const [input,mode,...rest]=process.argv.slice(2);
  if(!input||!['--list','--packet','--apply'].includes(mode))throw new Error(usage);
  let raw=null;
  try{raw=JSON.parse(await readFile(imageFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error(`image-presets.json 无法读取：${error.message}`);}
  const presets=validateImagePresets(raw).presets;
  const loaded=await loadDirectorProject(input);
  const catalog=assetCatalog({...loaded,docs:readDirectors(/** @type {string} */(loaded.job.readableOutput),loaded.story)});
  const scheme=validateImageScheme(loaded.project.imageScheme,presets);
  const presetOf=id=>{
    const preset=presets.find(p=>p.id===id);
    if(!preset)throw new Error(`没有生图预设 ${id}。`);
    if(!formatKey(preset))throw new Error(`${presetName(preset)} 没有写改写要求，直接使用组装的提示词，不需要改写。`);
    return preset;
  };
  if(mode==='--list'){
    const ids=[...new Set([...Object.values(scheme.uses),...Object.values(scheme.overrides)])];
    const list=ids.map(id=>{
      const preset=presets.find(p=>p.id===id),rewrites=!!formatKey(preset);
      return {id,name:presetName(preset),rewrites,...(rewrites?{pending:formatItems(catalog,scheme,preset).length}:{})};
    });
    console.log(JSON.stringify({presets:list},null,2));
  }else if(mode==='--packet'){
    const preset=presetOf(rest.shift()),flags={max:Infinity,all:false,out:null};
    while(rest.length){
      const flag=rest.shift();
      if(flag==='--all')flags.all=true;
      else if(flag==='--max'){flags.max=Number(rest.shift());if(!Number.isInteger(flags.max)||flags.max<1)throw new Error('--max 须为正整数。');}
      else if(flag==='--out')flags.out=rest.shift();
      else throw new Error(usage);
    }
    if(!flags.out)throw new Error(usage);
    const all=formatItems(catalog,scheme,preset,{all:flags.all}),items=all.slice(0,flags.max);
    const output=path.resolve(flags.out);
    await mkdir(path.dirname(output),{recursive:true});
    await writeFile(output,JSON.stringify({preset:{id:preset.id,name:presetName(preset)},notes:preset.format.notes,items},null,2)+'\n');
    console.log(JSON.stringify({ok:true,output,items:items.length,remaining:all.length-items.length},null,2));
  }else{
    const [id,file]=rest;
    if(!id||!file||rest.length!==2)throw new Error(usage);
    const preset=presetOf(id),answer=JSON.parse(await readFile(file,'utf8'));
    if(!answer||typeof answer!=='object'||Array.isArray(answer))throw new Error('改写结果须为 {任务ID: 提示词} 的 JSON 对象。');
    const composed=new Map(formatItems(catalog,scheme,preset,{all:true}).map(i=>[i.key,i.prompt]));
    const prompts={};
    for(const [key,value] of Object.entries(answer)){
      if(!composed.has(key))throw new Error(`${key} 不是这个预设要改写的提示词（不在生图方案里，或已手动改写）。`);
      if(typeof value!=='string'||!value.trim())throw new Error(`${key} 的提示词是空的。`);
      if(castTokens(value)!==castTokens(composed.get(key)))throw new Error(`${key} 须原样保留人物标记 ${castTokens(composed.get(key))||'（原文没有，改写也不能加）'}。`);
      const framing=keptFraming(composed.get(key));
      if(framing&&!framingKept(composed.get(key),value))throw new Error(`${key} 须逐字保留一组取景句：${framing.en.join(' ')}｜${framing.zh.join('')}`);
      prompts[key]={text:value,source:fingerprint(composed.get(key))};
    }
    await setFormattedPrompts(input,preset.id,formatKey(preset),prompts);
    console.log(JSON.stringify({ok:true,saved:Object.keys(answer).length,pending:formatItems(catalog,scheme,preset).filter(i=>!(i.key in answer)).length},null,2));
  }
}catch(error){console.error(JSON.stringify({ok:false,error:error.message},null,2));process.exitCode=1;}
