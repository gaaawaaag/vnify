import {readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {decodePng,encodePng} from '../src/production/png.js';
import {removeBackground,checkerPreview} from '../src/production/cutout.js';

const usage='用法：node scripts/cutout.mjs 纯色背景.png --out 透明.png [--preview 预览.png] [--tolerance 24] [--soft 72] [--keep-holes]';
const absent=async file=>{try{await access(file);throw new Error(`目标已存在，保留原文件：${file}`);}catch(e){if(e.code!=='ENOENT')throw e;}};
try {
  const args=process.argv.slice(2),input=args.shift(),options={};
  if(!input||input.startsWith('--'))throw new Error(usage);
  while(args.length) {
    const flag=args.shift();
    if(flag==='--keep-holes'){options.keepHoles=true;continue;}
    const value=args.shift();
    if(!['--out','--preview','--tolerance','--soft'].includes(flag)||value===undefined||Object.hasOwn(options,flag))throw new Error(usage);
    options[flag]=value;
  }
  if(!options['--out'])throw new Error(usage);
  const number=(flag,max)=>{
    if(options[flag]===undefined)return undefined;
    const value=Number(options[flag]);
    if(!Number.isFinite(value)||value<1||value>max)throw new Error(`${flag} 须为 1–${max} 的数字。`);
    return value;
  };
  const out=path.resolve(options['--out']),preview=options['--preview']&&path.resolve(options['--preview']);
  if(!/\.png$/i.test(out)||preview&&!/\.png$/i.test(preview))throw new Error('输出须为 .png 文件。');
  if(out===path.resolve(input)||preview===out)throw new Error('输出不能覆盖输入或彼此相同。');
  await absent(out);if(preview)await absent(preview);
  const bytes=await readFile(input);
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('只接受 PNG；请让生图工具输出 PNG，或先转换为 PNG。');
  const {image,report}=removeBackground(decodePng(bytes),{tolerance:number('--tolerance',200),soft:number('--soft',200),keepHoles:options.keepHoles});
  await writeFile(out,encodePng(image));
  if(preview)await writeFile(preview,encodePng(checkerPreview(image)));
  const warnings=[];
  if(report.transparent<.15)warnings.push('去掉的背景不到 15%，可能人物和背景色太接近或背景不纯');
  if(report.transparent>.9)warnings.push('去掉了 90% 以上，人物可能被当成背景');
  console.log(JSON.stringify({output:out,...(preview?{preview}:{}),...report,transparent:Number(report.transparent.toFixed(3)),warnings},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
