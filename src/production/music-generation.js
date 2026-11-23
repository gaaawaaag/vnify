// @ts-check
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {loadDirectorProject} from './director-project.js';
import {bindAudioFile,editTrack} from './director-edits.js';
import {getSecret} from './secrets.js';
import {headerOf} from './image-generation.js';
import {musicPresetName} from './music-presets.js';
import * as comfyui from './generators/comfyui.js';
import {compose} from './generators/elevenlabs-music.js';
import * as lyria from './generators/lyria.js';

/* Generating a work's music (docs/dev/audio.md): a track's prompt goes to a music preset, the result is bound at once
 * with where it came from, and every result is kept in music-log.json beside the project so an earlier one can come
 * back. The asset manager and scripts/music.mjs share this. */

/** @typedef {{track:string,file:string,preset:string,prompt:string,seconds:number,seed:number|null,time:string}} MusicLogEntry */

const logFile=(/** @type {string} */ projectPath)=>path.join(path.dirname(path.resolve(projectPath)),'music-log.json');
/** @param {string} projectPath @returns {Promise<MusicLogEntry[]>} */
export async function musicLog(projectPath) {
  try {const log=JSON.parse(await readFile(logFile(projectPath),'utf8'));return Array.isArray(log)?log:[];}
  catch(/** @type {any} */ error) {if(error.code==='ENOENT')return [];throw new Error('music-log.json 无法读取。');}
}
/** @param {string} projectPath @param {MusicLogEntry[]} log */
async function writeLog(projectPath,log) {
  const file=logFile(projectPath),temp=`${file}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(path.dirname(file),{recursive:true});await writeFile(temp,JSON.stringify(log,null,2)+'\n');await rename(temp,file);
}

/**
 * Generates a track with a preset and binds it. prompt replaces the track's own for this run (and is saved as its prompt).
 * @param {string} projectPath @param {string} trackId @param {import('./music-presets.js').MusicPreset} preset
 * @param {{prompt?:string,signal?:AbortSignal}} [options]
 */
export async function generateTrack(projectPath,trackId,preset,{prompt,signal}={}) {
  if(prompt!==undefined)await editTrack(projectPath,trackId,{prompt});
  const {story}=await loadDirectorProject(projectPath),track=story.music?.tracks.find(t=>t.id===trackId);
  if(!track)throw Object.assign(new Error(`没有这首曲目：${trackId}`),{status:400});
  if(!track.prompt)throw Object.assign(new Error(`曲目 ${track.name} 还没有提示词。`),{status:400});
  if(!preset.uses.includes('music'))throw Object.assign(new Error('这个音频预设不用于音乐。'),{status:400});
  // ElevenLabs takes a seed only with a composition plan, not with a prompt, and Lyria takes none; their tracks are logged without one.
  const seed=preset.source==='comfyui'?Math.floor(Math.random()*2**31):null;
  let bytes;
  if(preset.source==='lyria') {
    const l=/** @type {{model:string,instrumental:boolean}} */(preset.lyria);
    bytes=await lyria.compose(await getSecret('gemini'),{prompt:track.prompt,seconds:preset.seconds,model:l.model,instrumental:l.instrumental});
  } else if(preset.source==='elevenlabs') {
    const e=/** @type {{model:string,instrumental:boolean}} */(preset.elevenlabs);
    bytes=await compose(await getSecret('elevenlabs'),{prompt:track.prompt,seconds:preset.seconds,model:e.model,instrumental:e.instrumental});
  } else {
    const c=/** @type {{url:string,workflow:string|null,map:import('./music-presets.js').MusicMap}} */(preset.comfyui);
    if(!c.workflow)throw Object.assign(new Error('这个音乐预设还没有上传工作流。'),{status:400});
    bytes=await comfyui.run({url:c.url,workflow:c.workflow,map:c.map,output:'audio',signal,headers:headerOf(await getSecret('comfyui')),
      values:{prompt:track.prompt,lyrics:'[Instrumental]',duration:preset.seconds,seed}});
  }
  const name=musicPresetName(preset,false);
  await bindAudioFile(projectPath,'music',trackId,bytes,{source:{title:track.name,author:name}});
  const {audio}=await loadDirectorProject(projectPath),fileId=audio.bindings.tracks[trackId];
  const ext=audio.files[fileId]?.type==='audio/ogg'?'ogg':audio.files[fileId]?.type==='audio/mp4'?'m4a':'mp3';
  const log=await musicLog(projectPath);
  const seconds=preset.source==='lyria'&&preset.lyria?.model==='lyria-3-clip-preview'?30:preset.seconds;
  log.push({track:trackId,file:`audio/${fileId}.${ext}`,preset:name,prompt:track.prompt,seconds,seed,time:new Date().toISOString()});
  await writeLog(projectPath,log);
  return {fileId};
}

/** Binds an earlier result of a track again. @param {string} projectPath @param {string} trackId @param {string} file */
export async function restoreTrack(projectPath,trackId,file) {
  const entry=(await musicLog(projectPath)).find(e=>e.track===trackId&&e.file===file);
  if(!entry)throw Object.assign(new Error('生成记录里没有这个文件。'),{status:400});
  const bytes=new Uint8Array(await readFile(path.join(path.dirname(path.resolve(projectPath)),entry.file)));
  const {story}=await loadDirectorProject(projectPath),track=story.music?.tracks.find(t=>t.id===trackId);
  return bindAudioFile(projectPath,'music',trackId,bytes,{source:{title:track?.name??trackId,author:entry.preset}});
}
