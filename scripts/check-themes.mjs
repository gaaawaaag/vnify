// Theme boundary check (docs/theme-guide.md). A theme.css may only contain @font-face rules and
// :root[data-theme="<id>"] blocks (optionally inside @media (max-width: 600px)) that set themeable
// custom properties; every url() must name an allowed file inside the theme's own folder.
// Usage: node scripts/check-themes.mjs [themeId ...]   (default: every registered theme)
import {readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {themeVariables, THEME_SLOTS, THEME_ICONS, ASSET_TYPES, LIMITS} from '../src/reader/theme-api.js';
import {readUiSounds} from '../src/reader/ui-sound-recipe.js';

// Splits at depth 0 on the given characters, skipping strings and parentheses.
function blocks(css) {
  const out=[];let i=0;
  while(i<css.length) {
    while(i<css.length&&/\s/.test(css[i]))i++;
    if(i>=css.length)break;
    let j=i,quote=null,paren=0;
    for(;j<css.length;j++){const c=css[j];if(quote){if(c===quote&&css[j-1]!=='\\')quote=null;continue;}if(c==='"'||c==="'")quote=c;else if(c==='(')paren++;else if(c===')')paren--;else if(!paren&&(c==='{'||c===';'))break;}
    const prelude=css.slice(i,j).trim();
    if(css[j]!=='{'){out.push({prelude,body:null});i=j+1;continue;}
    let depth=1,k=j+1;quote=null;
    for(;k<css.length&&depth;k++){const c=css[k];if(quote){if(c===quote&&css[k-1]!=='\\')quote=null;continue;}if(c==='"'||c==="'")quote=c;else if(c==='{')depth++;else if(c==='}')depth--;}
    out.push({prelude,body:css.slice(j+1,k-1)});i=k;
  }
  return out;
}
function declarations(body) {
  const out=[];let start=0,quote=null,paren=0;
  for(let i=0;i<=body.length;i++){
    const c=body[i];
    if(quote){if(c===quote&&body[i-1]!=='\\')quote=null;continue;}
    if(c==='"'||c==="'")quote=c;else if(c==='(')paren++;else if(c===')')paren--;
    else if((c===';'||i===body.length)&&!paren){const text=body.slice(start,i).trim();if(text)out.push(text);start=i+1;}
  }
  return out.map(text=>{const at=text.indexOf(':');return at<0?{name:text,value:''}:{name:text.slice(0,at).trim(),value:text.slice(at+1).trim()};});
}

// checkTheme({id, css, files: {relativePath: size}, tokensCss, icons?: {file, text}, sounds?: {file, text}}) → {errors, warnings, referenced}
export function checkTheme({id, css, files, tokensCss, icons=null, sounds=null}) {
  const errors=[],warnings=[],referenced=new Set(),allowed=themeVariables(tokensCss),set=new Set();
  const rootSelector=new RegExp(`^:root\\[data-theme=(["'])${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\1\\]$`);
  function urls(value,where) {
    if(/@import|expression\s*\(|javascript:/i.test(value))errors.push(`${where}：不允许 @import、expression 或 javascript:。`);
    for(const m of value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
      const target=(m[1]??m[2]??m[3]??'').trim();
      if(!target||/^[a-z][\w+.-]*:/i.test(target)||target.startsWith('/')||target.startsWith('\\')){errors.push(`${where}：url(${target}) 须为主题文件夹内的相对路径。`);continue;}
      const normal=path.posix.normalize(target.replace(/\\/g,'/'));
      if(normal.startsWith('..')){errors.push(`${where}：url(${target}) 不能指向主题文件夹之外。`);continue;}
      if(!Object.hasOwn(files,normal)){errors.push(`${where}：url(${target}) 指向的文件不存在。`);continue;}
      if(!['image','font'].includes(ASSET_TYPES[path.extname(normal).toLowerCase()]))errors.push(`${where}：url(${target}) 只能引用图片或字体。`);
      referenced.add(normal);
    }
  }
  function root(body,where) {
    for(const {name,value} of declarations(body)) {
      if(!name.startsWith('--'))errors.push(`${where}：只能设置主题变量，不能直接写属性 ${name}。`);
      else if(!allowed.has(name))errors.push(`${where}：${name} 不是可用的主题变量。`);
      urls(value,`${where} ${name}`);set.add(name);
    }
  }
  for(const {prelude,body} of blocks(css.replace(/\/\*[\s\S]*?\*\//g,''))) {
    if(body===null){errors.push(`不允许的顶层语句：${prelude.slice(0,60)}`);continue;}
    if(rootSelector.test(prelude.replace(/\s+/g,''))){root(body,prelude);continue;}
    if(/^@media\s*\(\s*max-width\s*:\s*600px\s*\)$/.test(prelude)) {
      for(const inner of blocks(body)) {
        if(inner.body!==null&&rootSelector.test(inner.prelude.replace(/\s+/g,'')))root(inner.body,`@media ${inner.prelude}`);
        else errors.push(`@media 内只能写 :root[data-theme="${id}"]：${inner.prelude.slice(0,60)}`);
      }
      continue;
    }
    if(prelude==='@font-face') {
      for(const {name,value} of declarations(body)) {
        if(!['font-family','src','font-weight','font-style','font-display','font-stretch','unicode-range'].includes(name))errors.push(`@font-face：不允许 ${name}。`);
        if(name==='font-family'&&!new RegExp(`^(["'])${id}-`).test(value))errors.push(`@font-face：字体名须以 "${id}-" 开头，避免与其他主题或默认字体冲突。`);
        urls(value,`@font-face ${name}`);
      }
      continue;
    }
    errors.push(`不允许的规则：${prelude.slice(0,60)}（主题只能设置变量，见 docs/theme-guide.md）`);
  }
  if(icons) {
    referenced.add(icons.file);
    if(/<script|<foreignObject|\son\w+\s*=|javascript:|<style/i.test(icons.text))errors.push(`${icons.file}：图标不能含脚本、样式、foreignObject 或事件属性。`);
    for(const m of icons.text.matchAll(/<symbol\b[^>]*\bid=(["'])([^"']+)\1/gi))
      if(!THEME_ICONS.includes(m[2]))warnings.push(`${icons.file}：${m[2]} 不是可替换的图标（可用：${THEME_ICONS.join('、')}）。`);
    for(const m of icons.text.matchAll(/<image\b[^>]*\b(?:xlink:)?href=(["'])([^"']*)\1/gi)) {
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(icons.file),m[2]));
      if(!m[2]||/^[a-z][\w+.-]*:|^[\\/]/i.test(m[2])||target.startsWith('..')||!Object.hasOwn(files,target))errors.push(`${icons.file}：图片 ${m[2]} 须为主题文件夹内存在的相对路径。`);
      else if(ASSET_TYPES[path.extname(target).toLowerCase()]!=='image')errors.push(`${icons.file}：${m[2]} 不是图片。`);
      else referenced.add(target);
    }
  }
  if(sounds) {
    referenced.add(sounds.file);
    let value=null;
    try{value=JSON.parse(sounds.text);}catch{errors.push(`${sounds.file}：不是有效的 JSON。`);}
    if(value!==null)for(const problem of readUiSounds(value).errors)errors.push(`${sounds.file}：${problem}`);
  }
  for(const slot of THEME_SLOTS)
    if(!set.has(`--${slot}-layer`)&&(set.has(`--${slot}-texture`)||set.has(`--${slot}-frame`)))warnings.push(`设置了 --${slot}-texture／--${slot}-frame，但没有 --${slot}-layer: ""，装饰层不会显示。`);
  let images=0,total=0;
  for(const [file,size] of Object.entries(files)) {
    const kind=ASSET_TYPES[path.extname(file).toLowerCase()];
    if(!kind){errors.push(`不允许的文件类型：${file}`);continue;}
    if(size>LIMITS.file)errors.push(`${file} 超过单个文件 ${LIMITS.file/1048576} MB 上限。`);
    if(kind==='image')images+=size;
    total+=size;
    if(kind!=='style'&&!referenced.has(file))warnings.push(`${file} 未被 theme.css 引用。`);
  }
  if(images>LIMITS.images)errors.push(`图片合计超过 ${LIMITS.images/1048576} MB。`);
  if(total>LIMITS.total)errors.push(`主题文件合计超过 ${LIMITS.total/1048576} MB。`);
  if(!Object.hasOwn(files,'theme.css'))errors.push('主题文件夹缺少 theme.css。');
  return {errors,warnings,referenced:[...referenced]};
}

async function listFiles(dir,base=dir) {
  const out={};
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())Object.assign(out,await listFiles(full,base));
    else out[path.relative(base,full).split(path.sep).join('/')]=(await stat(full)).size;
  }
  return out;
}
export async function checkRegisteredTheme(theme,root) {
  const errors=[];
  const expected=`styles/themes/${theme.id}/theme.css`;
  if(theme.stylesheet!==expected)errors.push(`登记的 stylesheet 须为 ${expected}。`);
  const dir=path.join(root,'styles','themes',theme.id);
  const [css,files,tokensCss]=await Promise.all([readFile(path.join(dir,'theme.css'),'utf8').catch(()=>''),listFiles(dir).catch(()=>({})),
    readFile(path.join(root,'styles','tokens.css'),'utf8')]);
  let icons=null;
  if(theme.icons!==undefined) {
    const prefix=`styles/themes/${theme.id}/`,file=String(theme.icons).startsWith(prefix)?String(theme.icons).slice(prefix.length):'';
    if(!file||path.extname(file).toLowerCase()!=='.svg'||!Object.hasOwn(files,file))errors.push(`登记的 icons 须为 ${prefix} 内存在的 .svg 文件。`);
    else icons={file,text:await readFile(path.join(dir,file),'utf8')};
  }
  let sounds=null;
  if(theme.sounds!==undefined) {
    const prefix=`styles/themes/${theme.id}/`,file=String(theme.sounds).startsWith(prefix)?String(theme.sounds).slice(prefix.length):'';
    if(!file||path.extname(file).toLowerCase()!=='.json'||!Object.hasOwn(files,file))errors.push(`登记的 sounds 须为 ${prefix} 内存在的 .json 文件。`);
    else sounds={file,text:await readFile(path.join(dir,file),'utf8')};
  }
  const result=checkTheme({id:theme.id,css,files,tokensCss,icons,sounds});
  return {...result,errors:[...errors,...result.errors]};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href) {
  const root=fileURLToPath(new URL('../',import.meta.url));
  await import(pathToFileURL(path.join(root,'src/reader/theme-registry.js')).href);
  const wanted=process.argv.slice(2),themes=globalThis.VN_THEME_REGISTRY.filter(t=>!wanted.length||wanted.includes(t.id));
  if(wanted.some(id=>!themes.some(t=>t.id===id)))console.error('未登记的主题：',wanted.filter(id=>!themes.some(t=>t.id===id)).join(', '));
  let failed=false;
  for(const theme of themes) {
    const {errors,warnings}=await checkRegisteredTheme(theme,root);
    console.log(`${theme.id}: ${errors.length?'未通过':'通过'}${warnings.length?`（${warnings.length} 条提醒）`:''}`);
    for(const e of errors)console.log(`  ✗ ${e}`);
    for(const w of warnings)console.log(`  · ${w}`);
    failed||=errors.length>0;
  }
  process.exitCode=failed?1:0;
}
