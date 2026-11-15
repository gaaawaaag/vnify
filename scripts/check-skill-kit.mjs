import {readFile,writeFile,mkdtemp,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {parseScript} from '../src/core/parser.js';
import {readDirectors} from '../src/core/director.js';
import {importStoryPackage} from '../src/reader/story-package.js';
import {ScriptDirector} from '../src/conversion/script-director.js';
import {writeZip} from '../src/core/zip-store.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const dir=await mkdtemp(path.join(tmpdir(),'vn-skill-kit-'));
const put=(name,value)=>writeFile(path.join(dir,name),typeof value==='string'?value:JSON.stringify(value,null,2));
function run(script,...args){
  const result=spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:dir,encoding:'utf8'});
  assert.equal(result.status,0,`${script}: ${result.stderr}\n${result.stdout}`);return result.stdout;
}
try {
  let manifest;
  try{await access(path.join(root,'baseline-manifest.json'));manifest=JSON.parse(await readFile(path.join(root,'baseline-manifest.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const file of manifest?.files??[]){const bytes=await readFile(path.join(root,file.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,`文件变化：${file.path}`);}
  await put('source.txt','守塔人站在灯前。\n灯照亮了白塔旧址①。\n译者注①：旧钟楼遗址的俗称。\n守塔人走下楼梯。\n');
  run('number-source.mjs','source.txt','--out','numbered');
  const header='@vn 0.10\n@book kit-smoke title="灯塔"\n@character keeper label="守塔人"\n@chapter ch1 title="重明"\n';
  await put('part1.vn.txt',header+'// @vn-note {"id":"n1","text":"译者注：旧钟楼遗址的俗称。","source":["p000003"]}\n@scene b1\n@source p000001\n{{keeper|守塔人}}站在灯前。\n@source p000002\n灯照亮了{{note:n1|白塔旧址}}。\n');
  await put('part2.vn.txt',header+'// @source-use p000003 kind=annotation reason="原注随正文保存"\n@scene b2\n@source p000004\n{{keeper|守塔人}}走下楼梯。\n');
  await put('dossier.txt','@dossier 2\n@intro keeper summary="看守灯塔的人。"\n');
  const chapter={id:'ch1',title:'重明'};
  await put('project.json',{schema:'vn-agent-1',book:{id:'kit-smoke',title:'灯塔'},sourceMap:'numbered/source-map.json',parts:[{script:'part1.vn.txt',from:'p000001',to:'p000002',chapter},{script:'part2.vn.txt',from:'p000003',to:'p000004',chapter}],dossiers:[{file:'dossier.txt',from:'p000001',to:'p000004'}]});
  run('assemble-vn.mjs','project.json','--out','story.vn.txt','--context','context.txt');run('validate.mjs','story.vn.txt','--strict');
  const body=await readFile(path.join(dir,'story.vn.txt'),'utf8');assert.match(body,/译者注：旧钟楼遗址的俗称/);assert.equal(parseScript(body).units.length,3);
  // Shorthand drafts: numbered batch source, expansion with a review sheet, and assembly straight from .vns.txt.
  await put('short-project.json',{schema:'vn-agent-1',book:{id:'kit-smoke',title:'灯塔'},sourceMap:'numbered/source-map.json',dossier:{mode:'off'},dossiers:[],
    parts:[{script:'short.vns.txt',from:'p000001',to:'p000004',chapter}]});
  run('shorthand.mjs','units','short-project.json','--from','p000001','--to','p000004','--out','short-src.txt');
  assert.match(await readFile(path.join(dir,'short-src.txt'),'utf8'),/\n2a 灯照亮了白塔旧址①。/);
  await put('short.vns.txt',header+'// @vn-note {"id":"n1","text":"译者注：旧钟楼遗址的俗称。","source":["3"]}\n@alias keeper=守塔人\n@scene b1\n1a\n'
    +'2a: 灯照亮了{{note:n1|白塔旧址}}。\n4a\n');
  assert.equal(JSON.parse(run('shorthand.mjs','expand','short-project.json','short.vns.txt','--review','short-review.txt')).ok,true);
  assert.match(await readFile(path.join(dir,'short-review.txt'),'utf8'),/删「①」/);
  run('assemble-vn.mjs','short-project.json','--out','short.vn.txt');run('validate.mjs','short.vn.txt','--strict');
  assert.match(await readFile(path.join(dir,'short.vn.txt'),'utf8'),/@source p000001\n\{\{keeper\|守塔人\}\}站在灯前。/);
  const current={format:'vn-agent-director-1',input:'story.vn.txt',options:{protocolVersion:13,enabled:true,ambients:true,locationBackgrounds:true,cgs:true,standing:true,styleMode:'model'},
    visualProfiles:[{id:'keeper',note:'灰白短发，藏蓝外套。'}],directors:{}};
  await put('v11-project.json',current);
  run('direct-vn.mjs','v11-project.json','--packet','ch1','--out','v11-packet.txt');
  const currentPacket=await readFile(path.join(dir,'v11-packet.txt'),'utf8');assert.match(currentPacket,/Director version 13/);
  run('direct-vn.mjs','v11-project.json','--design-packet','--out','design-packet.txt');
  assert.match(await readFile(path.join(dir,'design-packet.txt'),'utf8'),/"id":"keeper".*灰白短发/);
  await put('design.json',{artStyles:{background:'Quiet ink wash.',character:'Soft painted illustration.'},characters:[{characterId:'keeper',face:'DESIGNED_FACE',body:''}],backgrounds:[],
    titleCard:{prompt:'DESIGNED_COVER'}});
  await put('design-project.json',{...current,design:'design.json'});
  run('direct-vn.mjs','design-project.json','--packet','ch1','--out','design-ch1-packet.txt');
  assert.match(await readFile(path.join(dir,'design-ch1-packet.txt'),'utf8'),/DESIGNED_FACE/);
  const styles={background:'Quiet ink wash.',character:'Soft painted illustration.'};
  await put('v11-director.json',{version:13,chapterId:'ch1',artStyles:styles,characters:[{characterId:'keeper',evidence:['p000001'],assumptions:['短发与藏蓝色外套作为补全。'],face:'Short black hair, a narrow face, a navy collar.',body:'A navy coat from shoulders to waist.'}],ambients:[{id:'ch1.ambient',name:'微光',prompt:'A faint light on textured paper.'}],ambient:'ch1.ambient',ambientBlocks:[],backgrounds:[],omittedBlocks:['b1','b2'],cgs:[{id:'ch1.cg01',from:'b1:1',to:'b1:2',reason:'灯光重现。',prompt:'Light illuminating the old tower.'}]});
  current.directors.ch1='v11-director.json';await put('v11-project.json',current);
  run('direct-vn.mjs','v11-project.json','--jobs','--out','v11-jobs.json');
  const currentJobs=JSON.parse(await readFile(path.join(dir,'v11-jobs.json'),'utf8')).jobs;
  assert.deepEqual(currentJobs.map(t=>t.purpose),['background','cg','standing']);
  const standing=currentJobs.find(t=>t.purpose==='standing');assert.equal(standing.transparentBackground,true);assert.equal(standing.aspectRatio,'2:3');
  assert.equal(standing.prompt.split(styles.character).length-1,1);assert.ok(standing.prompt.includes('navy coat'));
  assert.ok(currentJobs.find(t=>t.purpose==='cg').prompt.includes(styles.character));
  run('direct-vn.mjs','v11-project.json','--out','v11.vn.txt');run('validate.mjs','v11.vn.txt','--strict');
  const currentRaw=await readFile(path.join(dir,'v11.vn.txt'),'utf8');
  assert.equal(readDirectors(currentRaw,parseScript(currentRaw))[0].generation.standing,true);
  assert.equal(new ScriptDirector(currentRaw,current.options).complete,true);
  const resume={...current,input:'v11.vn.txt',directors:{}};await put('v11-resume.json',resume);
  run('direct-vn.mjs','v11-resume.json','--jobs','--out','v11-resumed-jobs.json');
  assert.deepEqual(JSON.parse(await readFile(path.join(dir,'v11-resumed-jobs.json'),'utf8')).jobs,currentJobs);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWioAAAAASUVORK5CYII=','base64');await writeFile(path.join(dir,'cg.png'),png);
  current.images=[{file:'cg.png',purpose:'cg',width:1,height:1,refs:[{scope:'cgs',id:'ch1.cg01'}]}];await put('v11-project.json',current);
  run('direct-vn.mjs','v11-project.json','--out','story.vn.zip');
  const packed=await importStoryPackage(new Blob([await readFile(path.join(dir,'story.vn.zip'))]));assert.ok(packed.backgrounds.bindings.cgs['ch1.cg01']);assert.match(packed.raw,/译者注：旧钟楼遗址的俗称/);
  assert.equal(readDirectors(packed.raw,parseScript(packed.raw))[0].version,13);
  // A registered book design adds the cover; its image is registered without refs.
  await put('cover-project.json',{...current,design:'design.json'});
  run('direct-vn.mjs','cover-project.json','--jobs','--out','cover-jobs.json');
  const cover=JSON.parse(await readFile(path.join(dir,'cover-jobs.json'),'utf8')).jobs.find(t=>t.purpose==='title-card');
  assert.ok(cover.prompt.includes('DESIGNED_COVER')&&cover.prompt.includes(styles.character));
  await put('cover-project.json',{...current,design:'design.json',images:[...current.images,{file:'cg.png',purpose:'title-card',width:1,height:1}]});
  run('direct-vn.mjs','cover-project.json','--out','cover.vn.zip');
  assert.ok((await importStoryPackage(new Blob([await readFile(path.join(dir,'cover.vn.zip'))]))).backgrounds.bindings.titleCard);
  const packedProject={...current,input:'story.vn.zip',directors:{}};delete packedProject.images;await put('packed-project.json',packedProject);
  run('direct-vn.mjs','packed-project.json','--jobs','--out','remaining.json');
  assert.deepEqual(JSON.parse(await readFile(path.join(dir,'remaining.json'),'utf8')).jobs.map(t=>t.purpose),['background','standing']);
  // Background removal: a square on a flat background loses the background and keeps the square.
  const {encodePng,decodePng}=await import('../src/production/png.js');
  const flat=new Uint8Array(32*32*4).map((_,i)=>{const p=i>>2,x=p%32,y=p>>5,inside=x>8&&x<24&&y>8&&y<24;return i%4===3?255:inside?[200,40,40][i%4]:[0,176,64][i%4];});
  await writeFile(path.join(dir,'flat.png'),encodePng({width:32,height:32,data:flat}));
  run('cutout.mjs','flat.png','--out','cut.png');
  const cut=decodePng(await readFile(path.join(dir,'cut.png')));assert.deepEqual([cut.data[3],cut.data[(16*32+16)*4+3]],[0,255]);
  // EPUB: a preface kept as Extra and one illustration travel from number-source through the Director package.
  const page=body=>Buffer.from(`<html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`);
  const plate=Buffer.alloc(40);plate.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);plate.writeUInt32BE(600,16);plate.writeUInt32BE(800,20);
  const epub=writeZip([['META-INF/container.xml',Buffer.from('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>')],
    ['book.opf',Buffer.from('<package><metadata><title>灯塔</title></metadata><manifest><item id="f" href="f.xhtml" media-type="application/xhtml+xml"/>'
      +'<item id="c" href="c.xhtml" media-type="application/xhtml+xml"/><item id="i" href="i.png" media-type="image/png"/></manifest><spine><itemref idref="f"/><itemref idref="c"/></spine></package>')],
    ['f.xhtml',page('<p>序</p><p>作者的话。</p>')],['c.xhtml',page('<p>守塔人站在灯前。</p><img src="i.png"/><p>灯亮了。</p>')],['i.png',plate]]);
  await writeFile(path.join(dir,'book.epub'),new Uint8Array(await epub.arrayBuffer()));
  run('number-source.mjs','book.epub','--out','epub');
  await put('epub/part.vn.txt',['@vn 0.10','@book kit-epub title="灯塔"','@chapter ch1 title="灯"','// @source-use p000001 kind=excluded reason="序"',
    '// @source-use p000002 kind=excluded reason="序"','@scene b1','@source p000003','守塔人站在灯前。','@source p000004','灯亮了。',''].join('\n'));
  await put('epub/project.json',{schema:'vn-agent-1',book:{id:'kit-epub',title:'灯塔'},sourceMap:'source-map.json',epub:'epub.json',dossier:{mode:'off'},dossiers:[],
    extra:[{title:'序',from:'p000001',to:'p000002'}],parts:[{script:'part.vn.txt',from:'p000001',to:'p000004',chapter:{id:'ch1',title:'灯'}}]});
  run('assemble-vn.mjs','epub/project.json','--out','epub/story.vn.txt','--package','epub/story.vn.zip');
  await put('epub/director.json',{version:13,chapterId:'ch1',artStyles:styles,characters:[],ambients:[{id:'ch1.ambient',name:'微光',prompt:'A faint light.'}],ambient:'ch1.ambient',ambientBlocks:[],backgrounds:[],omittedBlocks:['b1'],cgs:[]});
  await put('epub/director-project.json',{...current,visualProfiles:[],input:'story.vn.zip',directors:{ch1:'director.json'},images:[]});
  run('direct-vn.mjs','epub/director-project.json','--out','epub/directed.vn.zip');
  const extra=(await importStoryPackage(new Blob([await readFile(path.join(dir,'epub/directed.vn.zip'))]))).extra;
  assert.deepEqual(extra.items,[{title:'序',paragraphs:['作者的话。']}]);assert.deepEqual(extra.illustrations.map(i=>i.after),['p000003']);
  // Asset manager: the page (when built) and its routes over this production folder.
  const {startManagerServer}=await import('../src/server/manager-server.mjs');
  const server=await startManagerServer(0,{production:dir});
  try{
    const base=`http://127.0.0.1:${server.address().port}`;let built=false;
    try{await access(path.join(root,'dist-manager/index.html'));built=true;}catch{}
    if(built||manifest?.files.some(f=>f.path==='dist-manager/index.html')){const page=await fetch(`${base}/manager/`);assert.equal(page.status,200);assert.match(await page.text(),/<div id="root">/);}
    const presets=await fetch(`${base}/api/manager/presets`);assert.equal(presets.status,200);assert.ok((await presets.json()).presets);
  }finally{server.close();}
  console.log(JSON.stringify({ok:true,verifiedFiles:manifest?.files.length??0,checks:['编号','跨批原注','资料合并','严格校验','v11 请求/双画风/单图任务','已有导演稿重读不重做','v11 文件续跑','CG 绑定与包往返','缺图续跑','纯色背景去背','EPUB 编号与 Extra 作品包往返','资产管理器页面与接口'],artifacts:dir},null,2));
}catch(e){console.error(e);console.error(`保留检查材料：${dir}`);process.exitCode=1;}
