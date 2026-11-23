#!/usr/bin/env node
// Sound effects for the agent (docs/dev/audio.md), with the asset manager's libraries (the local folder, Freesound) and
// its audio presets for effects (music-presets.json):
// node scripts/sounds.mjs list <project.json>                         the work's sounds: kind, search words, file, uses
// node scripts/sounds.mjs search "<words>" [--sources local,freesound] [--max-duration 30] --out hits.json
//                                                                     hits from the sources in that order, numbered
// node scripts/sounds.mjs bind <project.json> <soundId> <hits.json> <n>         binds hit n (from 0) with its source
// node scripts/sounds.mjs generate <project.json> <soundId> "<English description>" [--preset <id>] [--seconds N]
//                                                                     generates with an effects preset and binds (ambience loops)
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSoundLibrary} from '../src/production/sound-library.js';
import {loadDirectorProject} from '../src/production/director-project.js';
import {bindAudioFile} from '../src/production/director-edits.js';
import {flagsOf,hitList,sourcesOf} from './audio-cli.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),library=createSoundLibrary(root);
const usage='node scripts/sounds.mjs list <project.json> | search "<words>" [--sources local,freesound] [--max-duration N] --out <hits.json>'
  +' | bind <project.json> <soundId> <hits.json> <n> | generate <project.json> <soundId> "<description>" [--preset <id>] [--seconds N]';
try {
  const [command,...args]=process.argv.slice(2);
  if(command==='list'&&args.length===1) {
    const {story,audio}=await loadDirectorProject(args[0]),record=story.sounds;
    const sounds=(record?.sounds??[]).map(sound=>{
      const file=audio.files[audio.bindings.sounds?.[sound.id]??''];
      return {...sound,file:file?{name:file.name,...(file.source?{source:file.source}:{})}:null,
        places:Object.entries(record?.places??{}).filter(([,id])=>id===sound.id).map(([place])=>place),
        blocks:Object.entries(record?.blocks??{}).filter(([,id])=>id===sound.id).map(([block])=>block),
        effects:(record?.effects??[]).filter(cue=>cue.sound===sound.id).map(cue=>cue.at)};
    });
    // Effects already generated, against the production preset's limit.
    const generated=Object.values(audio.files).filter(file=>file.source?.author==='ElevenLabs Sound Effects').length;
    console.log(JSON.stringify({sounds,generated},null,2));
  } else if(command==='search'&&args.length>=1) {
    const flags=flagsOf(args.slice(1),['--out','--max-duration','--sources'],usage);
    if(!flags.get('--out'))throw new Error(usage);
    const found=await library.search(args[0],{sources:sourcesOf(flags.get('--sources'),['local','freesound']),
      maxDuration:Number(flags.get('--max-duration'))||60});
    await writeFile(path.resolve(/** @type {string} */(flags.get('--out'))),JSON.stringify(found,null,2)+'\n');
    console.log(JSON.stringify(hitList(found),null,2));
  } else if(command==='bind'&&args.length===4) {
    const [projectPath,soundId,hitsFile,n]=args,{results}=JSON.parse(await readFile(hitsFile,'utf8')),idx=Number(n);
    const hit=Number.isInteger(idx)?results?.[idx]:results?.find((/** @type {any} */ r)=>String(r.id)===n||`freesound:${r.id}`===n);
    if(!hit)throw new Error(`${hitsFile} 里没有第 ${n} 条结果（序号从 0 开始，共 ${results?.length??0} 条）。`);
    const {bytes,source}=await library.take(hit,'sounds');
    await bindAudioFile(projectPath,'sounds',soundId,bytes,{source});
    console.log(JSON.stringify({ok:true,sound:soundId,file:source},null,2));
  } else if(command==='generate'&&args.length>=3) {
    const [projectPath,soundId,prompt]=args,flags=flagsOf(args.slice(3),['--seconds','--preset'],usage);
    const sound=(await loadDirectorProject(projectPath)).story.sounds?.sounds.find(s=>s.id===soundId);
    if(!sound)throw new Error(`没有这个声音：${soundId}`);
    const {bytes,source}=await library.take({source:'generate',preset:flags.get('--preset'),name:sound.name,prompt,loop:sound.kind==='ambience',
      ...(flags.get('--seconds')?{seconds:Number(flags.get('--seconds'))}:{})},'sounds');
    await bindAudioFile(projectPath,'sounds',soundId,bytes,{source});
    console.log(JSON.stringify({ok:true,sound:soundId,file:source},null,2));
  } else throw new Error(usage);
} catch(error) {
  console.error(JSON.stringify({ok:false,error:error.message}));
  process.exitCode=1;
}
