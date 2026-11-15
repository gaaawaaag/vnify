import { readFile, writeFile } from 'node:fs/promises';
import { applyPatches } from '../src/conversion/workflow.js';
const [input,patches,flag,out,...extra] = process.argv.slice(2);
try {
  if (!input || !patches || flag !== '--out' || !out || extra.length) throw new Error('用法：npm run apply-patches -- "上一轮.vn.txt" "patches.json" --out "新版本.vn.txt"');
  const result = await applyPatches(await readFile(input,'utf8'),JSON.parse(await readFile(patches,'utf8')));
  await writeFile(out,result.output,{encoding:'utf8',flag:'wx'});
  console.log(`已应用 ${result.changes} 项补丁并通过严格语法校验：${out}；仍需对照原文审阅。`);
} catch (error) { console.error(error.code === 'EEXIST' ? '输出文件已存在，拒绝覆盖。' : error.message); process.exitCode = 1; }
