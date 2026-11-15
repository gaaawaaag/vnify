#!/usr/bin/env node
// Draws a work's pictures with the image service presets saved in the workbench (生图服务), the same queue the asset
// manager runs: each picture with the preset its 生图方案 (project imageScheme) names, bound as soon as it is done and logged
// in generated.json. Also sets a hand-written prompt for one picture (the manager's 手动改写) and works out a portrait's
// avatar square. Keys stay in the user's secrets file and are never printed.
//
//   node scripts/draw-images.mjs <project.json> --presets
//   node scripts/draw-images.mjs <project.json> --list [--missing]
//   node scripts/draw-images.mjs <project.json> --draw <key,key…> | --missing [--limit N]
//   node scripts/draw-images.mjs <project.json> --prompt <key>[#edit] (--text "…" | --text-file <file> | --clear)
//   node scripts/draw-images.mjs <project.json> --crop <key> [--clavicle Y] [--top Y] [--center X] [--file <png>] [--preview <file>] [--save]
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadDirectorProject} from '../src/production/director-project.js';
import {assetCatalog} from '../src/production/asset-catalog.js';
import {readDirectors} from '../src/core/director.js';
import {validateImagePresets,validateImageScheme,imageUse,presetName,apiSecret,canEdit,USE_LABELS} from '../src/production/image-presets.js';
import {planDrawing} from '../src/production/image-generation.js';
import {chosenPrompt} from '../src/production/prompt-formats.js';
import {setPromptOverride,adjustPortrait} from '../src/production/director-edits.js';
import {readGenerated} from '../src/production/generation-log.js';
import {secretStatus} from '../src/production/secrets.js';
import {decodePng,encodePng} from '../src/production/png.js';
import {imageType} from '../src/reader/backgrounds.js';
import {measurePortrait,avatarCropFor,cropPixels,guidePixels} from '../src/production/avatar-crop.js';
import {CROP} from '../src/reader/figure-layout.js';
import {createGeneration} from '../src/server/generation.mjs';

const args=process.argv.slice(2);
const flag=name=>args.includes(name);
const option=name=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:undefined;};
const projectPath=args[0]&&!args[0].startsWith('--')?path.resolve(args[0]):null;
if(!projectPath){console.error('用法见脚本开头：node scripts/draw-images.mjs <project.json> --list | --draw … | --prompt … | --crop …');process.exit(2);}
// The workbench's presets live at the production environment's root, beside presets.json.
const root=path.resolve(option('--root')??process.env.VN_PRODUCTION_DIR??path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
const print=value=>console.log(JSON.stringify(value,null,2));

async function imagePresets() {
  let raw=null;
  try{raw=JSON.parse(await readFile(path.join(root,'image-presets.json'),'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw new Error('image-presets.json 无法读取，请检查文件内容。');}
  return validateImagePresets(raw).presets;
}
async function load(file) {
  const loaded=await loadDirectorProject(file);
  const docs=readDirectors(loaded.job.readableOutput,loaded.story);
  return {loaded,catalog:assetCatalog({...loaded,docs})};
}
const images=catalog=>catalog.flatMap(asset=>asset.images.map(image=>({asset,image})));
const nameOf=({asset,image})=>asset.name+(image.variantId?` · ${image.name}`:'');
/** The file of a key's latest generated picture, while it is the bound one. @param {any[]} log @param {any} image */
const fileOf=(log,image)=>{
  const entry=image.bound&&log.findLast(e=>e.key===image.key&&e.imageId===image.bound.imageId);
  return entry?path.resolve(path.dirname(projectPath),entry.file):null;
};

async function main() {
  const all=await imagePresets();
  if(flag('--presets')) {
    const secrets=await secretStatus();
    const keyOf=p=>p.source==='novelai'?secrets.novelai:p.source==='openai'?!!secrets[apiSecret(p.openai.url)]:true;
    print({presets:all.map(p=>({id:p.id,name:presetName(p),source:p.source,uses:p.uses.map(u=>USE_LABELS[u]??u),key:keyOf(p),
      rewrites:!!p.format?.notes}))});
    return;
  }
  const {loaded,catalog}=await load(projectPath);
  const scheme=validateImageScheme(loaded.project.imageScheme,all);
  const presetOf=({asset,image})=>all.find(p=>p.id===(scheme.overrides[image.key]??scheme.uses[imageUse(asset,image)]))??null;
  const missing=images(catalog).filter(x=>x.image.prompt!=null&&!x.image.bound);

  if(flag('--list')) {
    const log=await readGenerated(projectPath);
    const list=(flag('--missing')?missing:images(catalog).filter(x=>x.image.prompt!=null||x.image.bound)).map(x=>{
      const preset=presetOf(x);
      let plan=null,problem=null;
      if(!preset)problem='生图方案里没有这类图的预设';
      else try{plan=planDrawing({preset,asset:x.asset,image:x.image,cast:(x.asset.cast??[]).map(c=>({name:c.label,look:c.look,picture:false}))});}
      catch(error){problem=error.message;}
      return {key:x.image.key,name:nameOf(x),category:x.asset.cat,bound:!!x.image.bound,file:fileOf(log,x.image),
        ...(x.image.bound?{size:`${x.image.bound.width}×${x.image.bound.height}`}:{}),
        ...(x.image.bound?.crop?{crop:x.image.bound.crop}:{}),preset:preset?presetName(preset):null,
        // The size asked of the service; models with fixed sizes and upscaling workflows return other sizes.
        ...(plan?{request:`${plan.width}×${plan.height}`,promptSource:plan.source,...(plan.pending?{pending:'该预设要求按写法改写，这张还没有改写稿'}:{}),
          // The text to edit: a CG's cast lines and @1–@3 names are added when it is sent, so they are not part of it.
          prompt:chosenPrompt(preset,x.image,false).prompt,...(plan.prompt!==chosenPrompt(preset,x.image,false).prompt?{sent:plan.prompt}:{}),
          // A variant drawn by editing its default image sends this instead (set with --prompt <key>#edit).
          ...(x.image.editPrompt!==undefined&&canEdit(preset)?{editPrompt:chosenPrompt(preset,x.image,true).prompt}:{})}:{}),
        ...(problem?{problem}:{})};
    });
    print({scheme:{uses:Object.fromEntries(Object.entries(scheme.uses).map(([u,id])=>[USE_LABELS[u]??u,presetName(all.find(p=>p.id===id))]))},images:list});
    return;
  }

  if(flag('--draw')||flag('--missing')) {
    const limit=Number(option('--limit')??Infinity);
    const keys=flag('--draw')?String(option('--draw')??'').split(',').map(s=>s.trim()).filter(Boolean)
      :missing.filter(x=>presetOf(x)).map(x=>x.image.key).slice(0,limit);
    if(!keys.length){print({drawn:[],note:'没有要生成的图片。'});return;}
    // The queue reports each picture's timing on the console; keep stdout for the result.
    console.log=(...line)=>console.error(...line);
    const generation=createGeneration({presets:imagePresets,load,serial:(_key,task)=>task(),refresh:async()=>{}});
    try{await generation.start(projectPath,keys);}
    catch(error){throw new Error(error.message);}
    const state=await generation.wait(projectPath);
    const after=await load(projectPath),log=await readGenerated(projectPath);
    const byKey=new Map(images(after.catalog).map(x=>[x.image.key,x.image]));
    process.stdout.write(JSON.stringify({drawn:state.items.map(i=>({key:i.key,name:i.name,preset:i.preset,state:i.state,
      ...(i.error?{error:i.error}:{}),...(i.state==='done'?{file:fileOf(log,byKey.get(i.key))}:{})}))},null,2)+'\n');
    return;
  }

  if(flag('--prompt')) {
    // <key>#edit is a variant's edit instruction, sent when the preset edits the default image.
    const key=option('--prompt'),[target,part]=String(key).split('#'),found=images(catalog).find(x=>x.image.key===target);
    if(!found||part!==undefined&&part!=='edit')throw new Error(`没有这张图：${key}`);
    if(part==='edit'&&found.image.editPrompt===undefined)throw new Error(`这张图没有编辑提示词：${target}`);
    const text=flag('--clear')?'':option('--text-file')?await readFile(option('--text-file'),'utf8'):option('--text');
    if(text===undefined)throw new Error('写 --text "…"、--text-file <文件> 或 --clear。');
    await setPromptOverride(projectPath,key,text);
    print({key,prompt:text.trim()||null,note:text.trim()?'已设为手动改写，生成时优先使用':'已清除手动改写'});
    return;
  }

  if(flag('--crop')) {
    const key=option('--crop'),found=images(catalog).find(x=>x.image.key===key);
    if(!found||found.asset.cat!=='character')throw new Error(`没有这张立绘：${key}`);
    const bound=found.image.bound;
    if(!bound)throw new Error('这张立绘还没有图片。');
    // --file measures the PNG original of a portrait registered as WebP; it must have the bound picture's size.
    const bytes=option('--file')?new Uint8Array(await readFile(option('--file')))
      :new Uint8Array(await loaded.characterImages.images[bound.imageId].blob.arrayBuffer());
    if(imageType(bytes)!=='image/png')throw new Error('只能量 PNG 立绘；登记的是 WebP 时用 --file 指向同尺寸的 PNG 原图。');
    const picture=decodePng(bytes),{width,height}=picture;
    if(width!==bound.width||height!==bound.height)throw new Error(`原图 ${width}×${height} 与登记的立绘 ${bound.width}×${bound.height} 尺寸不同。`);
    // A value up to 1 is a fraction of the height (of the width for --center); larger values are pixels.
    const at=(name,size)=>{const v=option(name);if(v===undefined)return undefined;const n=Number(v);if(!Number.isFinite(n))throw new Error(`${name} 无效`);return n<=1?n*size:n;};
    let measured={top:NaN,center:width/2,clavicle:null};
    try{measured=measurePortrait(picture);}catch(error){if(at('--top',height)===undefined||at('--clavicle',height)===undefined)throw error;}
    const top=at('--top',height)??measured.top,clavicle=at('--clavicle',height)??measured.clavicle,center=at('--center',width)??measured.center;
    const preview=path.resolve(option('--preview')??path.join(path.dirname(projectPath),'review',`avatar-${key.replace(/[^\w-]+/g,'_')}.png`));
    const guides=preview.replace(/\.png$/i,'')+'-guides.png';
    await mkdir(path.dirname(preview),{recursive:true});
    if(clavicle==null) {
      await writeFile(guides,encodePng(guidePixels(picture,null)));
      throw new Error(`估不出锁骨位置；看 ${guides} 的刻度后用 --clavicle 给出（图高的比例或像素）。`);
    }
    const crop=avatarCropFor({width,height},{top,clavicle,center});
    await writeFile(preview,encodePng(cropPixels(picture,crop)));
    await writeFile(guides,encodePng(guidePixels(picture,crop)));
    if(flag('--save'))await adjustPortrait(projectPath,found.image.target,{crop});
    print({key,size:`${width}×${height}`,top:+(top/height).toFixed(3),clavicle:+(clavicle/height).toFixed(3),
      ...(option('--clavicle')===undefined?{clavicleEstimated:true}:{}),
      ...(top-crop.y<CROP.headroom*crop.size-1?{warning:'发顶贴近图顶，框顶留不出空白；头像可用，立绘取景顶部过满'}:{}),
      crop,preview,guides,saved:flag('--save')});
    return;
  }
  throw new Error('写 --presets、--list、--draw／--missing、--prompt 或 --crop。');
}

main().catch(error=>{console.error(error.message);process.exit(1);});
