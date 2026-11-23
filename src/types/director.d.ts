// Director v13 records (`// @vn-director {json}` in the text) and the indexes compiled from them (src/core/director.js).

// Image uses a record may make; set per project and fixed on every chapter record (src/core/director-generation.js).
// Characters have one transparent standing portrait per look; their avatar is cut from it.
export interface Generation {
  backgrounds:boolean;ambients:boolean;locationBackgrounds:boolean;cgs:boolean;cutIns:boolean;
  standing:boolean;characterVariants:boolean;locationVariants:boolean;
}
// Background style serves places and Cut-ins; character style serves people and CG.
export interface ArtStyles {background:string;character:string}
export interface TitleCard {prompt:string}

// One location master design shared by the listed locations, shown in the listed blocks.
export interface DirectorBackground {locations:string[];blocks:string[];prompt:string}
// face: head and face; body: build, clothing and stance below the head.
export interface DirectorCharacter {
  characterId:string;face:string;body:string;stature?:number;
}
// A reusable atmosphere background: defined once in the book (in the chapter that first shows it), shown where no
// location image applies. Each chapter names its default one; ambientBlocks give single blocks another.
export interface Ambient {id:string;name:string;prompt:string}
export interface AmbientBlocks {ambient:string;blocks:string[]}
// from／to: inclusive body unit IDs of the record's chapter.
export interface CastMember {id:string;look:string}
export interface Cg {id:string;from:string;to:string;evidence?:string[];reason:string;cast?:CastMember[];prompt:string}
export interface CutIn {id:string;reason:string;prompt:string}
export interface CutInUse {cutInId:string;from:string;to:string}
// A character variant overrides face and/or body; a location variant gives a full prompt.
export interface VariantDefinition {
  id:string;entityId:string;name:string;reason:string;
  prompt?:string;face?:string;body?:string;stature?:number;
}
// Without `to` a state lasts until the entity's next such state, across chapters.
export interface StateRecord {entityId:string;from:string;to?:string;variant?:string|null;present?:boolean}
// Who stands on stage from `from` to `to` (one scene block), left to right; StageRange holds the unit indexes.
// join: the cast comes on beside whoever is standing instead of replacing them. auto: added by the program where the
// narration describes a character's looks (src/conversion/looks.js), renewed whenever the project is loaded.
export interface StageRecord {from:string;to:string;cast:string[];join?:boolean;auto?:boolean}
export interface StageRange {start:number;end:number;cast:string[];join?:boolean;auto?:boolean}

// One chapter's record as validateDirector returns it.
export interface DirectorRecord {
  version:13;chapterId:string;generation:Generation;artStyles:ArtStyles;
  backgrounds:DirectorBackground[];omittedBlocks:string[];cgs:Cg[];
  ambients:Ambient[];ambient?:string;ambientBlocks:AmbientBlocks[];
  cutIns:CutIn[];cutInUses:CutInUse[];characters:DirectorCharacter[];variants:VariantDefinition[];states:StateRecord[];
  stages?:StageRecord[];
}

// start／end: unit indexes of the range in the parsed story.
export interface CgRecord extends Cg {chapterId:string;start:number;end:number}
// Ambient definitions with the chapter that defines them, and which one each chapter and overriding block shows.
export interface AmbientArt {
  images:Map<string,Ambient&{chapterId:string}>;chapters:Map<string,string>;blocks:Map<string,string>;
}
export interface CutInArt {
  images:Map<string,CutIn&{chapterId:string}>;
  uses:(CutInUse&{chapterId:string;start:number;end:number})[];
}
export interface Timeline<T> {lasting:{start:number;value:T}[];ranged:{start:number;end:number;value:T}[]}
export interface VariantArt {
  definitions:Map<string,VariantDefinition&{chapterId:string}>;
  timelines:Map<string,Timeline<string|null>>;presence:Map<string,Timeline<boolean>>;
  firstUse:Map<string,number>;statures:Map<string,number>;
}
// Registration limits for variants (src/core/variants.js); absent when reading a finished work.
export interface VariantLimits {main:Set<string>;designIds:Set<string>}

// The book's music record (`// @vn-music`, src/core/music.js): tracks and the cues that start them (null: silence).
export interface MusicTrack {id:string;name:string;prompt?:string}
export interface MusicCue {from:string;track:string|null}
export interface MusicRecord {tracks:MusicTrack[];cues:MusicCue[]}
// Cues by unit index, for finding what plays at a position.
export interface MusicCues {tracks:Map<string,MusicTrack>;cues:{index:number;track:string|null}[]}

// The book's voices (`// @vn-voices`, src/core/voices.js): voices named `<service>:<id>`, who reads with which, and the
// voice portraits written for designing them.
export interface VoiceRecord {
  labels:Record<string,string>;
  cast:{narrator?:string;other?:string;characters:Record<string,string>};
  portraits:Record<string,string>;
}

// The book's ambience and sound effects (`// @vn-sounds`, src/core/sounds.js).
export interface SoundDefinition {id:string;name:string;kind:'ambience'|'effect';query?:string;prompt?:string}
export interface SoundEffect {at:string;sound:string;phase:'enter'|'shown';volume?:number}
export interface SoundRecord {sounds:SoundDefinition[];places:Record<string,string>;blocks:Record<string,string|null>;effects:SoundEffect[]}
// Effects by unit index.
export interface SoundIndex {effects:Map<number,SoundEffect[]>}
