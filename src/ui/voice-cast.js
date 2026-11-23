/* Voice choices in the reader (docs/dev/audio.md). The book may bring its own cast (its voice record); the reader's
 * choices, saved per book in this browser, go over it. The settings hold the narrator and other characters; each
 * character's voice is chosen on its page in the cast panel. The choices are Fish Audio voices (`fish:<id>`, the book's
 * and the reader's own) and this device's browser voices for the work's language. Choosing a voice reads that role's
 * latest line with it. */

// The role's choice in the reader's cast, and in the book's.
function chosen(cast,role) { return (role==='narrator'||role==='other'?cast?.[role]:cast?.characters?.[role])||''; }
function choose(cast,role,value) {
  if(role==='narrator'||role==='other')cast[role]=value||undefined;
  else if(value)cast.characters[role]=value;
  else delete cast.characters[role];
}
// The role's latest line up to `furthest`, to preview a voice with.
export function latestLine(story,furthest,role) {
  for(let i=Math.min(furthest,story.units.length-1);i>=0;i--) {
    const unit=story.units[i];
    if(unit.block.kind==='document')continue;
    if(role==='narrator'?unit.kind==='narration':role==='other'?unit.kind!=='narration'&&!unit.speakerId:unit.speakerId===role)return unit;
  }
  return null;
}

/* A select for one role: the default (the book's voice when it has one), then the voices by group. A choice that is not
 * listed here (from another device) stays, so it is not lost by looking. */
export function voiceSelect({story,role,groups,store,t,onChange}) {
  const cast=store.readVoices(story.book.id),book=story.voices,own=chosen(cast,role),bookVoice=chosen(book?.cast,role);
  const listed=groups(story.book.lang).filter(group=>group.voices.length);
  const option=(value,text)=>Object.assign(document.createElement('option'),{value,textContent:text});
  const select=document.createElement('select');
  select.append(option('',bookVoice?t('作品分派：{name}',{name:book.labels[bookVoice]??bookVoice}):t('默认')),...listed.map(group=>{
    const set=document.createElement('optgroup');set.label=group.label;
    set.append(...group.voices.map(voice=>option(voice.value,voice.label)));
    return set;
  }));
  if(own&&!listed.some(group=>group.voices.some(voice=>voice.value===own)))select.append(option(own,own));
  select.value=own;
  select.onchange=()=>{
    const latest=store.readVoices(story.book.id);choose(latest,role,select.value);
    try{store.saveVoices(story.book.id,latest);}catch{}
    onChange(role);
  };
  return select;
}

export function createVoiceCast({root,groups,store,t,onPreview}) {
  let current=null;
  function render() {
    if(!current)return;
    const {story,furthest}=current;
    root.hidden=!groups(story.book.lang).some(group=>group.voices.length);
    if(root.hidden){root.replaceChildren();return;}
    root.replaceChildren(...[['narrator',t('旁白')],['other',t('其他人物')]].map(([role,name])=>{
      const label=document.createElement('label');label.className='setting-row is-wide';
      const title=document.createElement('span');title.textContent=name;
      label.append(title,voiceSelect({story,role,groups,store,t,onChange:()=>{const line=latestLine(story,furthest,role);if(line)onPreview(line);}}));
      return label;
    }));
  }
  return {
    // Shows the choices for the open book (or nothing without one).
    show(value) {current=value?.story?value:null;if(!current){root.hidden=true;root.replaceChildren();}else render();},
    refresh:render,
  };
}
