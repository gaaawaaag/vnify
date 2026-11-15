// The parsed .vn.txt (src/core/parser.js), plus the indexes readDirectors attaches after every Director record passes.
import type {AmbientArt,CgRecord,CutInArt,StageRange,TitleCard,VariantArt} from './director.js';

export type EntityKind='character'|'location';
export type BlockKind='scene'|'narration'|'document';
export type Effect='none'|'memory'|'dream';
export type DocumentStyle='message'|'verse';
export type UnitKind='narration'|'dialogue'|'thought';

// lang: the language the work is written in (`zh` simplified, `zh-Hant` traditional Chinese); `zh` when @book omits it.
export interface Book {id:string;title:string;author:string|null;lang:'zh'|'zh-Hant'|'en'|'ja'}
// A `@profile` record: what the text states, an image prompt hint, or an inference.
export interface Profile {facts?:string;prompt?:string;inferred?:string}
export interface Entity {id:string;kind:EntityKind;label:string;color:string|null;profiles:Map<string,Profile>}
// index: position of the chapter's first unit.
export interface Chapter {id:string;title:string;index:number}
export interface Block {
  id:string;kind:BlockKind;chapterId:string;title:string;loc:string|null;locInherited?:true;
  time:string;pov:string;effect:Effect;style?:DocumentStyle;index:number;closed?:boolean;
}
export interface Annotation {id:string;text:string;source:string[]}
// One display run of a unit: plain text, a character mention or an annotated word.
export interface Run {text:string;characterId:string|null;annotation?:Annotation}
// Disclosure state of one entity at a unit: the public label and the profile in force.
export interface Reveal {label:string;profile:string|null}
// The place a document unit shows behind it: the scene before the document.
export interface BackgroundContext {chapterId:string;blockId:string;loc:string|null}
export interface Unit {
  // Block ID plus the unit's number in the block, e.g. b0001_s:1; stable only within one version of the text.
  id:string;line:number;text:string;runs:Run[];kind:UnitKind;speakerId:string|null;guestSpeaker?:string;
  backgroundContext?:BackgroundContext;places?:string[];pageStart:number|null;joinStart?:number;
  speaker:string;chapter:Chapter;block:Block;source:string[];location:string;effect:Effect;
  revealed:Map<string,Reveal>;
}
export interface Transition {source:string[];line:number;beforeBlock:string|null;chapterId:string|null}
export interface ParseWarning {line:number;message:string}
export interface ParsedStory {
  annotations:Map<string,Annotation>;version:string|false;book:Book;chapters:Chapter[];blocks:Block[];units:Unit[];
  warnings:ParseWarning[];entities:Map<string,Entity>;transitions:Transition[];
}
export interface Story extends ParsedStory {
  titleCard?:TitleCard|null;cgs?:Map<string,CgRecord>;ambientArt?:AmbientArt;cutInArt?:CutInArt;variantArt?:VariantArt;stageRanges?:StageRange[];
}
