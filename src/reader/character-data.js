import { extractDossiers, validateDossiers, applyDossierEvent } from '../core/dossier.js';
import {matchTerms} from '../core/glossary.js';

export function compileCharacters(raw, story, {complete=true} = {}) {
  const {documents}=extractDossiers(raw);
  const {events,terms}=validateDossiers(documents,story);
  // A partial book's last block still has a future successor.
  if(!complete) {
    for(const e of events)if(e.afterBlock && e.index===story.units.length-1)e.position=(e.index+1)*2;
    events.sort((a,b)=>a.position-b.position);
  }
  const histories=new Map(), firstSpeakers=new Map(), firstProfiles=new Map();
  for(const e of events) {
    const history=histories.get(e.characterId)||[];
    const state=applyDossierEvent(history.at(-1)?.state,e);
    if(history.at(-1)?.position===e.position)history[history.length-1]={position:e.position,state};
    else history.push({position:e.position,state});
    histories.set(e.characterId,history);
  }
  for(const [index,u] of story.units.entries()) {
    if(u.speakerId && !firstSpeakers.has(u.speakerId))firstSpeakers.set(u.speakerId,{index,label:u.speaker});
    for(const [id,reveal] of u.revealed) {
      if(reveal.profile && !firstProfiles.has(id))firstProfiles.set(id,{index,profile:story.entities.get(id).profiles.get(reveal.profile)});
    }
  }
  // World terms open where their name first appears; display runs carry the matches.
  const glossary={terms:new Map(terms.map(t=>[t.id,t])),runs:matchTerms(story,terms).runs};
  return {histories,firstSpeakers,firstProfiles,glossary};
}

export const termsAt=(compiled,index)=>[...compiled?.glossary.terms.values()??[]].filter(t=>t.first<=index).sort((a,b)=>a.first-b.first);

function stateAt(history=[],cutoff) {
  let lo=0,hi=history.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(history[mid].position<=cutoff)lo=mid+1;else hi=mid;}
  return history[lo-1]?.state;
}

export function castAt(story, compiled, index, complete) {
  const u=story.units[index]; if(!u)return [];
  const known=new Map(u.revealed);
  const result=[];
  for(const [id,reveal] of known) {
    const entity=story.entities.get(id);if(entity.kind!=='character')continue;
    const data=stateAt(compiled.histories.get(id),index*2+(complete?1:0));
    const original=compiled.firstProfiles.get(id);
    const appearance=data?.portraits.values().next().value?.facts || (original && original.index<=index ? original.profile?.facts : '') || '';
    result.push({id,label:reveal.label,fullName:data?.fullName||'',summary:data?.summary||'',group:data?.group||'',detailEntries:[...(data?.entries.values()||[])].map(e=>({text:e.text,category:e.category||'',target:e.target||''})),entries:[...(data?.entries.values()||[])].map(e=>e.text),appearance});
  }
  return result;
}

// Preserve first-visible order within groups; unclassified people stay last.
export function groupCharacters(characters) {
  const groups=new Map();
  for(const person of characters) {
    const name=person.group?.trim() || '';
    if(!groups.has(name))groups.set(name,[]);
    groups.get(name).push(person);
  }
  return [...groups].filter(([name])=>name).concat(groups.has('')?[['',groups.get('')]]:[])
    .map(([name,people])=>({name,people}));
}
