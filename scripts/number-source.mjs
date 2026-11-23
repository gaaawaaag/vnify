import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { decodeText, numberSource, numberedText, splitBatches, sourcePacket } from '../src/conversion/workflow.js';
import { readEpub } from '../src/conversion/epub.js';
import { markdownText } from '../src/conversion/markdown.js';
import { aozoraText } from '../src/conversion/aozora.js';
import { detectLanguage } from '../src/core/language.js';
import { imageHeader } from '../src/core/image-header.js';

const args = process.argv.slice(2);
const usage = '用法：npm run number-source -- "原文.txt|原文.md|原文.epub" --out "新输出目录" [--mode line|blank] [--prefix p] [--start 1] [--max-chars 12000] [--encoding utf-8|gb18030|shift_jis] [--lang zh|zh-Hant|en|ja]';
try {
  const input = args.shift(), options = {};
  if (!input || input.startsWith('--')) throw new Error(usage);
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (!['--out','--mode','--prefix','--start','--max-chars','--encoding','--lang'].includes(flag) || value === undefined || Object.hasOwn(options,flag)) throw new Error(usage);
    options[flag] = value;
  }
  if (!options['--out']) throw new Error(usage);
  const epub = /\.epub$/i.test(input);
  if (epub && ['--mode','--prefix','--start','--encoding'].some(flag => options[flag]))
    throw new Error('EPUB 固定按行编号（前缀 p、从 1 开始），编码由书内声明决定。');
  const book = epub ? await readEpub(new Uint8Array(await readFile(input))) : null;
  const decoded = book ? book.text : decodeText(await readFile(input),options['--encoding'] || 'utf-8');
  // Markdown is numbered as plain text (emphasis and escapes removed, section breaks as `* * *`).
  const plain = /\.(?:md|markdown)$/i.test(input) ? markdownText(decoded) : decoded;
  // Japanese text files carry readings and notes in Aozora Bunko marks; the numbered source is the text without them.
  const aozora = !book && (options['--lang'] ?? detectLanguage(plain)) === 'ja' ? aozoraText(plain) : null;
  const source = aozora ? aozora.text : plain;
  const map = numberSource(source,{mode:options['--mode'] || 'line',prefix:options['--prefix'] || 'p',start:Number(options['--start'] || 1),lang:options['--lang']});
  const batches = splitBatches(map.paragraphs,Number(options['--max-chars'] || 12000));
  const dir = path.resolve(options['--out']);
  await mkdir(path.dirname(dir),{recursive:true});
  await mkdir(dir); // Existing output directory is deliberately refused.
  await writeFile(path.join(dir,'source-numbered.txt'),numberedText(map.paragraphs),'utf8');
  await writeFile(path.join(dir,'source-map.json'),JSON.stringify(map,null,2),'utf8');
  await mkdir(path.join(dir,'batches'));
  for (const [i,batch] of batches.entries()) await writeFile(path.join(dir,'batches',`batch-${String(i+1).padStart(3,'0')}.txt`),sourcePacket(map,batch),'utf8');
  if (book) console.log(await writeEpubData(book,map,dir));
  if (aozora && aozora.ruby + aozora.notes + aozora.gaiji) console.log(`青空文庫标记：去掉读音 ${aozora.ruby} 处、排版注记 ${aozora.notes} 处`
    + (aozora.gaiji ? `；${aozora.gaiji} 个外字无法还原，原文中留作 ※，请对照底本补字` : '') + '。');
  console.log(`已编号 ${map.paragraphs.length} 段，${batches.length} 批（原文语言 ${map.lang}${options['--lang']?'':'，按原文判断；不对时换新目录加 --lang 重新编号'}）：${dir}\n原文未修改；source-map.json 保存编号，续作时沿用。分批按字符数参考值，不是 token 或语义场景切分。`);
} catch (error) {
  console.error(error.code === 'EEXIST' ? '输出目录已存在，请使用新的目录；没有覆盖旧文件。' : error.message);
  process.exitCode = 1;
}

// EPUB extras: chapter table from the book's contents, original images and where they sit.
async function writeEpubData(book,map,dir) {
  const images={},ids=new Map(),skipped=[];
  await mkdir(path.join(dir,'images'));
  for (const file of [...new Set([...(book.cover?[book.cover]:[]),...book.images.map(i => i.path)])]) {
    const bytes=await book.read(file),header=imageHeader(bytes);
    if (!header) { skipped.push({path:file,reason:'不是 PNG／JPEG／WebP'}); continue; }
    // Tiny inline glyphs and ornaments are not illustrations.
    if (file!==book.cover && Math.min(header.width,header.height)<64) continue;
    const oversized = header.width>8192 || header.height>8192 || header.width*header.height>33554432 || bytes.length>20*1024*1024;
    if (oversized) { skipped.push({path:file,reason:'图片过大'}); continue; }
    const id=createHash('sha256').update(bytes).digest('hex'),name=`images/${id}.${{'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[header.type]}`;
    const caption=book.images.find(i => i.path===file && i.caption)?.caption;
    if (!images[id]) {
      images[id]={file:name,name:file.split('/').pop().slice(0,255),...(caption?{caption}:{}),type:header.type,width:header.width,height:header.height};
      await writeFile(path.join(dir,name),bytes);
    }
    ids.set(file,id);
  }
  const data={schema:'vn-epub-1',title:book.title,author:book.author,description:book.description,
    chapters:book.chapters.map(c => ({start:map.paragraphs[c.line].id,title:c.title})),
    images,cover:ids.get(book.cover)??null,
    placements:book.images.filter(i => ids.has(i.path)).map(i => ({imageId:ids.get(i.path),after:i.after<0?null:map.paragraphs[i.after].id})),
    skipped};
  await writeFile(path.join(dir,'epub.json'),JSON.stringify(data,null,2),'utf8');
  const skippedNote = skipped.length ? `，跳过 ${skipped.length} 张` : '';
  return `EPUB：《${data.title}》，目录 ${data.chapters.length} 章，原书图片 ${Object.keys(images).length} 张（${data.placements.length} 处）${skippedNote}；见 epub.json。`;
}
