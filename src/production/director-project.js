// @ts-check
/** @import {Backgrounds,CharacterImages} from '../types/assets.js' */
/** @import {LookNotice} from '../types/production.js' */
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {ScriptDirector} from '../conversion/script-director.js';
import {readDesignConflicts} from '../conversion/book-design.js';
import {readDirectors,validateTitleCard} from '../core/director.js';
import {reconcileBackgrounds,imageType,imageId} from '../reader/backgrounds.js';
import {emptyCharacterImages,bindCharacterPortrait} from '../reader/character-images.js';
import {importStoryPackage} from '../reader/story-package.js';
import {reuseBackgroundMasters,bindGeneratedImage} from './image-jobs.js';
import {TRANSPARENCY_METHODS} from '../core/image-prompts.js';
import {withBookInfo} from '../core/parser.js';
import {checkLookProfiles,resolveLooks} from '../conversion/looks.js';

/* A director project (vn-agent-director-1) read into memory: the story with its director records and design checked,
 * and the images in project.images applied to the input's assets. The command line and the asset manager share it.
 * `project` and `files` replace what is on disk (path → text), so a change can be checked before anything is written. */

export const backgroundScopes=(/** @type {string} */ purpose)=>purpose==='cut-in'?['cutIns']:purpose==='cg'?['cgs']
  :purpose==='background'?['ambients','locations','variants']:[];
const PURPOSES=['background','cg','cut-in','title-card','standing'];

/** @param {string} projectPath @param {{project?:any,files?:Map<string,string>}} [options] */
export async function loadDirectorProject(projectPath,{project=null,files=new Map()}={}) {
  projectPath=path.resolve(projectPath);
  const base=path.dirname(projectPath);
  const text=async(/** @type {string} */ filename)=>files.get(filename)??await readFile(filename,'utf8');
  project??=JSON.parse(await text(projectPath));
  if(project.format!=='vn-agent-director-1'||typeof project.input!=='string')throw new Error('需要 vn-agent-director-1 清单与 input 文件路径。');
  const sourcePath=path.resolve(base,project.input),bytes=await readFile(sourcePath);
  const packed=sourcePath.toLowerCase().endsWith('.vn.zip')?await importStoryPackage(new Blob([bytes])):null;
  // A title and author changed in the asset manager replace the input's @book line; the input file stays as it was.
  const input=packed?.raw??bytes.toString('utf8'),raw=project.book?withBookInfo(input,project.book):input;
  const job=new ScriptDirector(raw,project.options??{});
  if(project.transparencyMethod!==undefined&&!TRANSPARENCY_METHODS.includes(project.transparencyMethod))
    throw new Error('transparencyMethod 须为 native（生图工具直接出透明图）或 cutout（纯色背景生成后去背）。');
  const generation={...job.director,transparencyMethod:project.transparencyMethod??'native'};
  const chapters=project.chapters??job.plan.map(p=>p.chapter.id);
  if(!Array.isArray(chapters)||!chapters.length||new Set(chapters).size!==chapters.length||chapters.some(id=>!job.plan.some(p=>p.chapter.id===id)))throw new Error('chapters 需要不重复的现有章节 ID。');
  const directors=project.directors??{};
  if(!directors||typeof directors!=='object'||Array.isArray(directors))throw new Error('directors 需要章节 ID 到 JSON 文件的映射。');
  const inputs=[projectPath,sourcePath];
  /** @type {LookNotice[]} */
  let lookNotices=[];
  if(project.visualProfiles!==undefined) {
    let profiles=project.visualProfiles;
    if(typeof profiles==='string') {const filename=path.resolve(base,profiles);inputs.push(filename);profiles=JSON.parse(await text(filename));}
    // Quotes are placed in the story and replaced by its own text; those found nowhere are left out and reported.
    const resolved=resolveLooks(checkLookProfiles(profiles,id=>job.story.entities.has(id)),job.story);
    job.visualProfiles=resolved.profiles;lookNotices=resolved.notices;
  }
  /* revisions: the input's own records as edited in the asset manager ({chapterId: file}). They stay records of the
   * input, checked as it was, while a director file is a new draft checked against the project's current rules. */
  const revisions=project.revisions??{};
  if(!revisions||typeof revisions!=='object'||Array.isArray(revisions)||Object.entries(revisions).some(([id,file])=>!job.imported.has(id)||typeof file!=='string'))
    throw new Error('revisions 需要输入中已有导演记录的章节 ID 到 JSON 文件的映射。');
  for(const [id,file] of Object.entries(revisions)) {
    const filename=path.resolve(base,file);inputs.push(filename);
    const revised=JSON.stringify(JSON.parse(await text(filename)));
    job.imported.set(id,revised);/** @type {any} */(job.records[job.plan.findIndex(p=>p.chapter.id===id)]).director=revised;
  }
  // Once every chapter of the input is revised or redrafted, the art styles come from those records.
  if(job.imported.size&&[...job.imported.keys()].every(id=>Object.hasOwn(directors,id)||Object.hasOwn(revisions,id)))/** @type {any} */(job).selectedArtStyle=null;
  if(project.titleCard!==undefined)job.importedTitleCard=validateTitleCard(project.titleCard);
  if(project.design!==undefined){
    if(typeof project.design!=='string')throw new Error('design 需要全书设计 JSON 文件路径。');
    const filename=path.resolve(base,project.design);inputs.push(filename);
    try{job.setDesign(await text(filename));}catch(e){throw new Error(`全书设计：${/** @type {Error} */(e).message}`);}
  }
  /** @type {Record<string,{entityId:string,unit:string,note:string}[]>} */
  const designConflicts={};
  for(const [id,file] of Object.entries(directors)){
    if(!chapters.includes(id)||typeof file!=='string')throw new Error('导演文件须属于选定章节。');
    const filename=path.resolve(base,file);inputs.push(filename);
    const record=/** @type {any} */(job.records[job.plan.findIndex(p=>p.chapter.id===id)]);
    record.director=await text(filename);record.directorOptions={...job.director};
    // A draft that is not JSON fails in validation below; its conflict notes are read only from a parsed draft.
    /** @type {any} */
    let draft=null;try{draft=JSON.parse(record.director);}catch{}
    try{designConflicts[id]=readDesignConflicts(draft?.designConflicts,job.story,id);}catch(e){throw new Error(`${id}: ${/** @type {Error} */(e).message}`);}
  }
  job.validate();
  // Only supplied replacements must pass here; packets can be made before all chapters exist.
  for(const id of Object.keys(directors)){
    const record=job.records[job.plan.findIndex(p=>p.chapter.id===id)];
    if(!record.directorSaved)throw new Error(`${id}: ${record.directorError}`);
  }
  /* User-supplied reference images: inline, or a JSON file (such as import-handoff's references.json) whose image paths
   * are relative to that file. Each binds a character or place (entityId, plus variantId for another look) or a Cut-in. */
  let referenceList=project.references??[],referenceBase=base;
  if(typeof referenceList==='string'){
    const filename=path.resolve(base,referenceList);inputs.push(filename);
    referenceList=JSON.parse(await text(filename));referenceBase=path.dirname(filename);
  }
  if(!Array.isArray(referenceList))throw new Error('references 需要数组，或参考图清单 JSON 文件的路径。');
  const references=[];
  for(const ref of referenceList){
    const strings=['entityId','variantId','cutInId','stage','refId','kind','from','to'].every(k=>ref?.[k]===undefined||typeof ref[k]==='string');
    if(typeof ref?.file!=='string'||!strings||(ref.entityId!==undefined&&ref.cutInId!==undefined))
      throw new Error('参考图需要 file，以及 entityId（可选 variantId）或 cutInId 之一。');
    const filename=path.resolve(referenceBase,ref.file);inputs.push(filename);
    imageType(await readFile(filename));
    references.push({...ref,filename});
  }
  /** @type {Backgrounds} */
  let backgrounds=reconcileBackgrounds(packed?.backgrounds,job.story);
  /** @type {CharacterImages} */
  let characterImages=packed?.characterImages??emptyCharacterImages(job.story.book.id);
  if(!Array.isArray(project.images??[]))throw new Error('images 需要数组。');
  for(const asset of project.images??[]){
    const change=asset.remove||asset.adjust;
    if(!PURPOSES.includes(asset.purpose)||(!change&&typeof asset.file!=='string')) {
      throw new Error('图片需要 file 与 background/cg/cut-in/title-card/standing purpose；移除用 remove:true，只改立绘设置用 adjust:true。');
    }
    // mode and sentPrompt only record how the image was made; they stay in the project file.
    if(asset.mode!==undefined&&!['generate','edit','reference','cutout'].includes(asset.mode))throw new Error('图片 mode 须为 generate、edit、reference 或 cutout。');
    if(asset.sentPrompt!==undefined&&typeof asset.sentPrompt!=='string')throw new Error('图片 sentPrompt 须为字符串。');
    if((asset.flip!==undefined||asset.crop!==undefined||asset.adjust)&&asset.purpose!=='standing')throw new Error('flip、crop、adjust 只用于立绘。');
    if(asset.purpose==='standing'&&change) {
      // A portrait already bound (by the input package or an earlier entry) is removed, or keeps its image with new settings.
      const variant=asset.variantId??null,slots=characterImages.bindings[asset.characterId];
      const bound=variant?slots?.variants?.[variant]:slots?.standing;
      if(!bound)throw new Error(`${asset.characterId}${variant?`／${variant}`:''} 没有已绑定的立绘可以${asset.remove?'移除':'调整'}。`);
      characterImages=bindCharacterPortrait(characterImages,job.story,asset.characterId,asset.remove?null:bound.imageId,variant,
        {crop:asset.crop??null,flip:asset.flip??null});
      continue;
    }
    if(asset.purpose==='title-card'&&asset.remove){backgrounds.bindings.titleCard=null;continue;}
    if(asset.remove){
      const scopes=backgroundScopes(asset.purpose);
      if(!Array.isArray(asset.refs)||!asset.refs.length||asset.refs.some(ref=>!scopes.includes(ref.scope)||typeof ref.id!=='string'))throw new Error('移除背景图片需要匹配 purpose 的 refs。');
      for(const ref of asset.refs)delete backgrounds.bindings[ref.scope][ref.id];
      continue;
    }
    const filename=path.resolve(base,asset.file);inputs.push(filename);
    const bytes=await readFile(filename),type=imageType(bytes),blob=new Blob([bytes],{type}),id=await imageId(blob);
    const image={blob,type,name:path.basename(filename),width:asset.width,height:asset.height};
    // variantId names a variant look of the character; without it the image is the default look.
    const task={purpose:asset.purpose,characterId:asset.characterId,variantId:asset.variantId,refs:asset.refs};
    const options={replace:Boolean(asset.replace),crop:asset.crop??null,flip:asset.flip??null};
    if(asset.purpose==='standing')characterImages=bindGeneratedImage(characterImages,job.story,/** @type {any} */(task),image,id,options);
    else {
      if(asset.purpose!=='title-card'&&(!Array.isArray(asset.refs)||!asset.refs.length))throw new Error('背景图片需要 refs。');
      if(asset.refs?.some(ref=>!backgroundScopes(asset.purpose).includes(ref.scope)))throw new Error('背景 scope 须匹配 purpose。');
      backgrounds=bindGeneratedImage(backgrounds,job.story,/** @type {any} */(task),image,id,options);
    }
  }
  backgrounds=reuseBackgroundMasters(backgrounds,job.story,readDirectors(/** @type {string} */(job.readableOutput),job.story));
  // Prompts the user rewrote by hand ({taskId: prompt}, or `${taskId}#edit` for a variant's edit prompt) replace the composed ones.
  let prompts={};
  if(project.prompts!==undefined){
    if(typeof project.prompts!=='string')throw new Error('prompts 需要手动提示词 JSON 文件路径。');
    const filename=path.resolve(base,project.prompts);inputs.push(filename);
    prompts=JSON.parse(await text(filename));
    if(!prompts||typeof prompts!=='object'||Array.isArray(prompts)||Object.values(prompts).some(v=>typeof v!=='string'||!v.trim()))
      throw new Error('手动提示词须为任务 ID 到非空提示词的映射。');
  }
  // Prompts rewritten by the agent for image service presets (docs/prompt-formats.md): {version, presets: {id: {format, prompts}}},
  // each prompt {text, source} with the fingerprint of the composed prompt it was rewritten from.
  /** @type {Map<string,{format:string,prompts:Map<string,{text:string,source:string}>}>} */
  const formatted=new Map();
  if(project.formatted!==undefined){
    if(typeof project.formatted!=='string')throw new Error('formatted 需要改写稿 JSON 文件路径。');
    const filename=path.resolve(base,project.formatted);inputs.push(filename);
    const file=JSON.parse(await text(filename));
    if(file?.version!==1||!file.presets||typeof file.presets!=='object')throw new Error('改写稿格式不对（formatted.json）。');
    for(const [id,entry] of Object.entries(file.presets)){
      if(typeof entry?.format!=='string'||!entry.prompts||typeof entry.prompts!=='object'
        ||Object.values(entry.prompts).some(v=>typeof v?.text!=='string'||!v.text.trim()||typeof v.source!=='string'))
        throw new Error(`改写稿 ${id} 须有写法指纹，每条提示词有非空 text 与 source。`);
      formatted.set(id,{format:entry.format,prompts:new Map(Object.entries(/** @type {Record<string,{text:string,source:string}>} */(entry.prompts)))});
    }
  }
  return {project,projectPath,base,job,story:job.story,generation,chapters,directors,packed,backgrounds,characterImages,references,inputs,
    prompts:new Map(Object.entries(/** @type {Record<string,string>} */(prompts))),formatted,designConflicts,lookNotices};
}
