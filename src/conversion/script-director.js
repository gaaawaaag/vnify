import {renderPrompt} from '../prompts/library.js';
import {parseScript} from '../core/parser.js';
import {scriptLines} from '../core/script-text.js';
import {extractDossiers,validateDossiers,applyDossierEvent} from '../core/dossier.js';
import {readDirectors,embedDirectors} from '../core/director.js';
import {readBlurb,withBlurb} from '../core/blurb.js';
import {withMusic} from '../core/music.js';
import {withVoices} from '../core/voices.js';
import {withSounds} from '../core/sounds.js';
import {directorOptions,directorActive,directorPacket,validateDirector,validateDirectorSelection,directorTaskRules,directorContext} from './director.js';
import {bookImageCount} from '../core/director.js';
import {dossierStatePacket} from './conversion-project.js';
import {validateDesign,alignDirector} from './book-design.js';
import {withLookStages} from './looks.js';

// Director work on a finished .vn.txt: one record per chapter, written by the agent and checked here.
export class ScriptDirector {
  constructor(raw,director={}) {
    const story=parseScript(raw),documents=extractDossiers(raw).documents;
    this.raw=raw;this.story=story;this.details=validateDossiers(documents,story);
    this.director=directorOptions({enabled:true,...director});
    this.plan=story.chapters.map(chapter=>({chapter}));
    const lines=scriptLines(raw),originalLines=raw.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g);
    this.baseRaw=originalLines.filter((_,i)=>lines[i]?.literal||!/^\/\/ @vn-(director|title-card|end-card) /.test(lines[i]?.text.trim()??'')).join('');
    // Reading the directors also fills story.titleCard.
    const existing=readDirectors(raw,story);
    this.importedTitleCard=story.titleCard;this.importedEndCard=story.endCard;
    this.imported=new Map(existing.map(d=>[d.chapterId,JSON.stringify(d)]));
    this.selectedArtStyle=existing[0]?.artStyles??null;
    this.designDoc=null;this.visualProfiles=[];
    this.records=this.plan.map(p=>({director:this.imported.get(p.chapter.id)||'',directorSaved:false,directorError:''}));
    this.validate();
  }
  // The book's styles once fixed: both given by the user, or chosen by the design or the first chapter.
  get artStyle() {
    const style=directorContext(this.director).artStyles??this.selectedArtStyle;
    return style?structuredClone(style):null;
  }
  validate() {
    const docs=[];let style=this.selectedArtStyle;
    this.readyChapters=0;
    for(const [i,r] of this.records.entries()) {
      r.directorSaved=false;r.directorError='';
      try {
        if(!r.director)throw new Error('尚无 Director 返回。');
        const chapter=this.plan[i].chapter.id;
        const retained=r.director===this.imported.get(chapter)&&!r.directorOptions;
        const options=r.directorOptions??this.director;
        // With a book design, chapters written in parallel are aligned: first design wins.
        let parsed=null;if(this.designDoc&&!retained)try{parsed=JSON.parse(r.director);}catch{}
        const value=parsed&&typeof parsed==='object'?alignDirector(parsed,docs,this.designDoc,this.story,chapter):r.director;
        const context={...directorContext(options,this.artStyle??style),variantLimits:this.variantLimits(),reservedImages:this.reservedImages};
        const doc=validateDirector(value,this.story,chapter,docs,retained?null:context);
        if(!retained)validateDirectorSelection(doc,options,this.artStyle??style);
        style=doc.artStyles;this.selectedArtStyle??=doc.artStyles;r.director=JSON.stringify(doc);
        r.directorSaved=true;
        // Where the narration describes someone in the scene, the portrait comes on: ranges renewed on every load.
        docs.push(doc.generation.standing&&this.visualProfiles.length?withLookStages(doc,this.story,this.visualProfiles):doc);
      } catch(error) {r.directorError=error.message;}
      if(r.directorSaved||!directorActive(this.director))this.readyChapters++;
    }
    this.complete=this.readyChapters===this.plan.length;
    const embedded=embedDirectors(this.baseRaw,docs,this.designDoc?.titleCard??this.importedTitleCard,this.designDoc?.endCard??this.importedEndCard);
    // The original book's blurb, already in the text, comes first; the design's fills in only when there is none.
    const blurbed=this.designDoc?.blurb&&!readBlurb(this.baseRaw)?withBlurb(embedded,this.designDoc.blurb):embedded;
    // Music set by the project (undefined: keep the input's record) replaces the input's record.
    const scored=this.music!==undefined?withMusic(blurbed,this.music):blurbed;
    // Voices set by the project (undefined: keep the input's record) replace the input's record.
    const voiced=this.voices!==undefined?withVoices(scored,this.voices):scored;
    // Ambience and effects set by the project (undefined: keep the input's record) replace the input's record.
    this.readableOutput=this.sounds!==undefined?withSounds(voiced,this.sounds):voiced;
    readDirectors(this.readableOutput,this.story);
    this.output=this.complete?this.readableOutput:'';
  }
  // Main characters (marked in the book design) get more variants; chapter-local ones carry the chapter prefix.
  variantLimits() {
    return {main:new Set((this.designDoc?.characters??[]).filter(c=>c.main).map(c=>c.characterId)),
      designIds:new Set((this.designDoc?.variants??[]).map(v=>v.id))};
  }
  // The cover is drawn outside the chapter records but counts against the book's image limit.
  get reservedImages() {
    return (this.designDoc?.titleCard??this.importedTitleCard?1:0)+(this.designDoc?.endCard??this.importedEndCard?1:0);
  }
  packet(i) {
    const chapterId=this.plan[i].chapter.id;
    const end=this.story.units.findLastIndex(u=>u.chapter.id===chapterId);
    const events=this.details.events.filter(e=>e.index<=end),characters=new Map();
    for(const e of events)characters.set(e.characterId,applyDossierEvent(characters.get(e.characterId),e));
    const previous=this.records.slice(0,i).filter(r=>r.directorSaved).map(r=>r.director);
    let text=directorTaskRules(this.director,this.story.book.lang)+renderPrompt('director.converted-input');
    const saved=this.records.filter((record,j)=>j!==i&&record.directorSaved).map(record=>JSON.parse(record.director));
    text+=directorPacket(this.story,chapterId,dossierStatePacket({events,characters}),previous,this.director,this.artStyle,this.visualProfiles,this.designDoc,
      bookImageCount(saved,this.reservedImages));
    const r=this.records[i];
    if(r.director)text+=renderPrompt('director.repair', {draft: r.director, errors: r.directorError});
    return text;
  }
  // Whole-book design: fixes styles, main looks and location masters so chapters may run in parallel.
  setDesign(raw) {
    const fixed=this.artStyle;
    this.designDoc=validateDesign(raw,[...this.story.entities.values()],this.director,fixed);
    this.selectedArtStyle??=this.designDoc.artStyles;
    this.validate();
  }
}
