// Screenshots of the reading states a theme must cover, at desktop and narrow sizes.
// Usage: node scripts/theme-shots.mjs <themeId> [outDir]   (needs the Electron dev dependency: npm install)
//        node scripts/theme-shots.mjs <themeId> --book <shelf book folder> [--steps 0,1,2,…] [outDir]
// The examples have no pictures; --book shoots a real book (backgrounds, figures, avatars) from a copy of its folder
// (the shelf's library/<bookId>), at the given unit counts, plus the menu and the Cast, gallery, settings and history.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i<0?null:args.splice(i,2)[1];};
const book=flag('--book'),steps=(flag('--steps')??'0,1,2,3,4,5,6,8,10,12,16,20').split(',').map(Number);
const [theme,out=path.join(root,'theme-shots',(theme??'')+(book?'-'+path.basename(path.resolve(book)):''))]=args;
if(!theme){console.error('用法：node scripts/theme-shots.mjs <主题ID> [--book <书架作品文件夹>] [--steps 0,1,2] [输出目录]');process.exit(1);}
const shots=['rainy-visit.vn.txt#title','rainy-visit.vn.txt#2','rainy-visit.vn.txt#9','rainy-visit.vn.txt#10','rainy-visit.vn.txt#5',
  'dream-memory.vn.txt#4','dream-memory.vn.txt#7','pages.vn.txt#2','documents.vn.txt#1','annotations.vn.txt#1','cut-in.vn.txt#0',
  'cut-in.vn.txt#3','standing-portraits.vn.txt#1','standing-portraits.vn.txt#1:avatar','window:cast','window:settings','window:history','hover'];
const bookShots=['title',...steps.map(step=>`step-${String(step).padStart(3,'0')}`),'menu','cast','gallery','settings','history'];
// The electron package exports the path of its binary.
const electron=createRequire(import.meta.url)('electron');
for(const [name,viewport] of [['desktop',[1280,800]],['narrow',[390,844]]]) {
  const dir=path.join(out,name);
  const run=book
    ?['scripts/browser/book-shots.mjs',JSON.stringify({theme,book:path.resolve(book),out:dir,viewport,steps})]
    :['scripts/browser/electron-run.mjs','scripts/browser/style-snapshot.js',path.join(out,`${name}.json`),JSON.stringify({returnSnapshot:true,theme,shots,shotsDir:dir,viewport})];
  const result=spawnSync(electron,run,{cwd:root,encoding:'utf8'});
  if(result.status!==0){console.error(result.stderr||result.stdout);process.exit(1);}
  console.log(`${name}: ${dir}`);
}
// A page that puts the desktop and narrow shots side by side for review.
const {writeFile}=await import('node:fs/promises');
const rows=(book?bookShots:shots).map(name=>{const file=name.replace(/[^\w.-]+/g,'_')+'.png';
  return `<h2>${name}</h2><div class="row"><img src="desktop/${file}" alt=""><img src="narrow/${file}" alt=""></div>`;}).join('\n');
await writeFile(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>${theme} · 主题截图</title>
<style>body{background:#222;color:#ddd;font:14px system-ui;margin:24px}.row{display:flex;gap:16px;align-items:flex-start}
.row img:first-child{width:min(960px,70vw)}.row img:last-child{width:min(260px,22vw)}h2{font-size:13px;font-weight:500;margin:28px 0 8px}</style>
<h1>${theme}${book?' · '+path.basename(path.resolve(book)):''}</h1>\n${rows}\n`);
console.log(`index: ${path.join(out,'index.html')}`);
