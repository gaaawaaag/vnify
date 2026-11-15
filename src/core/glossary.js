// World terms are matched in plain reading text by their exact names; the script itself
// carries no term markup. A term is marked at most once per scene (block), longest name first,
// and never inside a character mention or an original note.
export const termNames=term=>[term.label,...term.aliases];
// Character labels and every name they are revealed under; terms never split or replace them.
export function personNames(story) {
  const names=new Set();
  for(const e of story.entities.values())if(e.kind==='character')names.add(e.label);
  for(const u of story.units)for(const [id,reveal] of u.revealed)if(story.entities.get(id)?.kind==='character')names.add(reveal.label);
  return names;
}

function scan(text,names) {
  const found=[];
  for(let at=0;at<text.length;) {
    const hit=names.find(n=>text.startsWith(n.name,at));
    // A person name is consumed unmarked, so a term like 格森 never splits 格森恩.
    if(hit){if(hit.id)found.push({start:at,end:at+hit.name.length,id:hit.id});at+=hit.name.length;}
    else at++;
  }
  return found;
}

// terms: [{id,label,aliases,summary}] → first occurrence per term and the runs to display.
export function matchTerms(story,terms) {
  const first=new Map(),runs=new Map();
  if(!terms.length)return {first,runs};
  const names=[...terms.flatMap(t=>termNames(t).map(name=>({name,id:t.id}))),...[...personNames(story)].map(name=>({name,id:null}))]
    .sort((a,b)=>b.name.length-a.name.length);
  let block=null,marked=new Set();
  for(const [index,unit] of story.units.entries()) {
    // Once per block keeps a reminder in each scene without underlining every line.
    if(unit.block.id!==block){block=unit.block.id;marked=new Set();}
    let changed=false;
    const next=unit.runs.flatMap(run=>{
      if(run.characterId||run.annotation||run.term)return [run];
      const hits=[];
      for(const hit of scan(run.text,names))if(!marked.has(hit.id)){marked.add(hit.id);hits.push(hit);}
      if(!hits.length)return [run];
      changed=true;
      const parts=[];let at=0;
      for(const hit of hits) {
        if(!first.has(hit.id))first.set(hit.id,index);
        if(hit.start>at)parts.push({...run,text:run.text.slice(at,hit.start)});
        parts.push({...run,text:run.text.slice(hit.start,hit.end),term:hit.id});
        at=hit.end;
      }
      if(at<run.text.length)parts.push({...run,text:run.text.slice(at)});
      return parts;
    });
    if(changed)runs.set(index,next);
  }
  return {first,runs};
}
