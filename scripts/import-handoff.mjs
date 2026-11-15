import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodeText,numberSource,numberedText,splitBatches,sourcePacket} from '../src/conversion/workflow.js';
import {imageHeader} from '../src/core/image-header.js';
import {HANDOFF_SCHEMA,lineSources,handoffChapters,readGlossary,readRefs,visualProfileSeed,directorReferences} from '../src/conversion/handoff.js';

const usage='用法：node scripts/import-handoff.mjs "交接包目录" --out "新输出目录" [--highlights cg|extra] [--max-chars 12000]';
const EXTENSIONS={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
try {
  const args=process.argv.slice(2),input=args.shift(),options={};
  if(!input||input.startsWith('--'))throw new Error(usage);
  while(args.length) {
    const flag=args.shift(),value=args.shift();
    if(!['--out','--highlights','--max-chars'].includes(flag)||value===undefined||Object.hasOwn(options,flag))throw new Error(usage);
    options[flag]=value;
  }
  if(!options['--out'])throw new Error(usage);
  // Highlights are composition references for CGs over the same passage (cg), or gallery pictures in Extra (extra).
  const highlights=options['--highlights']??'cg';
  if(!['cg','extra'].includes(highlights))throw new Error('--highlights 须为 cg（作 CG 的构图参考）或 extra（放进 Extra 图集）。');
  const root=path.resolve(input),inside=file=>path.resolve(root,file);
  const optional=async file=>readFile(inside(file)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  const manifestBytes=await optional('handoff.json');
  const manifest=manifestBytes?JSON.parse(manifestBytes.toString('utf8')):{};
  if(manifest.lineBase!==undefined&&manifest.lineBase!==1)throw new Error('交接包行号须从 1 开始（lineBase:1）。');
  // refs and glossary may be embedded in the manifest as arrays, or named as files (refs/refs.json, glossary.json by default).
  const listed=async(value,fallback)=>{
    if(Array.isArray(value))return value;
    if(value!==undefined&&typeof value!=='string')throw new Error('handoff.json 的 refs／glossary 须为数组或文件路径。');
    const bytes=await optional(value??fallback);
    return bytes?JSON.parse(bytes.toString('utf8')):null;
  };
  if(manifest.text!==undefined&&typeof manifest.text!=='string')throw new Error('handoff.json 的 text 须为文件路径。');
  const files={text:manifest.text??'text.txt'};
  const map=numberSource(decodeText(await readFile(inside(files.text)),'utf-8'));
  const range=lineSources(map);
  const rawRefs=await listed(manifest.refs,'refs/refs.json')??[],rawGlossary=await listed(manifest.glossary,'glossary.json');
  // Reference files are package-relative; read them first so sizes and types can be checked.
  const images=new Map();
  for(const ref of Array.isArray(rawRefs)?rawRefs:[])if(typeof ref?.file==='string'&&!images.has(ref.file))
    images.set(ref.file,await readFile(inside(ref.file)).catch(()=>null));
  const {refs,warnings}=readRefs(rawRefs,map,range,file=>{const bytes=images.get(file);return bytes&&imageHeader(bytes);});
  const glossary=rawGlossary?readGlossary(rawGlossary):[];
  const chapters=handoffChapters(map,range,manifest.chapters);

  const dir=path.resolve(options['--out']);
  await mkdir(path.dirname(dir),{recursive:true});
  await mkdir(dir); // An existing output directory is refused, as with number-source.
  const batches=splitBatches(map.paragraphs,Number(options['--max-chars']||12000));
  await writeFile(path.join(dir,'source-numbered.txt'),numberedText(map.paragraphs),'utf8');
  await writeFile(path.join(dir,'source-map.json'),JSON.stringify(map,null,2),'utf8');
  await mkdir(path.join(dir,'batches'));
  for(const [i,batch] of batches.entries())
    await writeFile(path.join(dir,'batches',`batch-${String(i+1).padStart(3,'0')}.txt`),sourcePacket(map,batch),'utf8');
  for(const ref of refs.filter(r=>r.kind!=='highlight'||highlights==='cg')) {
    await mkdir(path.dirname(path.join(dir,ref.file)),{recursive:true});await copyFile(inside(ref.file),path.join(dir,ref.file));
  }
  // In the gallery a highlight is stored by content hash like an EPUB image; it is never placed inside a scene.
  const stored={},placements=[],gallery=highlights==='extra'?refs.filter(r=>r.kind==='highlight'):[];
  if(gallery.length)await mkdir(path.join(dir,'images'));
  for(const ref of gallery) {
    const bytes=images.get(ref.file),header=imageHeader(bytes),id=createHash('sha256').update(bytes).digest('hex');
    if(!stored[id]) {
      const file=`images/${id}.${EXTENSIONS[header.type]}`;
      stored[id]={file,name:path.basename(ref.file).slice(0,255),caption:ref.name.slice(0,100),type:header.type,width:header.width,height:header.height};
      await writeFile(path.join(dir,file),bytes);
    }
    placements.push({imageId:id,after:null});
  }
  const book={schema:HANDOFF_SCHEMA,title:manifest.title??null,author:manifest.author??null,chapters,images:stored,cover:null,placements,
    refs:refs.map(({fromIndex,toIndex,...ref})=>ref),warnings};
  const outputs={'handoff.json':book,'visual-profiles.json':visualProfileSeed(refs),'terms.json':glossary,'references.json':directorReferences(highlights==='cg'?refs:refs.filter(r=>r.kind!=='highlight'))};
  for(const [name,value] of Object.entries(outputs))await writeFile(path.join(dir,name),JSON.stringify(value,null,2)+'\n','utf8');
  const count=kind=>refs.filter(r=>r.kind===kind).length;
  console.log(JSON.stringify({ok:true,output:dir,paragraphs:map.paragraphs.length,batches:batches.length,chapters:chapters.length,
    refs:{characters:count('character'),locations:count('location'),props:count('prop'),highlights:count('highlight')},terms:glossary.length,warnings},null,2));
} catch(error) {
  console.error(JSON.stringify({ok:false,error:error.code==='EEXIST'?'输出目录已存在，请使用新的目录；没有覆盖旧文件。':error.message},null,2));
  process.exitCode=1;
}
