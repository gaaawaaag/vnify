// The vn-director production project and the image jobs planned from it (src/production, scripts/direct-vn.mjs).
import type {AvatarCrop,BackgroundScope,Flip} from './assets.js';
import type {CastMember} from './director.js';

export type TransparencyMethod='native'|'cutout';
// Director settings that take a density: the kinds whose number the director decides.
export type DensityKey='ambients'|'locations'|'cgs'|'cutIns'|'characterVariants'|'locationVariants';
export type ImagePurpose='background'|'cg'|'cut-in'|'title-card'|'standing';

// Project settings (project.json `options`); directorGeneration turns the switches into a Generation.
export interface DirectorSettings {
  protocolVersion?:number;enabled?:boolean;backgrounds?:boolean;titleCard?:boolean;
  ambients?:boolean;locationBackgrounds?:boolean;cgs?:boolean;cutIns?:boolean;standing?:boolean;
  characterVariants?:boolean;locationVariants?:boolean;
  // The user's own requirement for how object descriptions are written; empty for English natural language.
  subjectFormat?:string;
  // Shape of backgrounds, ambients and CG (landscape 16:9／3:2／4:3, portrait 9:16／2:3／3:4).
  ratio?:string;
  // How many images of each kind the director makes; imageLimit caps the book's images of all kinds together.
  density?:Partial<Record<DensityKey,Density>>;imageLimit?:number|null;
  // Per side: model decides, expand writes out the direction in the text field, fixed uses the text as is.
  // styleMode is shorthand (user = both fixed, model = both model) and reads mixed when the sides differ.
  styleMode?:'model'|'user'|'mixed';styleModes?:{background:StyleMode;character:StyleMode};backgroundStyle?:string;characterStyle?:string;
}
// What the source text says about an entity's appearance (visual-profiles.json): quotes located by source ID, plus an
// optional note for looks that do not come from the text (the user's wishes, a reference image's description).
export interface LookQuote {source:string;text:string;when?:string}
export interface LookProfile {id:string;look?:LookQuote[];note?:string}
// A quote placed in the story: the text of the lines it was found in, their unit indexes, and how much of it matched.
export interface ResolvedLook {text:string;when?:string;units:number[];weight:number}
export interface ResolvedLookProfile {id:string;look:ResolvedLook[];note?:string}
// A quote left out because the story has nothing like it under that source.
export interface LookNotice {id:string;source:string;text:string;reason:string}
// A user-supplied reference image: a character or place (by entity ID, optionally one variant), a Cut-in prop,
// or a highlighted passage of the original whose source range a CG has to cover. Handoff refs not yet matched lack IDs.
export type ReferenceKind='character'|'location'|'prop'|'highlight';
// Fields a member of a union never has, so code can read them on the whole union.
type Absent<K extends PropertyKey>={[P in K]?:never};
interface ReferenceBase {file:string;refId?:string;name?:string}
export interface EntityReference extends ReferenceBase,Absent<'from'|'to'> {
  kind?:Exclude<ReferenceKind,'highlight'>;entityId?:string;variantId?:string;cutInId?:string;stage?:string;
}
export interface HighlightReference extends ReferenceBase,Absent<'entityId'|'variantId'|'cutInId'|'stage'> {
  kind:'highlight';from:string;to:string;
}
export type Reference=EntityReference|HighlightReference;
// How an image was made; recorded in the project file only.
interface ImageRecord {mode?:'generate'|'edit'|'reference';sentPrompt?:string}
// A new image file to bind; an existing binding stays unless replace is set. Paths are relative to the project file.
interface AddedImage extends ImageRecord {file:string;width:number;height:number;replace?:boolean;remove?:false}
// Background-like purposes bind to at least one target of their own scopes.
type RefScopes={background:'ambients'|'locations'|'variants';cg:'cgs';'cut-in':'cutIns'};
type RefTarget={[P in keyof RefScopes]:{purpose:P;refs:TaskRef<RefScopes[P]>[]}}[keyof RefScopes];
type CharacterTarget={purpose:'standing';characterId:string;variantId?:string;flip?:Flip;crop?:AvatarCrop};
// One entry of project.json `images`: a new image for a target, or the removal of a background or cover binding.
export type ProjectImage=(AddedImage&(CharacterTarget|RefTarget|{purpose:'title-card'}))
  |(ImageRecord&{remove:true}&(RefTarget|{purpose:'title-card'}));
export interface DirectorProject {
  format:'vn-agent-director-1';input:string;options?:DirectorSettings;design?:string;chapters?:string[];
  visualProfiles?:string|LookProfile[];directors?:Record<string,string>;images?:ProjectImage[];
  // Task ID → reason the job waits.
  holds?:Record<string,string>;references?:string|Reference[];transparencyMethod?:TransparencyMethod;complete?:boolean;
  // Title and author set in the asset manager, replacing the input's @book line when the project loads.
  book?:{title:string;author:string|null};
}

// A background job binds one image to every target sharing its prompt.
export interface TaskRef<S extends BackgroundScope=BackgroundScope> {scope:S;id:string}
// aspectRatio: the image's shape (width:height) for the generator.
// promptEdited: prompt or editPrompt was rewritten by hand in the asset manager.
interface TaskBase {chapterId:string;chapterTitle:string;prompt:string;aspectRatio?:string;references?:Reference[];referencePrompt?:string;promptEdited?:boolean}
// Variant jobs: edit the bound default image (referenceImageId), or wait for it (blockedReason).
interface VariantJob {variantId?:string;editPrompt?:string;referenceImageId?:string;blockedReason?:string}
type CharacterFields='characterId'|'transparentBackground'|'removeBackground';
type SceneFields='cgId'|'cutInId'|'from'|'to'|'cast';
export interface BackgroundTask extends TaskBase,VariantJob,Absent<CharacterFields|SceneFields> {purpose:'background';refs:TaskRef[]}
// The CG range and its main characters (the director's cast), named @1–@3 in the prompt.
export interface CgTask extends TaskBase,Absent<CharacterFields|'cutInId'|keyof VariantJob> {
  purpose:'cg';cgId:string;refs:TaskRef[];from:string;to:string;cast:CastMember[];
}
export interface CutInTask extends TaskBase,Absent<CharacterFields|Exclude<SceneFields,'cutInId'>|keyof VariantJob> {
  purpose:'cut-in';cutInId:string;refs:TaskRef[];
}
export interface TitleCardTask extends TaskBase,Absent<'refs'|CharacterFields|SceneFields|keyof VariantJob> {purpose:'title-card'}
export interface CharacterTask extends TaskBase,VariantJob,Absent<'refs'|SceneFields> {
  purpose:'standing';characterId:string;transparentBackground:boolean;removeBackground?:boolean;aspectRatio:'2:3';
}
export type ImageTask=BackgroundTask|CgTask|CutInTask|TitleCardTask|CharacterTask;
// What binding a finished image needs to know about its job.
export type BindTarget={purpose:'standing';characterId:string;variantId?:string|null;refs?:never}
  |{purpose:'background'|'cg'|'cut-in';refs:TaskRef[];characterId?:never;variantId?:string|null}
  |{purpose:'title-card';refs?:never;characterId?:never;variantId?:never};
export type QueuedTask=ImageTask&{taskIds:string[]};
export type HeldTask=QueuedTask&{reason:string};

// Production presets (presets.json at the production environment's root), edited in the manager and read by the agent.
export type Delivery='text'|'prompts'|'images';
export type Density='few'|'medium'|'rich';
export type ImageKind='cover'|'ambient'|'location'|'cg'|'closeup'|'standing'|'characterVariants'|'locationVariants';
// model: the director decides; expand: the user's direction, written out by the model; fixed: used as written.
// How one art style side is set: the director decides, writes out a direction, or the user's text is used as is.
export type StyleMode='model'|'expand'|'fixed';
export interface ArtStyleChoice {mode:StyleMode;text:string}
export interface KindChoice {on:boolean;density:Density;notes:string}
export interface Preset {
  delivery:Delivery;style:'style'|'style-no-tags'|'style-original';dossier:'off'|'simple'|'detailed';terms:boolean;textNotes:string;
  orientation:'landscape'|'portrait';ratio:string;styles:{background:ArtStyleChoice;character:ArtStyleChoice};
  // drawing: the agent's host tool (notes: how to write for it), or image service presets mounted per use (docs/prompt-formats.md).
  drawing:{mode:'agent'|'presets';notes:string;uses:Partial<Record<'background'|'cg'|'cutin'|'cover'|'standing'|'variant',string>>};
  transparency:'native'|'cutout';limit:number|null;kinds:Record<ImageKind,KindChoice>;
}
export interface PresetFile {version:1;default:string;presets:Record<string,Preset>}
