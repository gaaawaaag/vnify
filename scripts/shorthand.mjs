// @ts-check
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {readSourceMap, inspectScript} from '../src/conversion/workflow.js';
import {unitsView, expandShorthand, renderReview, SHORTHAND_SUFFIX} from '../src/conversion/shorthand.js';
import {completeEntityDeclarations} from '../src/conversion/entity-declarations.js';
import {readRecord} from '../src/core/text-record.js';

const usage=[
  'node scripts/shorthand.mjs units <project.json> --from <来源> --to <来源> [--out <文件>]',
  'node scripts/shorthand.mjs expand <project.json> <简写稿.vns.txt> [--out <part.vn.txt>] [--review <核对清单.txt>]',
].join('\n');

/** @param {string[]} args @param {string[]} flags */
function readFlags(args,flags) {
  /** @type {Record<string,string>} */
  const options={};
  while(args.length) {
    const flag=args.shift()??'',value=args.shift();
    if(!flags.includes(flag)||!value||value.startsWith('--')||Object.hasOwn(options,flag))throw new Error(usage);
    options[flag]=value;
  }
  return options;
}

/** @param {string} file @param {string} content */
async function save(file,content) {
  const target=path.resolve(file);
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,content,'utf8');
}

// Entities declared in the project's other parts, so a batch only declares what is new to it.
/** @param {any} project @param {string} base @param {string} self */
async function knownEntities(project,base,self) {
  const registry=new Map();
  for(const part of project.parts) {
    const file=path.resolve(base,part.script);
    if(file===self)continue;
    const text=await readFile(file,'utf8').catch(()=>'');
    for(const line of text.split(/\r?\n/)) {
      const m=/^@(character|location)\s/.exec(line.trim());
      if(!m)continue;
      try {
        const {pos:[id],attrs}=readRecord(line,1,['label','color']);
        if(!registry.has(id))registry.set(id,{kind:m[1],id,label:attrs.label,color:attrs.color});
      } catch {/* The part's own check reports malformed declarations. */}
    }
  }
  return [...registry.values()];
}

try {
  const args=process.argv.slice(2),command=args.shift(),projectFile=args.shift();
  if(!projectFile||!['units','expand'].includes(command??''))throw new Error(usage);
  const projectPath=path.resolve(projectFile),base=path.dirname(projectPath);
  const project=JSON.parse(await readFile(projectPath,'utf8'));
  if(typeof project.sourceMap!=='string'||!Array.isArray(project.parts))throw new Error('制作清单需要 sourceMap 与 parts。');
  const map=readSourceMap(JSON.parse(await readFile(path.resolve(base,project.sourceMap),'utf8')));
  if(command==='units') {
    const options=readFlags(args,['--from','--to','--out']);
    if(!options['--from']||!options['--to'])throw new Error(usage);
    const view=unitsView(map,options['--from'],options['--to']);
    if(options['--out'])await save(options['--out'],view);
    else process.stdout.write(view);
  } else {
    const draftFile=args.shift();
    if(!draftFile||draftFile.startsWith('--'))throw new Error(usage);
    const options=readFlags(args,['--out','--review']);
    const draftPath=path.resolve(draftFile);
    const part=project.parts.find(p=>path.resolve(base,p.script)===draftPath);
    if(!part)throw new Error(`制作清单的 parts 里没有 ${draftFile}；先登记它的来源范围。`);
    if(!draftPath.endsWith(SHORTHAND_SUFFIX))throw new Error(`简写稿文件名以 ${SHORTHAND_SUFFIX} 结尾。`);
    const {script,review}=expandShorthand(await readFile(draftPath,'utf8'),map,{from:part.from,to:part.to});
    const from=map.paragraphs.findIndex(p=>p.id===part.from),to=map.paragraphs.findIndex(p=>p.id===part.to);
    const check=inspectScript(completeEntityDeclarations(script,await knownEntities(project,base,draftPath)),map.paragraphs.slice(from,to+1),
      {annotationSources:map.paragraphs});
    if(options['--out'])await save(options['--out'],script);
    const sheet=renderReview(review);
    if(options['--review'])await save(options['--review'],sheet);
    console.log(JSON.stringify({
      ok:!check.missing.length&&!check.unknown.length,
      units:check.story.units.length,missingSources:check.missing,unknownSources:check.unknown,sourceHints:check.sourceHints,
      warnings:check.story.warnings,rewrites:review.rewrites.length,drops:review.drops.length,hints:review.warnings.length,
      ...(options['--review']?{}:{review:sheet}),
    },null,2));
    if(check.missing.length||check.unknown.length)process.exitCode=1;
  }
} catch(error) {
  console.error(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)},null,2));
  process.exitCode=1;
}
