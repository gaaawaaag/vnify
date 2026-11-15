import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {assembleAgentProject,renderContext} from '../src/conversion/agent-project.js';
import {readSourceMap} from '../src/conversion/workflow.js';
import {expandShorthand,SHORTHAND_SUFFIX} from '../src/conversion/shorthand.js';
import {sourceExtra,hasExtra} from '../src/core/extra.js';
import {HANDOFF_SCHEMA} from '../src/conversion/handoff.js';
import {emptyBackgrounds,imageId} from '../src/reader/backgrounds.js';
import {exportStoryPackage} from '../src/reader/story-package.js';

const usage='node scripts/assemble-vn.mjs <project.json> [--body-only] [--out <story.vn.txt>] [--context <context.txt> [--context-range <首来源>-<尾来源>]] [--lengths] [--package <story.vn.zip>]';
try {
  const args=process.argv.slice(2);
  if(args.length===1 && args[0]==='--help') {
    console.log(usage);
  } else {
    const input=args.shift(),options={};
    if(!input || input.startsWith('--'))throw new Error(usage);
    while(args.length) {
      const flag=args.shift();
      if(!['--body-only','--lengths','--out','--context','--context-range','--package'].includes(flag) || Object.hasOwn(options,flag))throw new Error(usage);
      if(['--body-only','--lengths'].includes(flag)){options[flag]=true;continue;}
      const value=args.shift();
      if(!value || value.startsWith('--'))throw new Error(usage);
      options[flag]=value;
    }
    if(options['--context-range']&&!options['--context'])throw new Error('--context-range 须与 --context 同用。');
    const range=options['--context-range']?.match(/^([^\s-]+)-([^\s-]+)$/);
    if(options['--context-range']&&!range)throw new Error('--context-range 写作 首来源-尾来源，例如 p000958-p001371。');
    const projectPath=path.resolve(input),base=path.dirname(projectPath);
    const project=JSON.parse(await readFile(projectPath,'utf8'));
    if(typeof project.sourceMap!=='string' || !Array.isArray(project.parts) || (project.dossiers!==undefined && !Array.isArray(project.dossiers)))throw new Error('制作清单需要 sourceMap、parts 数组及可选 dossiers 数组。');
    const resolveInput=file=>{
      if(typeof file!=='string' || !file)throw new Error('输入文件路径不能为空。');
      return path.resolve(base,file);
    };
    const sourcePath=resolveInput(project.sourceMap);
    const partPaths=project.parts.map(p=>resolveInput(p.script));
    const dossierPaths=(project.dossiers ?? []).map(d=>resolveInput(d.file));
    if(options['--package']&&options['--body-only'])throw new Error('作品包须完整验收，不能与 --body-only 同用。');
    // Original images come from number-source's epub.json or import-handoff's handoff.json, never both.
    if(project.epub!==undefined&&project.handoff!==undefined)throw new Error('清单只能登记 epub 或 handoff 之一。');
    const epubPath=project.epub===undefined?project.handoff===undefined?null:resolveInput(project.handoff):resolveInput(project.epub);
    const outputs=['--out','--context','--package'].filter(k=>options[k]).map(k=>path.resolve(options[k]));
    const canonical=p=>process.platform==='win32'?p.toLowerCase():p;
    const inputs=new Set([projectPath,sourcePath,...partPaths,...dossierPaths,...(epubPath?[epubPath]:[])].map(canonical));
    if(outputs.some(p=>inputs.has(canonical(p))) || new Set(outputs.map(canonical)).size!==outputs.length)throw new Error('输出路径须与输入文件和其他输出分开。');
    const [source,scripts,dossiers]=await Promise.all([
      readFile(sourcePath,'utf8').then(JSON.parse),
      Promise.all(partPaths.map(p=>readFile(p,'utf8'))),
      Promise.all(dossierPaths.map(p=>readFile(p,'utf8'))),
    ]);
    // Shorthand drafts expand against the source map before merging; the rest of the checks see normal parts.
    if(partPaths.some(p=>p.endsWith(SHORTHAND_SUFFIX))) {
      const map=readSourceMap(source);
      partPaths.forEach((p,i)=>{
        if(!p.endsWith(SHORTHAND_SUFFIX))return;
        const {from,to}=project.parts[i];
        try {scripts[i]=expandShorthand(scripts[i],map,{from,to}).script;}
        catch(error) {throw new Error(`${project.parts[i].script}：${error.message}`);}
      });
    }
    const result=assembleAgentProject(project,source,scripts,dossiers,{bodyOnly:Boolean(options['--body-only']),lengths:Boolean(options['--lengths'])});
    for(const [flag,content] of [['--out',result.output],['--context',options['--context']?renderContext(result.context,source,range?{from:range[1],to:range[2]}:null):'']]) {
      if(options[flag]) {
        const target=path.resolve(options[flag]);
        await mkdir(path.dirname(target),{recursive:true});
        await writeFile(target,content,'utf8');
      }
    }
    if(options['--package']) {
      const book=epubPath?await epubImages(epubPath,readSourceMap(source)):null;
      const extra=sourceExtra(readSourceMap(source),result.extraSource.ranges,book,result.extraSource.excluded);
      const zip=await exportStoryPackage(result.output,emptyBackgrounds(project.book.id),
        {complete:result.report.sourceComplete,extra:hasExtra(extra)?extra:null});
      const target=path.resolve(options['--package']);
      await mkdir(path.dirname(target),{recursive:true});
      await writeFile(target,new Uint8Array(await zip.arrayBuffer()));
      result.report.package={extraTexts:extra.items.length,illustrations:extra.illustrations.length,gallery:extra.gallery.length,cover:!!extra.cover};
    }
    console.log(JSON.stringify(result.report,null,2));
  }
} catch(error) {
  console.error(JSON.stringify({ok:false,error:error.message},null,2));
  process.exitCode=1;
}

// epub.json (number-source) or handoff.json (import-handoff): image files beside it, placements by source ID.
// A handoff only places images in the gallery (after:null); EPUB illustrations sit after their source.
async function epubImages(file,map) {
  const data=JSON.parse(await readFile(file,'utf8')),base=path.dirname(file);
  if(!['vn-epub-1',HANDOFF_SCHEMA].includes(data?.schema)||!data.images||typeof data.images!=='object'||!Array.isArray(data.placements))
    throw new Error('epub／handoff 需要 number-source 生成的 vn-epub-1 或 import-handoff 生成的 vn-handoff-1 数据。');
  const positions=new Map(map.paragraphs.map((p,i)=>[p.id,i])),images={};
  for(const [id,img] of Object.entries(data.images)) {
    const blob=new Blob([await readFile(path.resolve(base,img.file))],{type:img.type});
    if(await imageId(blob)!==id)throw new Error(`原书图片与 epub.json 不一致：${img.file}`);
    images[id]={name:img.name,...(img.caption?{caption:img.caption}:{}),type:img.type,width:img.width,height:img.height,blob};
  }
  const placements=data.placements.map(p=>{
    const mismatch=()=>{throw new Error('图片位置与来源映射不一致。');};
    if(!Object.hasOwn(images,p.imageId))mismatch();
    const after=p.after===null?-1:positions.get(p.after);
    if(after===undefined)mismatch();
    return {imageId:p.imageId,after};
  });
  return {images,placements,cover:data.cover??null};
}
