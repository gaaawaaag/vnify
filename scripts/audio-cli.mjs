// Shared by scripts/sounds.mjs and scripts/music.mjs: flags, the source list and the numbered hits printed for the agent.

/** Flags given as `--name value` pairs, only the allowed ones. @param {string[]} args @param {string[]} allowed @param {string} usage */
export function flagsOf(args,allowed,usage) {
  const flags=new Map();
  for(let i=0;i<args.length;i+=2) {
    if(!allowed.includes(args[i])||args[i+1]===undefined)throw new Error(usage);
    flags.set(args[i],args[i+1]);
  }
  return flags;
}

/** The sources to search, in order, from `local,freesound`. @param {string|undefined} value @param {string[]} known */
export function sourcesOf(value,known) {
  if(!value)return known;
  const list=value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!list.length||list.some(s=>!known.includes(s)))throw new Error(`来源只能是 ${known.join('、')}。`);
  return [...new Set(list)];
}

/** What the agent reads of a search: notes, then each hit numbered with what tells it apart. @param {{results:any[],notes:string[]}} found */
export const hitList=found=>({notes:found.notes,hits:found.results.map((hit,n)=>({n,source:hit.source,name:hit.name,
  ...(hit.notes?{notes:hit.notes}:{}),duration:hit.duration,author:hit.author,license:hit.license}))});
