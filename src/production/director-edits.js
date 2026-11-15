// @ts-check
import {readFile,writeFile,mkdir,rename,access,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadDirectorProject} from './director-project.js';
import {imageSize} from './image-size.js';
import {imageType,IMAGE_TYPES} from '../reader/backgrounds.js';
import {exportStoryPackage,importStoryPackage} from '../reader/story-package.js';
import {readDirectors,DIRECTOR_VERSION} from '../core/director.js';
import {parseScript,checkBookInfo} from '../core/parser.js';
import {DIRECTOR_IMAGE_FLAGS} from '../core/director-generation.js';
import {checkStature} from '../core/variants.js';
import {fixedStylesOf} from '../conversion/director.js';
import {RATIOS} from './presets.js';
import {packageImages,validateExportImages} from './webp.js';

/* Changes the asset manager makes to a director project. Each one is checked by loading the changed project in memory
 * first, so a rejected change writes nothing. Director drafts and the design are never overwritten: an edited one is
 * saved as a revision (ch01.r1.json) and the project points to it. Images go to images/ beside the project. */

const exists=(/** @type {string} */ file)=>access(file).then(()=>true,()=>false);
/** @param {string} file @param {string|Uint8Array} data */
async function writeAtomic(file,data) {
  await mkdir(path.dirname(file),{recursive:true});
  const temp=`${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp,data);await rename(temp,file);
}
const json=(/** @type {any} */ value)=>JSON.stringify(value,null,2)+'\n';

// A binding target as image task IDs: title-card, standing:<character>[:<variant>], or <purpose>:<scope>:<id> per ref.
/** @param {any} t @returns {string[]} */
export const targetKeys=t=>t.purpose==='title-card'?['title-card']
  :t.purpose==='standing'?[`standing:${t.characterId}${t.variantId?`:${t.variantId}`:''}`]
  :(t.refs??[]).map((/** @type {any} */ r)=>`${t.purpose}:${r.scope}:${r.id}`);
/** @param {any} target */
function checkTarget(target) {
  const ok=target&&(target.purpose==='title-card'||(target.purpose==='standing'&&typeof target.characterId==='string')
    ||(['background','cg','cut-in'].includes(target.purpose)&&Array.isArray(target.refs)&&target.refs.length
      &&target.refs.every((/** @type {any} */ r)=>typeof r?.scope==='string'&&typeof r.id==='string')));
  if(!ok)throw new Error('图片目标无效。');
  const fields=target.purpose==='title-card'?{}:target.purpose==='standing'
    ?{characterId:target.characterId,...(target.variantId?{variantId:target.variantId}:{})}:{refs:target.refs.map((/** @type {any} */ r)=>({scope:r.scope,id:r.id}))};
  return {purpose:target.purpose,...fields};
}
const overlaps=(/** @type {any} */ entry,/** @type {string[]} */ keys)=>targetKeys(entry).some(k=>keys.includes(k));

/** @param {string} projectPath @param {any} project @param {Map<string,string>} [files] */
async function commit(projectPath,project,files=new Map()) {
  const loaded=await loadDirectorProject(projectPath,{project,files});
  for(const [file,text] of files)await writeAtomic(file,text);
  await writeAtomic(path.resolve(projectPath),json(project));
  return loaded;
}
const readProject=async(/** @type {string} */ projectPath)=>JSON.parse(await readFile(projectPath,'utf8'));

/* Binds a picture to a target, replacing what was there. record: how a generated picture was made (mode, sentPrompt,
 * seed, preset), kept on the image entry. Returns the loaded project and the file the picture went to. */
/** @param {string} projectPath @param {any} target @param {Uint8Array} bytes @param {Record<string,unknown>} [record] */
export async function bindImage(projectPath,target,bytes,record={}) {
  const t=checkTarget(target),type=imageType(bytes),{width,height}=imageSize(bytes);
  const hash=createHash('sha256').update(bytes).digest('hex'),file=`images/${hash.slice(0,16)}.${IMAGE_TYPES[type]}`;
  const filename=path.resolve(path.dirname(projectPath),file);
  if(!await exists(filename))await writeAtomic(filename,bytes);
  const project=await readProject(projectPath),keys=targetKeys(t);
  project.images=[...(project.images??[]).filter((/** @type {any} */ e)=>!overlaps(e,keys)),{file,...t,width,height,replace:true,...record}];
  return {...await commit(projectPath,project),file};
}
/** Removes a target's picture; one that came with the input package is removed by a remove entry. @param {string} projectPath @param {any} target */
export async function removeImage(projectPath,target) {
  const t=/** @type {any} */(checkTarget(target)),keys=targetKeys(t),project=await readProject(projectPath);
  project.images=(project.images??[]).filter((/** @type {any} */ e)=>!overlaps(e,keys));
  const loaded=await loadDirectorProject(projectPath,{project});
  const still=t.purpose==='title-card'?loaded.backgrounds.bindings.titleCard
    :t.purpose==='standing'?(t.variantId?loaded.characterImages.bindings[t.characterId]?.variants?.[t.variantId]:loaded.characterImages.bindings[t.characterId]?.standing)
    :t.refs.some((/** @type {any} */ r)=>/** @type {any} */(loaded.backgrounds.bindings)[r.scope]?.[r.id]);
  if(still)project.images.push({...t,remove:true});
  return commit(projectPath,project);
}
/** A bound portrait's avatar square and facing. @param {string} projectPath @param {any} target @param {{crop?:any,flip?:any}} settings */
export async function adjustPortrait(projectPath,target,settings) {
  const t=checkTarget(target);
  if(t.purpose!=='standing')throw new Error('只有立绘可以调整头像范围与朝向。');
  const keys=targetKeys(t),project=await readProject(projectPath),images=project.images??[];
  const own=images.find((/** @type {any} */ e)=>!e.remove&&!e.adjust&&overlaps(e,keys));
  const values=Object.fromEntries(['crop','flip'].filter(k=>settings[k]!=null).map(k=>[k,settings[k]]));
  if(own)Object.assign(own,values);
  else project.images=[...images.filter((/** @type {any} */ e)=>!(e.adjust&&overlaps(e,keys))),{...t,adjust:true,...values}];
  return commit(projectPath,project);
}

// The next revision name beside a draft: ch01.json → ch01.r1.json → ch01.r2.json.
/** @param {string} base @param {string} relative */
async function revisionName(base,relative) {
  const stem=relative.replace(/(\.r\d+)?\.json$/,'');
  for(let n=1;;n++){const name=`${stem}.r${n}.json`;if(!await exists(path.resolve(base,name)))return name;}
}
/* The design and every chapter record as editable objects: a chapter's draft file when the project lists one,
 * otherwise the record embedded in the input. */
/** @param {string} projectPath */
async function records(projectPath) {
  const loaded=await loadDirectorProject(projectPath),{project,base,job}=loaded;
  const design=project.design?{file:project.design,doc:JSON.parse(await readFile(path.resolve(base,project.design),'utf8'))}:null;
  const chapters=[];
  for(const {chapter} of job.plan) {
    const file=project.directors?.[chapter.id];
    if(file)chapters.push({chapterId:chapter.id,file,revision:false,doc:JSON.parse(await readFile(path.resolve(base,file),'utf8'))});
    // An embedded record (or its earlier revision) is edited as a revision of the input.
    else if(job.imported.has(chapter.id))chapters.push({chapterId:chapter.id,file:project.revisions?.[chapter.id]??null,revision:true,
      doc:JSON.parse(/** @type {string} */(job.imported.get(chapter.id)))});
  }
  return {loaded,project,base,design,chapters};
}
/** @param {string} projectPath @param {Awaited<ReturnType<typeof records>>} set @param {Set<any>} changed */
async function saveRevisions(projectPath,{project,base,design,chapters},changed) {
  const files=new Map();
  project.directors={...project.directors};project.revisions={...project.revisions};
  if(design&&changed.has(design)) {
    const name=await revisionName(base,design.file);files.set(path.resolve(base,name),json(design.doc));project.design=name;
  }
  for(const record of chapters)if(changed.has(record)) {
    const first=`revisions/${record.chapterId}.json`;
    const name=record.file?await revisionName(base,record.file):await exists(path.resolve(base,first))?await revisionName(base,first):first;
    files.set(path.resolve(base,name),json(record.doc));
    if(record.revision)project.revisions[record.chapterId]=name;else project.directors[record.chapterId]=name;
  }
  for(const field of ['directors','revisions'])if(!Object.keys(project[field]).length)delete project[field];
  return commit(projectPath,project,files);
}

/**
 * Rewrites one image's description wherever the design and the chapter records carry it.
 * @param {string} projectPath @param {any} edit the catalog's edit reference @param {{prompt?:string,face?:string,body?:string}} value
 */
export async function editDescription(projectPath,edit,value) {
  const set=await records(projectPath),{project,design,chapters}=set,changed=new Set();
  const text=(/** @type {any} */ v)=>{if(typeof v!=='string'||!v.trim())throw new Error('描述不能为空。');return v.trim();};
  const all=[...(design?[design]:[]),...chapters];
  /** @param {string} field @param {(item:any)=>boolean} match @param {(item:any)=>void} apply */
  const each=(field,match,apply)=>{for(const record of all)for(const item of record.doc[field]??[])if(match(item)){apply(item);changed.add(record);}};
  if(edit?.kind==='cover') {
    if(design){design.doc.titleCard={prompt:text(value.prompt)};changed.add(design);}
    else project.titleCard={prompt:text(value.prompt)};
  } else if(edit?.kind==='ambient')each('ambients',a=>a.id===edit.id,a=>{a.prompt=text(value.prompt);});
  else if(edit?.kind==='location')each('backgrounds',b=>b.locations?.some((/** @type {string} */ id)=>edit.locations.includes(id)),b=>{b.prompt=text(value.prompt);});
  else if(edit?.kind==='cg')each('cgs',c=>c.id===edit.id,c=>{c.prompt=text(value.prompt);});
  else if(edit?.kind==='cutin')each('cutIns',c=>c.id===edit.id,c=>{c.prompt=text(value.prompt);});
  else if(edit?.kind==='character')each('characters',c=>c.characterId===edit.id,c=>{c.face=text(value.face);c.body=(value.body??'').trim();});
  else if(edit?.kind==='variant')each('variants',v=>v.id===edit.id,v=>{
    if(v.prompt!==undefined)v.prompt=text(value.prompt);
    else{if(v.face!==undefined||value.face)v.face=text(value.face);if(v.body!==undefined||value.body)v.body=(value.body??'').trim();}
  });
  else throw new Error('不支持的描述。');
  if(!changed.size&&edit.kind!=='cover')throw new Error('导演稿里没有找到这条描述；没有导演提示词的图片只能上传。');
  return saveRevisions(projectPath,set,changed);
}

/**
 * A character's or character variant's stature, wherever the design and the chapter records carry it; null removes it.
 * @param {string} projectPath @param {any} edit the catalog's edit reference @param {number|null} value
 */
export async function editStature(projectPath,edit,value) {
  if(value!==null)checkStature(value??NaN);
  const field=edit?.kind==='character'?'characters':edit?.kind==='variant'?'variants':null;
  if(!field)throw new Error('只有人物与人物差分可以设置身高。');
  const set=await records(projectPath),{design,chapters}=set,changed=new Set();
  for(const record of [...(design?[design]:[]),...chapters])for(const item of record.doc[field]??[]) {
    if((field==='characters'?item.characterId:item.id)!==edit.id||item.prompt!==undefined)continue;
    if(value===null)delete item.stature;else item.stature=value;
    changed.add(record);
  }
  if(!changed.size)throw new Error('导演稿里没有找到这个人物；没有导演提示词的人物不能设置身高。');
  return saveRevisions(projectPath,set,changed);
}

/** The book's two art styles: a side fixed in the project options is the user's text; the others live in the records. */
/** @param {string} projectPath @param {{background?:string,character?:string}} styles */
export async function editStyles(projectPath,styles) {
  const set=await records(projectPath),{project,loaded,design,chapters}=set,changed=new Set();
  const fixed=fixedStylesOf(loaded.job.director);
  for(const side of /** @type {const} */(['background','character'])) {
    const value=styles[side];
    if(value===undefined)continue;
    if(typeof value!=='string'||!value.trim())throw new Error('画风不能为空。');
    if(side in fixed){project.options={...project.options,[side==='background'?'backgroundStyle':'characterStyle']:value.trim()};continue;}
    for(const record of [...(design?[design]:[]),...chapters])if(record.doc.artStyles){record.doc.artStyles={...record.doc.artStyles,[side]:value.trim()};changed.add(record);}
    // Embedded records all carry the styles, so every one of them is revised together.
    for(const record of chapters)if(record.revision)changed.add(record);
  }
  return saveRevisions(projectPath,set,changed);
}

/** A prompt rewritten by hand (null or empty clears it); kept in prompts.json beside the project. */
/** @param {string} projectPath @param {string} key @param {string|null} text */
export async function setPromptOverride(projectPath,key,text) {
  if(typeof key!=='string'||!/^[\w:.#-]+$/u.test(key))throw new Error('提示词任务 ID 无效。');
  const project=await readProject(projectPath),base=path.dirname(projectPath);
  const file=project.prompts??'prompts.json',filename=path.resolve(base,file);
  const prompts=project.prompts?JSON.parse(await readFile(filename,'utf8')):{};
  if(text&&text.trim())prompts[key]=text.trim();else delete prompts[key];
  project.prompts=file;
  return commit(projectPath,project,new Map([[filename,json(prompts)]]));
}

/* The agent's rewrites for one image service preset, made under its format fingerprint (docs/prompt-formats.md); kept in
 * formatted.json beside the project. Rewrites made under an older fingerprint are dropped. */
/** @param {string} projectPath @param {string} presetId @param {string} format @param {Record<string,{text:string,source:string}>} prompts */
export async function setFormattedPrompts(projectPath,presetId,format,prompts) {
  const project=await readProject(projectPath),base=path.dirname(projectPath);
  const file=project.formatted??'formatted.json',filename=path.resolve(base,file);
  const data=project.formatted?JSON.parse(await readFile(filename,'utf8')):{version:1,presets:{}};
  const kept=data.presets[presetId]?.format===format?data.presets[presetId].prompts:{};
  data.presets[presetId]={format,prompts:{...kept,...Object.fromEntries(Object.entries(prompts).map(([k,v])=>[k,{text:v.text.trim(),source:v.source}]))}};
  project.formatted=file;
  return commit(projectPath,project,new Map([[filename,json(data)]]));
}

/** The work as .vn.zip bytes, its images as its exportImages setting says (WebP by default, cached beside the project).
 * @param {any} loaded from loadDirectorProject @param {string} projectPath */
export async function packWork(loaded,projectPath) {
  const {job,project,packed}=loaded,complete=project.complete??packed?.complete??true;
  const settings=validateExportImages(project.exportImages);
  const {backgrounds,characterImages,extra,stats}=await packageImages({backgrounds:loaded.backgrounds,characterImages:loaded.characterImages,
    extra:packed?.extra??null},settings,path.join(path.dirname(projectPath),'.cache','webp'));
  const zip=await exportStoryPackage(/** @type {string} */(job.readableOutput),backgrounds,{characterImages,complete,extra});
  return {bytes:new Uint8Array(await zip.arrayBuffer()),stats};
}
/** The work as a .vn.zip with its images, written to export/ in the work folder. @param {string} projectPath @param {string} out */
export async function exportWork(projectPath,out) {
  const {bytes,stats}=await packWork(await loadDirectorProject(projectPath),projectPath);
  await writeAtomic(out,bytes);
  return {out,stats};
}
/** Saves how a work's images go into its package. @param {string} projectPath @param {unknown} value */
export async function setExportImages(projectPath,value) {
  const project=await readProject(projectPath);
  project.exportImages=validateExportImages(value);
  return commit(projectPath,project,new Map());
}

/* The canvas images are drawn for (backgrounds, ambients, CG; the cover follows its orientation). The prompts stay as
 * they are, so a work directed for one screen can be drawn for another; later packets name the new canvas. */
/** @param {string} projectPath @param {unknown} ratio */
export async function setImageRatio(projectPath,ratio) {
  if(typeof ratio!=='string'||![...RATIOS.landscape,...RATIOS.portrait].includes(ratio))throw new Error('画面比例无效。');
  const project=await readProject(projectPath);
  project.options={...project.options,ratio};
  return commit(projectPath,project,new Map());
}

/* The title and author the exported package carries, kept in the project; the input text is never rewritten. Setting
 * them back to the input's values drops the entry. */
/** @param {string} projectPath @param {unknown} value */
export async function setBookInfo(projectPath,value) {
  const info=checkBookInfo(value),project=await readProject(projectPath);
  delete project.book;
  const {story}=await loadDirectorProject(projectPath,{project});
  if(info.title!==story.book.title||info.author!==story.book.author)project.book=info;
  return commit(projectPath,project,new Map());
}

/* A work that has only a package or a text file gets a director project, so its images can be managed. The records
 * already in the input are kept as they are, and the options repeat their image uses. */
/** @param {string} workDir @param {string} input the story file inside workDir */
export async function createDirectorProject(workDir,input) {
  const filename=path.resolve(workDir,input),bytes=await readFile(filename);
  const packed=filename.toLowerCase().endsWith('.vn.zip')?await importStoryPackage(new Blob([bytes])):null,raw=packed?.raw??bytes.toString('utf8');
  const story=parseScript(raw),docs=readDirectors(raw,story),generation=/** @type {any} */(docs[0]?.generation??{});
  // The canvas the book was made for, read from a bound ambient or location picture.
  const scene=packed&&[...Object.values(packed.backgrounds.bindings.ambients),...Object.values(packed.backgrounds.bindings.locations)]
    .map(id=>id&&packed.backgrounds.images[id]).find(Boolean);
  const ratio=scene?[...RATIOS.landscape,...RATIOS.portrait].reduce((best,r)=>{
    const [w,h]=r.split(':').map(Number),[bw,bh]=best.split(':').map(Number);
    return Math.abs(w/h-scene.width/scene.height)<Math.abs(bw/bh-scene.width/scene.height)?r:best;
  }):null;
  const options={protocolVersion:DIRECTOR_VERSION,enabled:true,titleCard:!!story.titleCard,...(ratio?{ratio}:{}),
    ...Object.fromEntries(DIRECTOR_IMAGE_FLAGS.map(flag=>[flag,generation[flag]??(docs.length?false:['standing','locationBackgrounds'].includes(flag))]))};
  const projectPath=path.join(workDir,'director','project.json');
  if(await exists(projectPath))throw new Error('这部作品已有导演清单。');
  const project={format:'vn-agent-director-1',input:path.relative(path.dirname(projectPath),filename).split(path.sep).join('/'),options};
  await loadDirectorProject(projectPath,{project});
  await writeAtomic(projectPath,json(project));
  return projectPath;
}
/** Copies a .vn.zip into a new work folder under works/ and gives it a director project. @param {string} worksDir @param {string} name @param {Uint8Array} bytes */
export async function importPackage(worksDir,name,bytes) {
  const packed=await importStoryPackage(new Blob([/** @type {BlobPart} */(bytes)]));
  const title=parseScript(packed.raw).book.title||name.replace(/\.vn\.zip$/i,'');
  const safe=title.replace(/[\\/:*?"<>|\s]+/g,'_').slice(0,60)||'work';
  let id=safe;for(let n=2;await exists(path.join(worksDir,id));n++)id=`${safe}-${n}`;
  const workDir=path.join(worksDir,id);
  await writeAtomic(path.join(workDir,`${safe}.vn.zip`),bytes);
  await createDirectorProject(workDir,`${safe}.vn.zip`);
  return id;
}

/* Works under works/: a folder with director/project.json, or one holding a finished .vn.txt or .vn.zip (text only so
 * far; opening it makes the director project). Either may sit one folder down, as in works/<作品>/convert/ or an
 * older run-01/; the newest one wins, and a new director project still goes to works/<作品>/director/. */
/** @param {string} worksDir */
export async function findWorks(worksDir) {
  const entries=await readdir(worksDir,{withFileTypes:true}).catch(()=>[]);
  const works=[];
  for(const entry of entries.filter(e=>e.isDirectory())) {
    const dir=path.join(worksDir,entry.name);
    const subs=(await readdir(dir,{withFileTypes:true})).filter(e=>e.isDirectory()&&!['director','export'].includes(e.name)).map(e=>e.name);
    const projects=[];
    for(const sub of ['',...subs]) {
      const projectPath=path.join(dir,sub,'director','project.json');
      if(await exists(projectPath))projects.push({projectPath,updated:(await stat(projectPath)).mtimeMs});
    }
    const project=newest(projects);
    if(project){works.push({id:entry.name,...project});continue;}
    const inputs=[];
    for(const sub of ['',...subs]) {
      // Below the top only finished files count, not batch drafts such as parts/001.vn.txt.
      const files=(await readdir(path.join(dir,sub))).filter(f=>sub?f==='story.vn.txt'||/\.vn\.zip$/i.test(f):/\.vn\.(txt|zip)$/i.test(f));
      // A conversion folder holds both; its package keeps the Extra and the cover.
      const file=sub?files.find(f=>f==='story.vn.zip')??files.find(f=>f!=='story.vn.txt')??files[0]
        :files.find(f=>f==='story.vn.txt')??files.find(f=>f.toLowerCase().endsWith('.vn.zip'))??files[0];
      if(file)inputs.push({input:path.posix.join(sub,file),updated:(await stat(path.join(dir,sub,file))).mtimeMs});
    }
    // Text at the top of the work folder comes before anything in its subfolders.
    const input=inputs[0]?.input.includes('/')?newest(inputs):inputs[0];
    if(input)works.push({id:entry.name,dir,...input});
  }
  return works;
}
/** @template {{updated:number}} T @param {T[]} list @returns {T|undefined} */
const newest=list=>list.reduce((a,b)=>!a||b.updated>a.updated?b:a,/** @type {T|undefined} */(undefined));
