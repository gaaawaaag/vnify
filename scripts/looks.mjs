// @ts-check
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {readSourceMap} from '../src/conversion/workflow.js';
import {lookHints} from '../src/conversion/look-hints.js';

// Reminders after registering a book: quotes not found in their source, appearance sentences no quote covers, and
// first-seen sources without any registered name. It never fails on what it finds.
const usage='node scripts/looks.mjs <转换目录> [--out <文件>]';
try {
  const args=process.argv.slice(2),dir=args.shift();
  if(!dir||dir.startsWith('--')||(args.length&&(args.length!==2||args[0]!=='--out')))throw new Error(usage);
  const base=path.resolve(dir);
  const map=readSourceMap(JSON.parse(await readFile(path.join(base,'source-map.json'),'utf8')));
  const profiles=JSON.parse(await readFile(path.join(base,'visual-profiles.json'),'utf8'));
  const registry=await readFile(path.join(base,'registry.md'),'utf8').catch(()=>null);
  const {text,stray,candidates,firstSeen}=lookHints({profiles,map,registry});
  if(args[1]) {
    const target=path.resolve(args[1]);
    await mkdir(path.dirname(target),{recursive:true});
    await writeFile(target,text,'utf8');
    console.log(JSON.stringify({ok:true,output:target,strayQuotes:stray.length,candidates:candidates.length,firstSeen:firstSeen.length},null,2));
  } else process.stdout.write(text);
} catch(error) {
  console.error(JSON.stringify({ok:false,error:/** @type {Error} */(error).message},null,2));
  process.exitCode=1;
}
