// Asset manifests (backgrounds v8, character images v5), Extra v2 and the .vn.zip manifest v13.
// In memory an image carries its bytes as a Blob; in a package it is a file named by its SHA-256.

export type ImageType='image/png'|'image/jpeg'|'image/webp';
export interface ImageMeta {name:string;type:ImageType;width:number;height:number;caption?:string}
export interface StoredImage extends ImageMeta {blob:Blob}
// An image with its bytes while it is made or packaged, or its address on the shelf while it is read.
export interface ImageRecord extends ImageMeta {blob?:Blob;src?:string}
// Images by SHA-256 (64 hex characters).
export type ImageMap=Record<string,ImageRecord>;

export type BackgroundScope='ambients'|'locations'|'cgs'|'cutIns'|'variants';
// Each scope maps its target ID (ambient, location, CG, Cut-in, location variant) to an image ID.
export interface BackgroundBindings extends Record<BackgroundScope,Record<string,string|null>> {
  book:string|null;titleCard:string|null;
}
export interface Backgrounds {version:8;bookId:string;bindings:BackgroundBindings;images:ImageMap}

// Source-image pixels of the square avatar.
export interface AvatarCrop {x:number;y:number;size:number}
// Which side of the stage a portrait is mirrored on; none never mirrors it.
export type Flip='none'|'left'|'right';
// One look's standing portrait; its avatar is cut from it (crop when saved, else the standard head-and-shoulders square).
export interface Portrait {imageId:string;flip?:Flip;crop?:AvatarCrop}
// The default look plus the variant looks by variant ID.
export interface CharacterSlots {standing?:Portrait;variants?:Record<string,Portrait>}
export interface CharacterImages {version:5;bookId:string;bindings:Record<string,CharacterSlots>;images:ImageMap}

export interface ExtraItem {title:string;paragraphs:string[]}
// after: the source ID the illustration follows.
export interface Illustration {imageId:string;after:string}
export interface Extra<I extends ImageMeta=ImageMeta> {
  version:2;items:ExtraItem[];images:Record<string,I>;illustrations:Illustration[];gallery:string[];cover:string|null;
}

// What validateExtra returns for an input: its image type when the input is typed, metadata only when it is unknown.
export type ValidatedExtra<V>=0 extends 1&V?Extra:V extends {images:Record<string,infer I extends ImageMeta>}?Extra<I>:Extra;

export interface PackagedImage extends ImageMeta {path:string}
export interface PackageManifest {
  format:'vn-package';version:13;bookId:string;script:'story.vn.txt';complete:boolean;extra:'extra.json'|null;
  backgrounds:{version:8;bindings:BackgroundBindings;images:Record<string,PackagedImage>};
  characterImages:{version:5;bindings:Record<string,CharacterSlots>;images:Record<string,PackagedImage>};
}
// What importStoryPackage returns and the reader keeps for one book.
export interface StoryBundle {
  raw:string;backgrounds:Backgrounds;characterImages:CharacterImages;extra:Extra<ImageRecord>;complete:boolean;
}
