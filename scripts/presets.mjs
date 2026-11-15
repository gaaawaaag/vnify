#!/usr/bin/env node
// Prints a production preset for the agent: its settings, the director project's options and its top-level transparencyMethod;
// with mounted image service presets, the work's first imageScheme and each mounted preset's prompt format.
// node scripts/presets.mjs            lists the presets and the default
// node scripts/presets.mjs <名称>      prints that preset (the default when the name is omitted after --show)
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {validatePresetFile,directorOptions,imageSchemeOf} from '../src/production/presets.js';
import {validateImagePresets,presetName,canEdit} from '../src/production/image-presets.js';

const file=fileURLToPath(new URL('../presets.json',import.meta.url));
const imageFile=fileURLToPath(new URL('../image-presets.json',import.meta.url));
try {
  let raw=null;
  try {raw=JSON.parse(await readFile(file,'utf8'));} catch(error) {if(error.code!=='ENOENT')throw new Error(`presets.json 无法读取：${error.message}`);}
  const presets=validatePresetFile(raw),args=process.argv.slice(2);
  if(!args.length) {
    console.log(JSON.stringify({default:presets.default,presets:Object.keys(presets.presets)},null,2));
  } else {
    const name=args[0]==='--show'?presets.default:args[0],preset=presets.presets[name];
    if(!preset)throw new Error(`没有预设“${name}”；可用：${Object.keys(presets.presets).join('、')}`);
    const {transparencyMethod,...options}=directorOptions(preset),imageScheme=imageSchemeOf(preset);
    let mounted;
    if(imageScheme) {
      let raw=null;
      try {raw=JSON.parse(await readFile(imageFile,'utf8'));} catch(error) {if(error.code!=='ENOENT')throw new Error(`image-presets.json 无法读取：${error.message}`);}
      const all=validateImagePresets(raw).presets;
      mounted=[...new Set(Object.values(imageScheme.uses))].map(id=>{
        const p=all.find(x=>x.id===id),uses=Object.keys(imageScheme.uses).filter(u=>imageScheme.uses[u]===id);
        return p?{id,name:presetName(p),uses,format:p.format,canEdit:canEdit(p)}:{id,uses,missing:true};
      });
    }
    console.log(JSON.stringify({name,preset,directorOptions:options,transparencyMethod,...(imageScheme?{imageScheme,mounted}:{})},null,2));
  }
} catch(error) {console.error(error.message);process.exit(1);}
