import {parseScript} from '../core/parser.js';
import {readDirectors} from '../core/director.js';
import {compileCharacters, castAt} from './character-data.js';
import {readerIntro} from './reader-presentation.js';

// Validate the whole work before changing the active reading session.
export function prepareReading(raw, {strictSources=false, complete=true} = {}) {
  const story=parseScript(raw,{strictSources});
  readDirectors(raw,story);
  const characters=compileCharacters(raw,story,{complete});
  return {raw,story,characters,complete};
}

const position=(value,max)=>Math.max(0,Math.min(max,Math.floor(Number(value)||0)));

/** Splitting by source paragraph: consecutive lines of one paragraph share a screen while the speaker, the kind of
 * text and the effect stay the same; documents keep their own screens. Returns each unit's first unit on screen.
 * @param {import('../types/story.js').Unit[]} units
 * @returns {number[]} */
export function paragraphStarts(units) {
  const starts=[];
  units.forEach((unit,i)=>{
    const previous=units[i-1];
    const joins=Boolean(previous)&&unit.block.kind!=='document'&&previous.block.id===unit.block.id
      &&previous.kind===unit.kind&&previous.speakerId===unit.speakerId&&previous.speaker===unit.speaker
      &&previous.effect===unit.effect&&unit.source.some(id=>previous.source.includes(id));
    starts.push(joins?starts[i-1]:i);
  });
  return starts;
}

// No DOM, storage, network or timers. A view may pause typing without changing disclosure.
export class ReaderState {
  constructor() {
    this.story=null;this.raw='';this.index=0;this.furthest=0;
    this.bookComplete=true;this.auto=false;
    this.glyphs=[];this.visible=0;this.intro=null;
    this.characters=null;this.castCache=null;
    this.documentScroll=new Map();
    this.split='script';this.paragraphs=null;
  }
  // 'script' gives each unit its own screen (short lines joined by the parser stay together; authored // @vn-page
  // groups are ignored); 'paragraph' groups each source paragraph.
  setSplit(mode) { this.split=mode==='paragraph'?'paragraph':'script'; }
  screenStart(index) {
    const unit=this.story.units[index];
    if(this.split!=='paragraph')return unit.joinStart??index;
    this.paragraphs??=paragraphStarts(this.story.units);
    return this.paragraphs[index];
  }
  load(work, restored=null) {
    this.story=work.story;this.raw=work.raw;this.characters=work.characters;
    this.bookComplete=work.complete;
    this.index=position(restored?.index,this.story.units.length-1);
    this.furthest=Math.max(this.index,position(restored?.furthest,this.story.units.length-1));
    this.auto=false;this.glyphs=[];this.visible=0;this.intro=null;this.castCache=null;this.paragraphs=null;
    const documentIds=new Set(this.story.units.filter(u=>u.block.kind==='document').map(u=>u.id));
    this.documentScroll=new Map(Object.entries(restored?.documentScroll&&typeof restored.documentScroll==='object'?restored.documentScroll:{}).filter(([id,top])=>documentIds.has(id)&&Number.isFinite(top)&&top>=0));
  }
  // Earlier units of the same screen (an authored page, joined short lines, or a source paragraph) stay on screen.
  beginUnit(mode='forward',previousIndex=null) {
    const unit=this.story.units[this.index];
    this.intro=readerIntro(this.story,this.index,mode,previousIndex);
    const first=this.screenStart(this.index);
    const runs=this.runsAt(this.index,first);
    this.glyphs=Array.from(runs.map(run=>run.text).join(''));this.visible=this.isDocument?this.glyphs.length:0;
    this.furthest=Math.max(this.furthest,this.index);
    const retainedUnits=this.retainedFrom(first);
    return {unit,runs,retainedRuns:retainedUnits.flatMap(entry=>entry.runs),retainedUnits};
  }
  // Display runs of one unit; thoughts gain brackets that also take part in typing. Thoughts of one person that follow
  // each other on a screen share one pair: the opening bracket on the first, the closing one on the last shown.
  runsAt(index,first=index) {
    const units=this.story.units,unit=units[index];
    const runs=this.characters?.glossary.runs.get(index)??unit.runs;
    if(unit.kind!=='thought')return runs;
    const joins=(/** @type {any} */ other)=>other?.kind==='thought'&&other.speakerId===unit.speakerId;
    // Thoughts sit in brackets of the work's language.
    const [open,close]=this.story.book.lang==='en'?['(',')']:['（','）'];
    return [...index>first&&joins(units[index-1])?[]:[{text:open}],...runs,...index<this.index&&joins(units[index+1])?[]:[{text:close}]];
  }
  // Earlier units kept on screen with the current one, from `first` up to the current unit.
  retainedFrom(first) {
    return this.story.units.slice(first,this.index).map((unit,k)=>({index:first+k,unit,runs:this.runsAt(first+k,first)}));
  }
  endIntro() { this.intro=null; }
  get isDocument() { return this.story?.units[this.index]?.block.kind==='document'; }
  get autoWaiting() { return Boolean(this.isDocument); }
  rememberDocumentScroll(top) {
    if(this.isDocument&&Number.isFinite(top)&&top>=0)this.documentScroll.set(this.story.units[this.index].id,top);
  }
  get documentScrollTop() { return this.isDocument?(this.documentScroll.get(this.story.units[this.index].id)??0):0; }
  typeStep() { this.visible=Math.min(this.glyphs.length,this.visible+1); }
  completeText() { this.endIntro();this.visible=this.glyphs.length; }
  get textComplete() { return !this.intro && this.visible>=this.glyphs.length; }
  advance(delta) {
    if(!this.story)return {kind:'idle'};
    if(delta>0 && this.intro)return {kind:'intro'};
    if(delta>0 && !this.textComplete)return {kind:'complete'};
    const next=position(this.index+delta,this.story.units.length-1);
    if(next===this.index)return {kind:'end'};
    return this.seek(next,delta<0?'back':'forward');
  }
  seek(index,mode='jump') {
    const previousIndex=this.index;
    this.index=position(index,this.story.units.length-1);
    return {kind:'move',mode,previousIndex};
  }
  currentCast() {
    if(!this.story || !this.characters)return [];
    // A chapter/separator interlude has not displayed the document yet.
    if(this.isDocument&&this.intro)return this.index?castAt(this.story,this.characters,this.index-1,true):[];
    // A chapter/separator interlude has not displayed the document yet.
    if(this.isDocument&&this.intro)return this.index?castAt(this.story,this.characters,this.index-1,true):[];
    const complete=this.textComplete;
    if(!this.castCache || this.castCache.index!==this.index || this.castCache.complete!==complete)
      this.castCache={index:this.index,complete,people:castAt(this.story,this.characters,this.index,complete)};
    return this.castCache.people;
  }
  snapshot() {
    if(!this.story)return null;
    return {raw:this.raw,index:this.index,furthest:this.furthest,title:this.story.book.title,
      count:this.story.units.length,complete:this.bookComplete,
      documentScroll:Object.fromEntries(this.documentScroll)};
  }
}
