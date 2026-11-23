import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {readDirectors} from '../src/core/director.js';
import {IMAGE_TYPES} from '../src/reader/backgrounds.js';
import {exportStoryPackage} from '../src/reader/story-package.js';
import {designPacket,storyDesignEntities} from '../src/conversion/book-design.js';
import {planImageJobs,attachReferences,sortReferences} from '../src/production/image-jobs.js';
import {readHolds,imageQueue,applyPromptOverrides} from '../src/production/image-tasks.js';
import {loadDirectorProject} from '../src/production/director-project.js';
import {packWork} from '../src/production/director-edits.js';
import {soundPacket} from '../src/conversion/sound-director.js';
const modes=['--design-packet','--packet','--sound-packet','--jobs'];
const usage='node scripts/direct-vn.mjs <project.json> [--design-packet | --packet <chapterId> | --sound-packet <chapterId> | --jobs] --out <file>';
try {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){console.log(usage);process.exit(0);}
  const input=args.shift(),flags={};
  if(!input||input.startsWith('--'))throw new Error(usage);
  while(args.length){
    const flag=args.shift();
    if(![...modes,'--out'].includes(flag)||flag in flags)throw new Error(usage);
    flags[flag]=['--design-packet','--jobs'].includes(flag)?true:args.shift();
    if(!flags[flag]||String(flags[flag]).startsWith('--'))throw new Error(usage);
  }
  if(!flags['--out']||modes.filter(k=>flags[k]).length>1)throw new Error(usage);
  const loaded=await loadDirectorProject(input);
  const {project,job,generation,chapters,directors,packed,backgrounds,characterImages,references,inputs,prompts,designConflicts,lookNotices}=loaded;
  const output=path.resolve(flags['--out']),canonical=p=>process.platform==='win32'?p.toLowerCase():p;
  if(inputs.some(p=>canonical(p)===canonical(output)))throw new Error('输出路径须与输入文件分开。');
  let content;
  const warnings=[];
  // Looks come from the source text: the convert stage hands them over, [] when the text describes no one and nowhere.
  const needProfiles=(generation.standing||generation.locationBackgrounds)&&project.visualProfiles===undefined&&(flags['--design-packet']||flags['--packet']&&project.design===undefined);
  if(needProfiles)throw new Error('清单缺少 visualProfiles：引用转换阶段的 visual-profiles.json（原文对人物与地点外观的描写摘录）；原文没有任何外观描写时写 []。');
  if(flags['--design-packet']){
    if(project.design!==undefined)throw new Error('清单已登记全书设计；修改时直接编辑该文件，或移除 design 后重新生成 packet。');
    content=designPacket({book:job.story.book,...storyDesignEntities(job.story,job.visualProfiles??[]),settings:job.director,fixedStyles:job.artStyle,
      blurb:!job.story.blurb});
  }else if(flags['--sound-packet']){
    // The sound director's packet for one chapter, with the sounds the book has so far.
    content=soundPacket(job.story,flags['--sound-packet'],job.story.sounds??null,project.soundOptions);
  }else if(flags['--packet']){
    if(!chapters.includes(flags['--packet']))throw new Error('packet 章节须属于 chapters。');
    content=job.packet(job.plan.findIndex(p=>p.chapter.id===flags['--packet']));
  }else if(flags['--jobs']){
    if(project.imageTasks!==undefined)throw new Error('imageTasks 已停用：暂缓的图片改写到 holds（任务 ID → 原因），其余状态由绑定推出。');
    const holds=readHolds(project.holds);
    // Use the package validator for all asset bindings, even when only listing jobs.
    await exportStoryPackage(job.readableOutput,backgrounds,{characterImages,extra:packed?.extra??null,audio:loaded.audio});
    const docs=readDirectors(job.readableOutput,job.story),assets={backgrounds,characterImages};
    const scope=chapters.length===job.plan.length?'all':{chapterIds:chapters};
    const relative=filename=>path.relative(path.dirname(output),filename).split(path.sep).join('/');
    const {usable,unused}=sortReferences(references.map(({filename,...ref})=>({...ref,file:relative(filename)})),job.story,docs);
    const planned=attachReferences(planImageJobs(job.story,docs,assets,scope,generation),job.story,usable);
    const {jobs,held}=imageQueue(applyPromptOverrides(planned,prompts),holds);
    // A variant job edits the bound default image; hand that image out as a file beside the queue.
    for(const task of jobs)if(task.referenceImageId) {
      const image=(task.purpose==='background'?backgrounds:characterImages).images[task.referenceImageId];
      const relative=`references/${task.referenceImageId}.${IMAGE_TYPES[image.type]}`;
      const filename=path.join(path.dirname(output),relative);
      await mkdir(path.dirname(filename),{recursive:true});await writeFile(filename,new Uint8Array(await image.blob.arrayBuffer()));
      task.referenceFile=relative;
    }
    const directorStatus=chapters.map(chapterId=>{
      const r=job.records[job.plan.findIndex(p=>p.chapter.id===chapterId)];
      const conflicts=designConflicts[chapterId]??[];
      return {chapterId,status:r.directorSaved?'complete':'pending',...(r.directorSaved?{}:{reason:r.directorError}),
        ...(conflicts.length?{designConflicts:conflicts}:{})};
    });
    content=JSON.stringify({directors:directorStatus,jobs,held,...(unused.length?{unusedReferences:unused}:{}),
      ...(lookNotices.length?{droppedLooks:lookNotices}:{})},null,2)+'\n';
  }else{
    for(const id of chapters){
      const record=job.records[job.plan.findIndex(p=>p.chapter.id===id)];
      if(!record.directorSaved)throw new Error(`${id}: ${record.directorError}`);
    }
    if(output.toLowerCase().endsWith('.vn.zip')){
      const {bytes,stats}=await packWork(loaded,input);
      content=bytes;
      if(stats.unavailable)warnings.push('没有安装 sharp（npm install sharp），图片保留原格式，没有转为 WebP。');
    }else if(output.toLowerCase().endsWith('.vn.txt'))content=job.readableOutput;
    else throw new Error('成品输出使用 .vn.txt 或 .vn.zip。');
  }
  // Quotes that could not be placed in the story are left out; say so once, without failing.
  if(lookNotices.length)warnings.push(`外观摘录有 ${lookNotices.length} 条在正文中找不到，已略去：`
    +lookNotices.map(n=>`${n.id} ${n.source}「${n.text.slice(0,20)}」（${n.reason}）`).join('；'));
  await mkdir(path.dirname(output),{recursive:true});await writeFile(output,content);
  console.log(JSON.stringify({ok:true,output,chapters,...(warnings.length?{warnings}:{})},null,2));
}catch(error){console.error(JSON.stringify({ok:false,error:error.message},null,2));process.exitCode=1;}
