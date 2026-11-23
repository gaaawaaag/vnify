#!/usr/bin/env node
// Background music for the agent (docs/dev/audio.md), from the asset manager's local music library and Freesound, or
// generated with its audio presets for music (music-presets.json):
// node scripts/music.mjs list <project.json>                                   tracks: prompt, file, cues
// node scripts/music.mjs search "<words>" [--sources local,freesound] --out hits.json   hits in that order, numbered
// node scripts/music.mjs bind <project.json> <trackId> <hits.json> <n>         binds hit n (from 0) with its source
// node scripts/music.mjs generate <project.json> <trackId|--missing|--all> --preset <presetId>   generates and binds
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSoundLibrary} from '../src/production/sound-library.js';
import {bindAudioFile} from '../src/production/director-edits.js';
import {flagsOf,hitList,sourcesOf} from './audio-cli.mjs';
import {loadDirectorProject} from '../src/production/director-project.js';
import {validateMusicPresets,musicPresetName} from '../src/production/music-presets.js';
import {generateTrack} from '../src/production/music-generation.js';

const presetsFile=fileURLToPath(new URL('../music-presets.json',import.meta.url));
const library=createSoundLibrary(fileURLToPath(new URL('..',import.meta.url)));
const usage='node scripts/music.mjs list <project.json> | search "<words>" [--sources local,freesound] --out <hits.json>'
  +' | bind <project.json> <trackId> <hits.json> <n> | generate <project.json> <trackId|--missing|--all> --preset <presetId>';
try {
  const [command,projectPath,...args]=process.argv.slice(2);
  if(command==='search'&&projectPath) {
    // The words come where the project goes for the other commands.
    const flags=flagsOf(args,['--out','--sources'],usage);
    if(!flags.get('--out'))throw new Error(usage);
    const found=await library.search(projectPath,{kind:'music',sources:sourcesOf(flags.get('--sources'),['local','freesound'])});
    await writeFile(path.resolve(/** @type {string} */(flags.get('--out'))),JSON.stringify(found,null,2)+'\n');
    console.log(JSON.stringify(hitList(found),null,2));
  } else if(command==='bind'&&projectPath&&args.length===3) {
    const [trackId,hitsFile,n]=args,{results}=JSON.parse(await readFile(hitsFile,'utf8')),idx=Number(n);
    const hit=Number.isInteger(idx)?results?.[idx]:results?.find((/** @type {any} */ r)=>String(r.id)===n||`freesound:${r.id}`===n);
    if(!hit)throw new Error(`${hitsFile} 里没有第 ${n} 条结果（序号从 0 开始，共 ${results?.length??0} 条）。`);
    const {bytes,source}=await library.take(hit,'music');
    await bindAudioFile(projectPath,'music',trackId,bytes,{source});
    console.log(JSON.stringify({ok:true,track:trackId,file:source},null,2));
  } else if(command==='list'&&projectPath&&!args.length) {
    const {story,audio}=await loadDirectorProject(projectPath),music=story.music;
    console.log(JSON.stringify({tracks:(music?.tracks??[]).map(track=>{
      const file=audio.files[audio.bindings.tracks[track.id]??''];
      return {...track,file:file?{name:file.name,...(file.source?{source:file.source}:{})}:null,cues:(music?.cues??[]).filter(c=>c.track===track.id).map(c=>c.from)};
    })},null,2));
  } else if(command==='generate'&&projectPath&&args.length===3&&args[1]==='--preset') {
    let raw=null;
    try {raw=JSON.parse(await readFile(presetsFile,'utf8'));} catch(error) {if(error.code!=='ENOENT')throw new Error(`music-presets.json 无法读取：${error.message}`);}
    const preset=validateMusicPresets(raw).presets.find(p=>p.id===args[2]);
    if(!preset)throw new Error(`没有音乐预设 ${args[2]}：在资产管理器“生成与搜索 → 音乐与音效”里新建。`);
    const {story,audio}=await loadDirectorProject(projectPath);
    const allTracks=(story.music?.tracks??[]).map(t=>t.id);
    const tracks=args[0]==='--all'?allTracks:args[0]==='--missing'?allTracks.filter(id=>!audio.bindings.tracks[id]):[args[0]];
    const done=[];
    for(const id of tracks){await generateTrack(projectPath,id,preset);done.push(id);console.error(`已生成 ${id}`);}
    console.log(JSON.stringify({ok:true,preset:musicPresetName(preset),generated:done},null,2));
  } else throw new Error(usage);
} catch(error) {
  console.error(JSON.stringify({ok:false,error:error.message}));
  process.exitCode=1;
}
