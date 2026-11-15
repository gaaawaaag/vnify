// @ts-check
import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';

/* Every picture the manager generated for a work, kept beside the project (generated.json) with how it was made, so
 * an earlier one can be put back and a variant can reuse its default's seed. The files stay in images/. */
const logFile=(/** @type {string} */ projectPath)=>path.join(path.dirname(projectPath),'generated.json');

/** @param {string} projectPath @returns {Promise<any[]>} */
export async function readGenerated(projectPath) {
  try{return JSON.parse(await readFile(logFile(projectPath),'utf8')).entries??[];}
  catch(/** @type {any} */ error){if(error.code==='ENOENT')return [];throw new Error('generated.json 无法读取。');}
}
/** @param {string} projectPath @param {any} entry */
export async function appendGenerated(projectPath,entry) {
  const entries=[...await readGenerated(projectPath),entry],file=logFile(projectPath),temp=`${file}.${process.pid}.tmp`;
  await writeFile(temp,JSON.stringify({version:1,entries},null,2)+'\n');await rename(temp,file);
  return entries;
}
// An image's generation history, oldest first.
/** @param {any[]} entries @param {string} key */
export const historyOf=(entries,key)=>entries.filter(e=>e.key===key).map(({key:_,...e})=>e);
