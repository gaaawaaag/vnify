// @ts-check
/** @import {HeldTask,ImageTask,QueuedTask} from '../types/production.js' */
// A task ID names one binding target. Holds ({taskId: reason}) keep targets out of the queue until the agent clears them.
/** @param {ImageTask} task */
const imageKeys=task=>task.refs?.map(r=>`${task.purpose}:${r.scope}:${r.id}`)??[`${task.purpose}:${task.characterId}${task.variantId?`:${task.variantId}`:''}`];
/** @param {ImageTask} task */
const keys=task=>task.purpose==='title-card'||task.purpose==='end-card'?[task.purpose]:imageKeys(task);
export const imageTaskIds=keys;

/** @param {unknown} [value] @returns {Map<string,string>} */
export function readHolds(value={}) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.values(value).some(r=>typeof r!=='string'||!r.trim()))
    throw new Error('holds 须为任务 ID 到暂缓原因的映射，原因不能为空。');
  return new Map(Object.entries(value));
}

// Splits planned tasks into executable jobs and held targets; a shared background job keeps only its free targets.
/** @param {ImageTask[]} tasks @param {Map<string,string>} [holds] @returns {{jobs:QueuedTask[],held:HeldTask[]}} */
export function imageQueue(tasks,holds=new Map()) {
  /** @type {QueuedTask[]} */
  const jobs=[];
  /** @type {HeldTask[]} */
  const held=[];
  for(const task of tasks) {
    const ids=keys(task);
    if(task.blockedReason){held.push({...task,taskIds:ids,reason:task.blockedReason});continue;}
    if(task.refs) {
      const free=task.refs.filter((_,i)=>!holds.has(ids[i]));
      for(const [i,ref] of task.refs.entries()) {
        const reason=holds.get(ids[i]);
        if(reason)held.push({...task,refs:[ref],taskIds:[ids[i]],reason});
      }
      if(free.length)jobs.push({...task,refs:free,taskIds:keys({...task,refs:free})});
    } else {
      // readHolds keeps only non-empty reasons.
      const reason=holds.get(ids[0]);
      if(reason)held.push({...task,taskIds:ids,reason});else jobs.push({...task,taskIds:ids});
    }
  }
  return {jobs,held};
}

// Prompts rewritten by hand in the asset manager replace the composed ones: {taskId: prompt}, `${taskId}#edit` for an edit prompt.
/** @param {ImageTask[]} tasks @param {Map<string,string>} prompts @returns {ImageTask[]} */
export function applyPromptOverrides(tasks,prompts) {
  if(!prompts.size)return tasks;
  return tasks.map(task=>{
    const id=keys(task)[0],prompt=prompts.get(id),edit=prompts.get(`${id}#edit`);
    if(prompt===undefined&&edit===undefined)return task;
    return /** @type {ImageTask} */({...task,...(prompt!==undefined?{prompt}:{}),...(edit!==undefined&&'editPrompt' in task?{editPrompt:edit}:{}),promptEdited:true});
  });
}
