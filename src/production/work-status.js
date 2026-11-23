// @ts-check
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {loadDirectorProject} from './director-project.js';
import {assetCatalog} from './asset-catalog.js';
import {readDirectors} from '../core/director.js';
import {validateImagePresets,validateImageScheme,presetName,formatKey} from './image-presets.js';
import {formatItems} from './prompt-formats.js';
import {voiceRoles} from './voices.js';

/* Unified progress inspection for a work folder (convert + director): lets an agent or user see exact conversion,
 * director, prompt-formatting, image, portrait-crop, voice, music and sound completion in one command. */

/** @param {string} file */
async function fileMeta(file) {
  try {
    const info=await stat(file);
    if(!info.isFile())return null;
    return {file,bytes:info.size,updatedAt:info.mtime.toISOString()};
  } catch {return null;}
}

/** @param {string} file */
async function readJsonOrNull(file) {
  try {return JSON.parse(await readFile(file,'utf8'));}
  catch {return null;}
}

/**
 * Resolves a work directory, convert/project.json or director/project.json into {workDir, convertPath, directorPath}.
 * @param {string} target
 */
export async function resolveWorkPaths(target) {
  const resolved=path.resolve(target);
  const info=await stat(resolved).catch(()=>null);
  if(!info)throw new Error(`找不到路径：${target}`);
  if(info.isFile()) {
    const doc=await readJsonOrNull(resolved);
    const parent=path.dirname(resolved);
    if(doc?.format==='vn-agent-director-1') {
      const workDir=path.basename(parent)==='director'?path.dirname(parent):parent;
      const convertPath=path.join(workDir,'convert','project.json');
      return {workDir,directorPath:resolved,convertPath:await fileMeta(convertPath)?convertPath:null};
    }
    if(doc?.format==='vn-agent-1') {
      const workDir=path.basename(parent)==='convert'?path.dirname(parent):parent;
      const directorPath=path.join(workDir,'director','project.json');
      return {workDir,convertPath:resolved,directorPath:await fileMeta(directorPath)?directorPath:null};
    }
    throw new Error(`不是有效的转换或导演清单：${target}`);
  }
  const convertPath=path.join(resolved,'convert','project.json');
  const directorPath=path.join(resolved,'director','project.json');
  const directProject=path.join(resolved,'project.json');
  let cPath=await fileMeta(convertPath)?convertPath:null;
  let dPath=await fileMeta(directorPath)?directorPath:null;
  if(!cPath&&!dPath&&await fileMeta(directProject)) {
    const doc=await readJsonOrNull(directProject);
    if(doc?.format==='vn-agent-1')cPath=directProject;
    else if(doc?.format==='vn-agent-director-1')dPath=directProject;
  }
  if(!cPath&&!dPath)throw new Error(`目录里没有找到 convert/project.json 或 director/project.json：${target}`);
  return {workDir:resolved,convertPath:cPath,directorPath:dPath};
}

/** @param {string} convertPath */
async function inspectConvert(convertPath) {
  const dir=path.dirname(convertPath);
  const project=await readJsonOrNull(convertPath);
  const sourceMapPath=typeof project?.sourceMap==='string'?path.resolve(dir,project.sourceMap):path.join(dir,'source-map.json');
  const sourceMap=await readJsonOrNull(sourceMapPath);
  const profilesPath=path.join(dir,'visual-profiles.json');
  const profiles=await readJsonOrNull(profilesPath);
  const parts=Array.isArray(project?.parts)?project.parts:[];
  const dossiers=Array.isArray(project?.dossiers)?project.dossiers:[];
  const [txt,zip]=await Promise.all([fileMeta(path.join(dir,'story.vn.txt')),fileMeta(path.join(dir,'story.vn.zip'))]);
  return {
    project:convertPath,
    book:project?.book??null,
    sourceParagraphs:Array.isArray(sourceMap?.paragraphs)?sourceMap.paragraphs.length:null,
    parts:parts.length,
    dossiers:dossiers.length,
    visualProfiles:Array.isArray(profiles)?profiles.length:null,
    outputs:{txt,zip},
  };
}

/** @param {string} directorPath @param {string} root */
async function inspectDirector(directorPath,root) {
  const dir=path.dirname(directorPath);
  const loaded=await loadDirectorProject(directorPath);
  const {story,job,project,audio,designConflicts,lookNotices}=loaded;
  const docs=readDirectors(/** @type {string} */(job.readableOutput),story);
  const catalog=assetCatalog({...loaded,docs});
  const chapters=job.plan.map(p=>p.chapter.id);
  const directorMap=project.directors??{};
  const revisionMap=project.revisions??{};
  const completeChapters=[];
  const pendingChapters=[];
  for(const id of chapters) {
    const rec=job.records[job.plan.findIndex(p=>p.chapter.id===id)];
    const hasDraft=Object.hasOwn(directorMap,id)||Object.hasOwn(revisionMap,id)||job.imported.has(id);
    if(hasDraft&&rec?.directorSaved)completeChapters.push(id);
    else pendingChapters.push(id);
  }
  const conflicts=Object.entries(designConflicts??{}).flatMap(([chapterId,list])=>list.map(c=>({chapterId,...c})));
  const holds=project.holds??{};
  const allImages=catalog.flatMap(asset=>asset.images.map(image=>({asset,image}))).filter(x=>x.image.prompt!=null||x.image.bound);
  /** @type {Record<string,{total:number,bound:number,missing:number}>} */
  const byCategory={};
  const missingKeys=[];
  const standingTotal=[];
  const standingBound=[];
  const standingCropped=[];
  const uncroppedKeys=[];
  for(const {asset,image} of allImages) {
    const cat=asset.cat;
    byCategory[cat]??={total:0,bound:0,missing:0};
    byCategory[cat].total++;
    if(image.bound)byCategory[cat].bound++;
    else {byCategory[cat].missing++;missingKeys.push(image.key);}
    if(cat==='character') {
      standingTotal.push(image.key);
      if(image.bound) {
        standingBound.push(image.key);
        if(image.bound.crop)standingCropped.push(image.key);
        else uncroppedKeys.push(image.key);
      }
    }
  }
  // Pending prompt formatting counts when an imageScheme is configured.
  /** @type {Array<{id:string,name:string,rewrites:boolean,pending?:number}>} */
  let promptFormats=[];
  if(project.imageScheme) {
    let rawPresets=null;
    try {rawPresets=JSON.parse(await readFile(path.join(root,'image-presets.json'),'utf8'));}
    catch {}
    const presets=validateImagePresets(rawPresets).presets;
    const scheme=validateImageScheme(project.imageScheme,presets);
    const ids=[...new Set([...Object.values(scheme.uses),...Object.values(scheme.overrides)])];
    promptFormats=ids.map(id=>{
      const preset=presets.find(p=>p.id===id);
      if(!preset)return {id,name:id,rewrites:false};
      const rewrites=!!formatKey(preset);
      return {id,name:presetName(preset),rewrites,...(rewrites?{pending:formatItems(catalog,scheme,preset).length}:{})};
    });
  }
  // Voice assignment coverage.
  const voiceRecord=/** @type {any} */(job).voices??story.voices;
  const cast=voiceRecord?.cast;
  const requiredRoles=voiceRoles(story).map(r=>r.key);
  const assignedRoles=requiredRoles.filter(role=>role==='narrator'?!!cast?.narrator:role==='other'?!!cast?.other:!!cast?.characters?.[role]);
  // Music & sound coverage.
  const tracks=story.music?.tracks??[];
  const boundTracks=tracks.filter(t=>!!audio.bindings.tracks[t.id]);
  /** @type {Record<string,number>} */
  const musicSources={};
  for(const t of boundTracks) {
    const author=audio.files[audio.bindings.tracks[t.id]]?.source?.author??'unknown';
    musicSources[author]=(musicSources[author]??0)+1;
  }
  const soundList=story.sounds?.sounds??[];
  const boundSounds=soundList.filter(s=>!!audio.bindings.sounds?.[s.id]);
  const generatedSounds=Object.values(audio.files).filter(f=>f.source?.author==='ElevenLabs Sound Effects').length;
  const [txt,zip]=await Promise.all([fileMeta(path.join(dir,'story.vn.txt')),fileMeta(path.join(dir,'story.vn.zip'))]);
  return {
    project:directorPath,
    book:story.book,
    design:project.design??null,
    chapters:{total:chapters.length,complete:completeChapters.length,pending:pendingChapters},
    soundDrafts:{total:Object.keys(project.soundDrafts??{}).length,expected:project.soundOptions?chapters.length:0},
    designConflicts:conflicts,
    droppedLooks:lookNotices.length,
    promptFormats,
    images:{
      total:allImages.length,
      bound:allImages.length-missingKeys.length,
      missing:missingKeys.length,
      held:Object.keys(holds).length,
      byCategory,
      missingKeys:missingKeys.slice(0,20),
    },
    standingCrops:{
      total:standingTotal.length,
      bound:standingBound.length,
      cropped:standingCropped.length,
      uncropped:uncroppedKeys.length,
      uncroppedKeys,
    },
    voices:{
      enabled:Boolean(project.options?.voicePortraits||project.voices||story.voices),
      totalRoles:requiredRoles.length,
      assigned:assignedRoles.length,
      unassigned:requiredRoles.filter(r=>!assignedRoles.includes(r)),
    },
    music:{
      enabled:Boolean(project.options?.musicTracks||project.music||tracks.length),
      total:tracks.length,
      bound:boundTracks.length,
      missing:tracks.filter(t=>!audio.bindings.tracks[t.id]).map(t=>t.id),
      cues:(story.music?.cues??[]).length,
      sources:musicSources,
    },
    sounds:{
      enabled:Boolean(project.soundOptions?.effects||project.sounds||soundList.length),
      total:soundList.length,
      bound:boundSounds.length,
      missing:soundList.filter(s=>!audio.bindings.sounds?.[s.id]).map(s=>s.id),
      generated:generatedSounds,
    },
    outputs:{txt,zip},
  };
}

/**
 * Inspects a work directory or project.json and returns a structured status summary.
 * @param {string} target @param {{root?:string}} [options]
 */
export async function workStatus(target,{root=process.cwd()}={}) {
  const {workDir,convertPath,directorPath}=await resolveWorkPaths(target);
  const convert=convertPath?await inspectConvert(convertPath):null;
  const director=directorPath?await inspectDirector(directorPath,root):null;
  return {workDir,book:director?.book??convert?.book??null,convert,director};
}
