import { readFile } from 'node:fs/promises';
import { parseScript } from '../src/core/parser.js';
import { readDirectors } from '../src/conversion/director.js';

const args = process.argv.slice(2);
const paths = args.filter(arg => arg !== '--strict');
if (paths.length !== 1 || paths[0].startsWith('--')) {
  console.error('用法：npm run validate -- "文件.vn.txt" [--strict]');
  process.exitCode = 2;
} else {
  try {
    const raw=await readFile(paths[0], 'utf8');
    const script = parseScript(raw, { strictSources: args.includes('--strict') });
    readDirectors(raw,script);
    console.log(`通过：${script.chapters.length} 章，${script.blocks.length} 块，${script.units.length} 文本单元。`);
    console.log(`提示 ${script.warnings.length} 项（不阻止导入；不代表语义、来源真实性或无剧透已通过审阅）。`);
    for (const warning of script.warnings) console.log(`第 ${warning.line} 行：${warning.message}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
