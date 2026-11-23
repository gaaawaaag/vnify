// @ts-check
import {readFile,writeFile,mkdir,rename,chmod} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/* Service keys live in the user's own folder (~/.vnify/secrets.json, or VNIFY_SECRETS_DIR), never in a workspace,
 * a preset file or the browser. The manager only learns whether one is set. An API's key is named by its address
 * (openai:https://…/v1). */
const dir=()=>process.env.VNIFY_SECRETS_DIR||path.join(os.homedir(),'.vnify');
const file=()=>path.join(dir(),'secrets.json');
export const SECRET_NAMES=['novelai','comfyui','fish','freesound','elevenlabs','gemini','pexels','pixabay'];
const valid=(/** @type {string} */ name)=>SECRET_NAMES.includes(name)||/^openai:https?:\/\/[^\s?#]+$/.test(name)&&name.length<=600;

async function readAll() {
  try{return JSON.parse(await readFile(file(),'utf8'));}
  catch(/** @type {any} */ error){if(error.code==='ENOENT')return {};throw new Error('密钥文件无法读取：'+file());}
}
/** @param {string} name @returns {Promise<string>} */
export async function getSecret(name) {return (await readAll())[name]??'';}
/** Every key, for a generation queue. @returns {Promise<Record<string,string>>} */
export async function getSecrets() {const all=await readAll();return Object.fromEntries(Object.entries(all).filter(([n,v])=>valid(n)&&typeof v==='string'));}
/** Which keys are set, without their values (each API address that has one). */
export async function secretStatus() {
  const all=await readAll();
  return {...Object.fromEntries(SECRET_NAMES.map(n=>[n,!!all[n]])),...Object.fromEntries(Object.keys(all).filter(n=>n.startsWith('openai:')&&valid(n)&&all[n]).map(n=>[n,true]))};
}
/** @param {string} name @param {string} value an empty value removes the key */
export async function setSecret(name,value) {
  if(!valid(name))throw new Error('不支持的密钥。');
  if(typeof value!=='string'||value.length>4000)throw new Error('密钥无效。');
  const all=await readAll();
  if(value.trim())all[name]=value.trim();else delete all[name];
  await mkdir(dir(),{recursive:true});
  const temp=`${file()}.${process.pid}.tmp`;
  await writeFile(temp,JSON.stringify(all,null,2)+'\n',{mode:0o600});
  await rename(temp,file());
  await chmod(file(),0o600).catch(()=>{});
  return secretStatus();
}
