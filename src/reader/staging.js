import {presenceAt,presenceIds} from '../core/variants.js';
import {stageRangeAt} from '../core/stages.js';

// Standard places by how many stand: one in the middle, two left and right, three left, middle and right.
export const PLACES={1:['center'],2:['left','right'],3:['left','center','right']};
const ORDER=['left','center','right'];
// A standing character stays while they spoke in one of the latest RECENT_TURNS turns, counting the current one.
export const RECENT_TURNS=4;
// After this many narration units in a row naming nobody on stage, the stage clears.
export const QUIET_NARRATION=3;
const speaking=unit=>['dialogue','thought'].includes(unit.kind);
// A line marked as remembered or dreamt inside a present-time block is heard, not seen.
const recalled=unit=>unit.effect!=='none'&&unit.effect!==unit.block.effect;

/* The unit ranges of the scene at index. A present-time scene that follows only memories or dreams and stands in the
 * same place as the present-time scene before them, in the same chapter, resumes that scene: someone recounting the
 * past and then carrying on keeps the stage. */
function sceneSpans(story,index) {
  const units=story.units,blockAt=i=>units[i]?.block;
  const end=b=>{let i=b.index;while(units[i+1]?.block.index===b.index)i++;return i;};
  const resumed=b=>{
    if(b?.kind!=='scene'||b.effect!=='none')return null;
    let i=b.index-1;
    while(blockAt(i)&&blockAt(i).effect!=='none')i=blockAt(i).index-1;
    const before=blockAt(i);
    return i<b.index-1&&before?.kind==='scene'&&before.effect==='none'&&before.chapterId===b.chapterId
      &&!!before.loc&&before.loc===b.loc?before:null;
  };
  const blocks=[units[index].block];
  for(let b;(b=resumed(blocks[0]));)blocks.unshift(b);
  for(;;) {
    let i=end(blocks.at(-1))+1;
    while(blockAt(i)&&blockAt(i).effect!=='none')i=end(blockAt(i))+1;
    if(!blockAt(i)||resumed(blockAt(i))?.index!==blocks.at(-1).index)break;
    blocks.push(blockAt(i));
  }
  return blocks.map(b=>[b.index,end(b)]);
}

/* Who stands on stage at a reading position, and where, recomputed from the start of the scene so that going back,
 * jumping and reloading agree. Inside a scene a character stands from the first time they speak (dialogue or
 * thought) and stays while they spoke in one of the latest RECENT_TURNS turns (a turn is a run of lines by one
 * speaker, however long; narration is no turn), so both sides of a long exchange stay while a passer-by's line or two
 * passes. A run of more than QUIET_NARRATION narration units naming nobody standing clears the stage. Nothing looks
 * ahead: who leaves depends only on what has been read. The director's `present` records say who is there: `false`
 * takes a character off at once and keeps them off (they speak from off stage), `true` brings on characters entering
 * during the scene: they come on where their range starts and stay through it, except that a full stage loses them to
 * a speaker like anyone else, and they come back only once a place is free, never pushing off the people talking.
 * Someone present when the scene opens  * waits until they speak. When the stage is full, whoever has been silent longest leaves. `focus` is the latest
 * speaker still on stage, kept through narration until someone else speaks, or a standing character that narration
 * names alone among those standing. `offstage` says the latest speech came from someone not standing (a first-person
 * narrator, a voice, a guest), so everyone on stage steps back until a standing character speaks or is named.
 * A line marked as a memory or dream inside a present-time scene brings nobody on: its speaker, unless already
 * standing, speaks from off stage. A present-time scene resuming after a memory or dream continues the stage of the
 * scene it resumes (see sceneSpans).
 * Inside a director's stage range only its cast stands, in the order given (characters kept off by `present:false`
 * or unable to stand left out; on a smaller stage the current speaker and the most recently active are kept); anyone
 * else speaking does so from off stage. When the range ends the rule carries on from that cast. A range marked `join`
 * only brings its cast on beside whoever stands, and puts a lone newcomer in front while the narration runs. A range
 * the program added (`auto`) is passed over when none of its cast can stand.
 * Whenever someone arrives or leaves, those on stage spread out to the standard places for their number, keeping
 * their left-to-right order, so the middle is only ever taken by someone standing alone or between two others.
 * canStand(id) says whether a character can be drawn at all (disclosed, with a standing portrait). */
export function stageAt(story,index,{capacity,canStand,recentTurns=RECENT_TURNS,quietNarration=QUIET_NARRATION}) {
  const unit=story?.units[index];
  if(!unit||unit.block.kind!=='scene'||capacity<1)return {members:[],focus:null,offstage:false,places:{}};
  const spans=sceneSpans(story,index),positions=spans.flatMap(([from,to])=>Array.from({length:to-from+1},(_,k)=>from+k));
  const directed=presenceIds(story).filter(canStand),start=positions[0];
  const waiting=new Set(directed.filter(id=>presenceAt(story,id,start)===true));
  // The scene's turns: each line's turn number; off-stage voices and guests take turns too.
  const turnOf=new Map();
  let turn=-1,last;
  for(const i of positions) {
    const u=story.units[i];
    if(!speaking(u))continue;
    const who=u.speakerId??`guest:${u.guestSpeaker}`;
    if(who!==last){turn++;last=who;}
    turnOf.set(i,turn);
  }
  // `turn` on a member is the latest turn they spoke in, or the turn they came on at.
  let members=[],focus=null,offstage=false,now=-1,unnamed=0;
  const recent=m=>m.turn>now-recentTurns;
  const leave=id=>{
    members=members.filter(m=>m.id!==id);
    if(focus===id)focus=null;
  };
  // A newcomer takes a free place of the standard layout for the new number, else any free place, trying the right
  // side first, which sets where they come in among the others once everyone spreads out.
  const freePlace=count=>{
    const taken=new Set(members.map(m=>m.place));
    return [...(PLACES[count]??[])].reverse().concat([...ORDER].reverse()).find(p=>!taken.has(p))??'center';
  };
  /* On a full stage the quietest member leaves. Someone the director brings on displaces neither the speaker in focus
   * nor a member also brought on at this point, so more characters than places do not take turns pushing each other
   * off; a speaker displaces the quietest of anyone else. */
  const join=(id,at,{speaking,directedNow,speakerNow})=>{
    if(members.some(m=>m.id===id))return;
    if(members.length>=capacity) {
      const kept=m=>m.id===id||!speaking&&(directedNow.has(m.id)||m.id===focus||m.id===speakerNow);
      const quiet=members.filter(m=>!kept(m)).sort((a,b)=>a.active-b.active)[0];
      if(!quiet)return;
      leave(quiet.id);
    }
    members.push({id,active:at,turn:now,place:freePlace(members.length+1)});
  };
  const spread=()=>{
    const standard=PLACES[members.length]??[];
    members.sort((a,b)=>ORDER.indexOf(a.place)-ORDER.indexOf(b.place)).forEach((m,i)=>{m.place=standard[i];});
  };
  // A stage range sets the stage outright: the cast in its order, the speaker or the lone member in focus.
  const staged=(i,range)=>{
    const current=story.units[i],speakerNow=speaking(current)?current.speakerId:null;
    const active=new Map(members.map(m=>[m.id,m.active])),turns=new Map(members.map(m=>[m.id,m.turn]));
    let cast=range.cast.filter(id=>canStand(id)&&presenceAt(story,id,i)!==false);
    if(cast.length>capacity) {
      const rank=id=>id===speakerNow?Infinity:active.get(id)??-1;
      const kept=new Set([...cast].sort((a,b)=>rank(b)-rank(a)).slice(0,capacity));
      cast=cast.filter(id=>kept.has(id));
    }
    for(const id of cast)waiting.delete(id);
    members=cast.map((id,k)=>({id,active:id===speakerNow?i:active.get(id)??i,turn:id===speakerNow?now:turns.get(id)??now,place:PLACES[cast.length][k]}));
    if(speakerNow&&cast.includes(speakerNow)&&!recalled(current)){focus=speakerNow;offstage=false;return;}
    if(speaking(current)){offstage=true;return;}
    const named=(current.runs??[]).map(r=>r.characterId).filter(id=>cast.includes(id));
    if(new Set(named).size===1)[focus]=named;
    else if(!cast.includes(focus))focus=cast.length===1?cast[0]:null;
    offstage=false;
  };
  const step=(i,previous)=>{
    if(turnOf.has(i))now=turnOf.get(i);
    const found=stageRangeAt(story,i),able=id=>canStand(id)&&presenceAt(story,id,i)!==false;
    const range=found?.auto&&!found.cast.some(able)?null:found;
    if(range&&!range.join){unnamed=0;staged(i,range);return;}
    const joining=range?range.cast.filter(able):[];
    const current=story.units[i],directedNow=new Set([...directed.filter(id=>presenceAt(story,id,i)===true),...joining]);
    const speakerNow=speaking(current)?current.speakerId:null;
    for(const id of joining){waiting.delete(id);join(id,i,{speaking:false,directedNow,speakerNow});}
    for(const id of directed) {
      const presence=presenceAt(story,id,i),before=previous===undefined?null:presenceAt(story,id,previous);
      if(presence!==true)waiting.delete(id);
      if(presence===false||(before===true&&presence!==true))leave(id);
      else if(presence===true&&!waiting.has(id)&&(before!==true||members.length<capacity))join(id,i,{speaking:false,directedNow,speakerNow});
    }
    if(turnOf.has(i)) {
      unnamed=0;
      for(const m of [...members])if(m.id!==speakerNow&&!directedNow.has(m.id)&&!recent(m))leave(m.id);
    } else {
      const named=new Set((current.runs??[]).map(r=>r.characterId).filter(id=>members.some(m=>m.id===id)));
      const described=joining.filter(id=>members.some(m=>m.id===id));
      unnamed=named.size||described.length?0:unnamed+1;
      if(unnamed>quietNarration)for(const m of [...members])if(!directedNow.has(m.id))leave(m.id);
      if(described.length===1){[focus]=described;offstage=false;}
      else if(named.size===1){[focus]=named;offstage=false;}
    }
    const speaker=speakerNow;
    if(!speaker&&current.guestSpeaker&&speaking(current)){offstage=true;return;}
    if(!speaker||story.entities.get(speaker)?.kind!=='character')return;
    if(recalled(current)&&!members.some(m=>m.id===speaker)){offstage=true;return;}
    if(!canStand(speaker)||presenceAt(story,speaker,i)===false){focus=null;offstage=true;return;}
    waiting.delete(speaker);
    join(speaker,i,{speaking:true,directedNow,speakerNow});
    const member=members.find(m=>m.id===speaker);
    if(!member)return;
    member.active=i;member.turn=now;
    focus=speaker;offstage=false;
  };
  for(const [k,i] of positions.entries()) {
    if(i>index)break;
    const before=members.map(m=>m.id).join();
    step(i,positions[k-1]);
    if(members.map(m=>m.id).join()!==before)spread();
  }
  members.sort((a,b)=>ORDER.indexOf(a.place)-ORDER.indexOf(b.place));
  const places=Object.fromEntries(members.map(m=>[m.id,m.place]));
  return {members:members.map(m=>m.id),focus,offstage:offstage&&members.length>0,places};
}
