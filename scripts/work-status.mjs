#!/usr/bin/env node
// Unified progress report for a work folder (convert + director):
//   node scripts/work-status.mjs <works/<作品> | convert/project.json | director/project.json> [--root <dir>]
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {workStatus} from '../src/production/work-status.js';

const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:undefined;};
const target=args[0]&&!args[0].startsWith('--')?args[0]:null;
if(!target) {
  console.error('用法：node scripts/work-status.mjs <作品目录或 project.json> [--root <制作根目录>]');
  process.exit(2);
}
const root=path.resolve(option('--root')??process.env.VN_PRODUCTION_DIR??path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
try {
  const status=await workStatus(target,{root});
  console.log(JSON.stringify(status,null,2));
} catch(error) {
  console.error(JSON.stringify({ok:false,error:error.message}));
  process.exitCode=1;
}
