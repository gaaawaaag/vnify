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
//   node scripts/draw-images.mjs <project.json> --sheet [all|<category>|<key,key…>] [--cols N] [--per-page N] [--out <dir-or-png>]
//   node scripts/draw-images.mjs <project.json> --crop-sheet [<key,key…>] [--mode guides|preview] [--cols N] [--per-page N] [--out <dir-or-png>]
//   node scripts/draw-images.mjs <project.json> --crop-batch <crops.json> [--save] [--cols N] [--per-page N] [--out <dir-or-png>]
//   node scripts/draw-images.mjs <project.json> --search "<English words>" [--sources pexels,pixabay] --out <hits.json>
//   node scripts/draw-images.mjs <project.json> --use <key> --hits <hits.json> --n <n>
// --search looks in the photo libraries (keys in the workbench) in the book's orientation; --use binds hit n (from 0) to a
// background or ambient picture, credited by library and author.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadDirectorProject} from '../src/production/director-project.js';
import {assetCatalog} from '../src/production/asset-catalog.js';
import {readDirectors} from '../src/core/director.js';
import {validateImagePresets,validateImageScheme,imageUse,presetName,apiSecret,canEdit,USE_LABELS} from '../src/production/image-presets.js';
import {planDrawing} from '../src/production/image-generation.js';
import {chosenPrompt} from '../src/production/prompt-formats.js';
import {setPromptOverride,adjustPortrait,adjustPortraitsBatch} from '../src/production/director-edits.js';
import {readGenerated} from '../src/production/generation-log.js';
import {secretStatus} from '../src/production/secrets.js';
import {decodePng,encodePng} from '../src/production/png.js';
import {imageType} from '../src/reader/backgrounds.js';
import {measurePortrait,avatarCropFor,cropPixels,guidePixels} from '../src/production/avatar-crop.js';
import {decodeToRgba,renderContactSheet} from '../src/production/contact-sheet.js';
import {CROP} from '../src/reader/figure-layout.js';
import {createGeneration} from '../src/server/generation.mjs';
import {searchImages,bindHit} from '../src/production/image-library.js';
import {IMAGE_SEARCH_SOURCES} from '../src/production/image-search.js';

const args=process.argv.slice(2);
const flag=name=>args.includes(name);
const option=name=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:undefined;};
const optionalValue=name=>{const v=option(name);return v!==undefined&&!v.startsWith('--')?v:undefined;};
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

  if(flag('--search')) {
    const out=option('--out'),sources=option('--sources')?.split(',').map(x=>x.trim()).filter(Boolean)??[...IMAGE_SEARCH_SOURCES];
    if(!out||sources.some(x=>!IMAGE_SEARCH_SOURCES.includes(x)))throw new Error(`写 --out <hits.json>；--sources 只能是 ${IMAGE_SEARCH_SOURCES.join('、')}。`);
    const ratio=loaded.project.options?.ratio??'16:9',[w,h]=String(ratio).split(':').map(Number);
    const found=await searchImages(String(option('--search')??''),{sources,orientation:w<h?'portrait':'landscape'});
    await writeFile(path.resolve(out),JSON.stringify(found,null,2)+'\n');
    print({notes:found.notes,hits:found.results.map((hit,n)=>({n,source:hit.source,name:hit.name,author:hit.author,size:`${hit.width}×${hit.height}`}))});
    return;
  }
  if(flag('--use')) {
    const key=option('--use'),found=images(catalog).find(x=>x.image.key===key);
    if(!found||!['ambient','location'].includes(found.asset.cat)||found.image.variantId)throw new Error(`图库图片只能绑定到氛围或地点背景：${key}`);
    const {results}=JSON.parse(await readFile(String(option('--hits')),'utf8')),hit=results?.[Number(option('--n'))];
    if(!hit)throw new Error(`${option('--hits')} 里没有第 ${option('--n')} 条结果。`);
    const {file}=await bindHit(projectPath,found.image.target,hit);
    print({ok:true,key,file:path.resolve(path.dirname(projectPath),file),credit:`${hit.source} · ${hit.author}`});
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

  /** Helper: reads raw bytes of any bound image from loaded project assets. */
  const boundBytesOf=async({asset,image})=>{
    const id=image.bound.imageId;
    const rec=asset.cat==='character'?loaded.characterImages.images[id]:loaded.backgrounds.images[id];
    if(!rec?.blob)throw new Error(`找不到已绑定图片数据：${image.key}`);
    return new Uint8Array(await rec.blob.arrayBuffer());
  };
  /** Helper: writes paginated contact sheets and returns page metadata. */
  const writeSheets=async(entries,baseName,{cols,perPage,tileWidth,tileHeight,outOpt})=>{
    const outBase=outOpt?path.resolve(outOpt):path.join(path.dirname(projectPath),'review',baseName);
    const isPng=/\.png$/i.test(outBase);
    const dir=isPng?path.dirname(outBase):outBase;
    const stem=isPng?path.basename(outBase).replace(/\.png$/i,''):baseName;
    await mkdir(dir,{recursive:true});
    const sheets=[];
    const pages=Math.ceil(entries.length/perPage);
    for(let p=0;p<pages;p++) {
      const slice=entries.slice(p*perPage,(p+1)*perPage);
      const sheetRgba=renderContactSheet(slice.map(e=>({label:e.label,image:e.rgba})),{cols,tileWidth,tileHeight});
      const file=isPng&&pages===1?outBase:path.join(dir,`${stem}-${String(p+1).padStart(2,'0')}.png`);
      await writeFile(file,encodePng(sheetRgba));
      sheets.push({file,tiles:slice.map(e=>e.meta)});
    }
    return sheets;
  };
  const gridOption=(name,fallback)=>{const v=option(name);if(v===undefined)return fallback;const n=Number(v);if(!Number.isInteger(n)||n<1)throw new Error(`${name} 须为正整数。`);return n;};

  const standingLabel=key=>{
    const rest=key.replace(/^standing:/,'');
    const [charId,variantId]=rest.split(':');
    return variantId?(variantId.startsWith(`${charId}.`)?variantId:rest):charId;
  };
  if(flag('--sheet')) {
    const filter=optionalValue('--sheet')??'all';
    const cols=gridOption('--cols',4),perPage=gridOption('--per-page',16);
    const allBound=images(catalog).filter(x=>x.image.bound);
    const categories=new Set(['cover','ambient','location','character','cg','cutin']);
    let selected=allBound;
    if(filter!=='all') {
      if(filter==='standing')selected=allBound.filter(x=>x.asset.cat==='character');
      else if(filter==='background')selected=allBound.filter(x=>['ambient','location'].includes(x.asset.cat));
      else if(categories.has(filter))selected=allBound.filter(x=>x.asset.cat===filter);
      else {
        const wanted=new Set(filter.split(',').map(s=>s.trim()).filter(Boolean));
        selected=allBound.filter(x=>wanted.has(x.image.key));
      }
    }
    if(!selected.length)throw new Error(`没有匹配 "${filter}" 的已绑定图片。`);
    const log=await readGenerated(projectPath);
    const entries=[];
    for(let i=0;i<selected.length;i++) {
      const x=selected[i];
      const rgba=await decodeToRgba(await boundBytesOf(x));
      const shortKey=x.image.key.startsWith('standing:')?`st:${standingLabel(x.image.key)}`
        :x.image.key.replace(/^background:/,'bg:').replace(/^cg:cgs:/,'cg:');
      entries.push({label:`${i+1} ${shortKey}`,rgba,meta:{n:i+1,key:x.image.key,name:nameOf(x),category:x.asset.cat,
        size:`${x.image.bound.width}×${x.image.bound.height}`,file:fileOf(log,x.image)}});
    }
    const sheets=await writeSheets(entries,'sheet',{cols,perPage,tileWidth:320,tileHeight:320,outOpt:option('--out')});
    print({total:entries.length,sheets});
    return;
  }

  if(flag('--crop-sheet')) {
    const filter=optionalValue('--crop-sheet');
    const mode=option('--mode')??'guides';
    if(!['guides','preview'].includes(mode))throw new Error('--mode 只能是 guides 或 preview。');
    const cols=gridOption('--cols',4),perPage=gridOption('--per-page',16);
    let selected=images(catalog).filter(x=>x.asset.cat==='character'&&x.image.bound);
    if(filter&&filter!=='all') {
      const wanted=new Set(filter.split(',').map(s=>s.trim()).filter(Boolean));
      selected=selected.filter(x=>wanted.has(x.image.key));
    }
    if(!selected.length)throw new Error('没有可检查头像裁切的已绑定立绘。');
    const entries=[];
    for(let i=0;i<selected.length;i++) {
      const x=selected[i],bound=x.image.bound;
      const rgba=await decodeToRgba(await boundBytesOf(x));
      let crop=bound.crop??null,estimated=false,top=null,clavicle=null,center=null,warning=null;
      if(!crop) {
        try {
          const m=measurePortrait(rgba);
          top=+(m.top/rgba.height).toFixed(3);center=+(m.center/rgba.width).toFixed(3);
          if(m.clavicle!=null){clavicle=+(m.clavicle/rgba.height).toFixed(3);crop=avatarCropFor(rgba,m);estimated=true;}
          else warning='估不出锁骨位置，请看刻度后指定 clavicle';
        } catch(e){warning=e.message;}
      } else {
        clavicle=+((crop.y+crop.size)/rgba.height).toFixed(3);
        center=+((crop.x+crop.size/2)/rgba.width).toFixed(3);
      }
      if(mode==='preview'&&!crop)throw new Error(`${x.image.key} 无法生成预览：${warning??'缺少裁切框'}`);
      const tileRgba=mode==='preview'?cropPixels(rgba,crop):guidePixels(rgba,crop);
      const shortKey=standingLabel(x.image.key);
      entries.push({label:`${i+1} ${shortKey}`,rgba:tileRgba,meta:{n:i+1,key:x.image.key,name:nameOf(x),
        size:`${bound.width}×${bound.height}`,saved:Boolean(bound.crop),estimated,
        ...(top!=null?{top}:{}),...(clavicle!=null?{clavicle}:{}),...(center!=null?{center}:{}),
        ...(crop?{crop}:{}),...(warning?{warning}:{})}});
    }
    const tileWidth=mode==='preview'?240:280,tileHeight=mode==='preview'?240:420;
    const sheets=await writeSheets(entries,`crop-${mode}`,{cols,perPage,tileWidth,tileHeight,outOpt:option('--out')});
    print({mode,total:entries.length,sheets});
    return;
  }

  if(flag('--crop-batch')) {
    const specFile=option('--crop-batch');
    if(!specFile)throw new Error('写 --crop-batch <crops.json>。');
    const rawSpec=JSON.parse(await readFile(specFile,'utf8'));
    const list=Array.isArray(rawSpec)?rawSpec:rawSpec&&typeof rawSpec==='object'
      ?Object.entries(rawSpec).map(([key,v])=>({key,...(v&&typeof v==='object'?v:{})})):null;
    if(!list||!list.length)throw new Error('批量裁切文件须为非空数组或 {key:{clavicle,top?,center?,file?}} 对象。');
    const cols=gridOption('--cols',4),perPage=gridOption('--per-page',16);
    const byKey=new Map(images(catalog).filter(x=>x.asset.cat==='character').map(x=>[x.image.key,x]));
    const updates=[],entries=[],results=[];
    const atVal=(value,size,name)=>{if(value===undefined||value===null)return undefined;const n=Number(value);if(!Number.isFinite(n))throw new Error(`${name} 无效`);return n<=1?n*size:n;};
    for(let i=0;i<list.length;i++) {
      const spec=list[i],key=String(spec?.key??''),found=byKey.get(key);
      if(!found)throw new Error(`没有这张立绘：${key}`);
      const bound=found.image.bound;
      if(!bound)throw new Error(`这张立绘还没有图片：${key}`);
      const bytes=spec.file?new Uint8Array(await readFile(path.resolve(path.dirname(path.resolve(specFile)),spec.file))):await boundBytesOf(found);
      const picture=await decodeToRgba(bytes),{width,height}=picture;
      if(width!==bound.width||height!==bound.height)throw new Error(`${key} 原图 ${width}×${height} 与登记的立绘 ${bound.width}×${bound.height} 尺寸不同。`);
      const specTop=atVal(spec.top,height,'top'),specClavicle=atVal(spec.clavicle,height,'clavicle'),specCenter=atVal(spec.center,width,'center');
      let measured={top:NaN,center:width/2,clavicle:null};
      try{measured=measurePortrait(picture);}catch(error){if(specTop===undefined||specClavicle===undefined)throw new Error(`${key}: ${error.message}`);}
      const top=specTop??measured.top,clavicle=specClavicle??measured.clavicle,center=specCenter??measured.center;
      if(clavicle==null)throw new Error(`${key} 估不出锁骨位置，请在批量文件里给出 clavicle。`);
      const crop=avatarCropFor({width,height},{top,clavicle,center});
      const warning=top-crop.y<CROP.headroom*crop.size-1?'发顶贴近图顶，框顶留不出空白；头像可用，立绘取景顶部过满':undefined;
      updates.push({target:found.image.target,crop});
      const item={n:i+1,key,name:nameOf(found),size:`${width}×${height}`,top:+(top/height).toFixed(3),
        clavicle:+(clavicle/height).toFixed(3),center:+(center/width).toFixed(3),crop,...(warning?{warning}:{})};
      results.push(item);
      entries.push({label:`${i+1} ${standingLabel(key)}`,rgba:cropPixels(picture,crop),meta:item});
    }
    if(flag('--save'))await adjustPortraitsBatch(projectPath,updates);
    const sheets=await writeSheets(entries,'crop-batch-preview',{cols,perPage,tileWidth:240,tileHeight:240,outOpt:option('--out')??option('--sheet-out')});
    print({saved:flag('--save'),count:results.length,items:results,sheets});
    return;
  }
  throw new Error('写 --presets、--list、--draw／--missing、--prompt、--crop、--sheet、--crop-sheet 或 --crop-batch。');
}

main().catch(error=>{console.error(error.message);process.exit(1);});
