// @ts-check
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {readGenerated} from './generation-log.js';

/* What the package's credits record says that the reader cannot work out itself (docs/dev/audio.md): the image models,
 * from how each packaged picture was made — the manager's generation log names its model (older entries only the preset, whose name includes it), an
 * agent records `generator` on the project's image entry, anything else came from the user — and the work's notice
 * and whether vnify. is credited. Music, sounds and voices are credited from their own records. */
export const USER_PROVIDED='用户提供';

/* The model in a preset's name ("ComfyUI · Krea 2 · 背景／CG · 自定义"), for generation logs written before entries named
 * the model on their own. @param {unknown} name */
export function modelOfPreset(name) {
  if(typeof name!=='string'||!name.trim())return '';
  const parts=name.split(' · ').map(part=>part.trim());
  return parts.length<2?parts[0]:parts[0]==='NovelAI'?`NovelAI ${parts[1]}`:parts[1];
}

/** The models of the agents that made the work (`agents`), checked. @param {unknown} value @returns {string[]} */
export function agentModels(value) {
  if(value===undefined||value===null)return [];
  if(!Array.isArray(value)||value.length>8||value.some(m=>typeof m!=='string'||!m.trim()||m.length>100))
    throw new Error('制作模型须为模型名称（最多 8 个，每个最多 100 字）。');
  return [...new Set(value.map(m=>m.trim()))];
}

/**
 * The project's credit settings, checked: the notice, whether vnify. is credited, and the agents' models.
 * @param {any} value @returns {{notice:string,signature:boolean,agents:string[]}}
 */
export function creditSettings(value) {
  const notice=value?.notice??'',signature=value?.signature??true;
  if(typeof notice!=='string'||notice.length>2000)throw new Error('说明须为不超过 2000 字的文字。');
  if(typeof signature!=='boolean')throw new Error('署名开关须为布尔值。');
  return {notice:notice.trim(),signature,agents:agentModels(value?.agents)};
}

/**
 * The credits record for a loaded director project: image models in the order first used, the notice and the signature.
 * An input package's own image credits stand in for its pictures nobody here can account for.
 * @param {any} loaded @param {string} projectPath
 * @returns {Promise<{version:1,images:string[],notice?:string,signature:boolean,agents?:string[]}>}
 */
export async function workCredits(loaded,projectPath) {
  const {notice,signature,agents:own}=creditSettings(loaded.project.credits);
  /** @type {Map<string,string>} */
  const made=new Map();
  for(const entry of await readGenerated(projectPath)) {
    const model=typeof entry?.model==='string'&&entry.model.trim()?entry.model.trim():modelOfPreset(entry?.preset);
    if(entry?.imageId&&model)made.set(entry.imageId,model);
  }
  const base=path.dirname(path.resolve(projectPath));
  for(const asset of loaded.project.images??[]) {
    if(typeof asset?.generator!=='string'||!asset.generator.trim()||typeof asset.file!=='string')continue;
    try {made.set(createHash('sha256').update(await readFile(path.resolve(base,asset.file))).digest('hex'),asset.generator.trim().slice(0,200));} catch {}
  }
  const used=[...Object.keys(loaded.backgrounds.images),...Object.keys(loaded.characterImages.images)];
  const inherited=loaded.packed?.credits?.images??[],models=[];let unknown=false;
  for(const id of used){const model=made.get(id);if(model){if(!models.includes(model))models.push(model);}else unknown=true;}
  for(const model of inherited)if(!models.includes(model))models.push(model);
  if(unknown&&!inherited.length)models.push(USER_PROVIDED);
  const agents=own.length?own:agentModels(loaded.packed?.credits?.agents);
  return {version:1,images:models,...(notice?{notice}:{}),signature,...(agents.length?{agents}:{})};
}
