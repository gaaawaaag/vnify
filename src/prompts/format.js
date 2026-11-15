// Shared prompt format; independent of conversion, reader, filesystem and UI state.
export async function readPromptLibrary(readText) {
  const manifest=JSON.parse(await readText('manifest.json'));
  if(manifest.schema!=='vn-prompt-library-1'||!Array.isArray(manifest.modules))throw new Error('提示词清单格式无效。');
  const texts={},slots={},sources={},ids=new Set(),paths=new Set();
  const files=await Promise.all(manifest.modules.map(async module=>{
    if(!/^[A-Z]+\d+$/.test(module.id)||ids.has(module.id)||!Array.isArray(module.fragments))throw new Error('提示词模块 ID 重复或无效。');
    ids.add(module.id);
    if(!/^[a-z0-9-]+\/[a-z0-9-]+\.md$/.test(module.path)||paths.has(module.path))throw new Error('提示词模块路径重复或无效。');
    paths.add(module.path);
    return (await readText(module.path)).replace(/\r\n?/g,'\n');
  }));
  for(const [i,module] of manifest.modules.entries()) {
    const found=new Map();
    for(const match of files[i].matchAll(/<!-- prompt:([a-zA-Z0-9.-]+) -->\n([\s\S]*?)\n<!-- \/prompt -->/g)) {
      if(found.has(match[1]))throw new Error(`重复提示词片段：${match[1]}`);
      found.set(match[1],match[2]);
    }
    if(found.size!==module.fragments.length||(files[i].match(/<!-- prompt:/g)||[]).length!==found.size||(files[i].match(/<!-- \/prompt -->/g)||[]).length!==found.size)throw new Error(`模块标记与清单不一致：${module.path}`);
    for(const fragment of module.fragments) {
      const text=found.get(fragment.id);
      if(text===undefined||Object.hasOwn(texts,fragment.id))throw new Error(`提示词片段缺失或重复：${fragment.id}`);
      const fields=[...new Set([...text.matchAll(/⟪([a-zA-Z][a-zA-Z0-9]*)⟫/g)].map(m=>m[1]))].sort();
      const declared=Object.keys(fragment.slots??{}).sort();
      if(JSON.stringify(fields)!==JSON.stringify(declared)||/[⟪⟫]/.test(text.replace(/⟪([a-zA-Z][a-zA-Z0-9]*)⟫/g,'')))throw new Error(`占位字段与清单不一致：${fragment.id}`);
      texts[fragment.id]=text;slots[fragment.id]=fields;sources[fragment.id]=module.path;
    }
  }
  // Composites retain an existing wrapper's order while its rules live in separate logical modules.
  for(const [id,parts] of Object.entries(manifest.composites??{})) {
    if(Object.hasOwn(texts,id)||!Array.isArray(parts)||!parts.length||parts.some(p=>!Object.hasOwn(texts,p)))throw new Error(`提示词组合无效：${id}`);
    texts[id]=parts.map(p=>texts[p]).join('');slots[id]=[...new Set(parts.flatMap(p=>slots[p]))].sort();sources[id]=parts.map(p=>sources[p]);
  }
  // A language variant `<id>.<lang>` stands in for `<id>` in works of that language and takes the same fields.
  for(const id of Object.keys(texts)) {
    const m=/^(.+)\.(en|ja|zh-Hant)$/.exec(id);
    if(m&&(!Object.hasOwn(texts,m[1])||JSON.stringify(slots[id])!==JSON.stringify(slots[m[1]])))throw new Error(`语言版本须对应同字段的片段：${id}`);
  }
  for(const [id,parts] of Object.entries(manifest.recipes??{}))if(!Array.isArray(parts)||!parts.length||parts.some(p=>!Object.hasOwn(texts,p)||slots[p].length))throw new Error(`默认预设配方无效：${id}`);
  return {schema:manifest.schema,texts,slots,recipes:manifest.recipes,sources};
}

/** The fragment ID used for a work's language: its variant when one exists. */
export const languageFragment=(library,id,lang)=>lang&&lang!=='zh'&&Object.hasOwn(library.texts,`${id}.${lang}`)?`${id}.${lang}`:id;

export function renderPromptFrom(library,requested,values={},lang) {
  if(!Object.hasOwn(library.texts,requested))throw new Error(`未知提示词片段：${requested}`);
  const id=languageFragment(library,requested,lang);
  for(const field of library.slots[id])if(!Object.hasOwn(values,field)||values[field]===undefined)throw new Error(`提示词 ${id} 缺少字段：${field}`);
  // One pass: inserted source text is never interpreted as a template or executable code.
  return library.texts[id].replace(/⟪([a-zA-Z][a-zA-Z0-9]*)⟫/g,(_,field)=>String(values[field]));
}

export function promptRecipeFrom(library,name,lang) {
  if(!Object.hasOwn(library.recipes,name))throw new Error(`未知提示词配方：${name}`);
  return library.recipes[name].map(id=>renderPromptFrom(library,id,{},lang)).join('');
}
