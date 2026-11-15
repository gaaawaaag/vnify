// @ts-check
/** @import {Story} from '../types/story.js' */
import {unitLocation,reachedVariants} from '../core/variants.js';
import {ambientsOf} from '../core/ambients.js';
import {illustrationRanges} from '../core/extra.js';
import {t} from './player-text.js';

/**
 * @typedef {{category:string,id:string,label:string,src:string,width:number,height:number,reached:boolean}} GalleryEntry
 * @typedef {{id:string,label:string}} GalleryCategory
 */

// The gallery's categories in order; a book shows only those it has pictures for.
/** @type {GalleryCategory[]} */
export const GALLERY_CATEGORIES=[
  {id:'cover',label:'封面'},{id:'ambient',label:'氛围背景'},{id:'location',label:'地点'},{id:'variant',label:'地点差分'},
  {id:'cg',label:'CG'},{id:'cutin',label:'特写'},{id:'original',label:'原书图片'},
];

/* Every picture the book has bound, marked reached once the reading position `furthest` has shown it (or passed where
 * it starts). Covers and the original book's pictures outside the text count as reached; the player fogs the others.
 * No prompts or director notes are returned. */
/**
 * @param {{story:Story,backgrounds:any,extra?:any,furthest:number,complete?:boolean}} book
 * @returns {GalleryEntry[]}
 */
export function galleryEntries({story,backgrounds,extra=null,furthest,complete=true}) {
  /** @type {GalleryEntry[]} */
  const entries=[];
  const images=backgrounds?.images??{},bindings=backgrounds?.bindings??{};
  const seen=story.units.slice(0,furthest+1);
  /** @param {string} category @param {string} id @param {string} label @param {any} img @param {boolean} reached */
  const add=(category,id,label,img,reached)=>{
    if(img?.src)entries.push({category,id,label,src:img.src,width:img.width,height:img.height,reached});
  };
  if(bindings.titleCard)add('cover','title-card',t('封面'),images[bindings.titleCard],true);
  if(bindings.book)add('cover','book',t('作品背景'),images[bindings.book],true);

  const ambientsSeen=new Set(seen.flatMap(unit=>ambientsOf(story,unit)));
  for(const [id,image] of Object.entries(bindings.ambients??{}))
    add('ambient',id,story.ambientArt?.images.get(id)?.name??id,images[/** @type {string} */(image)],ambientsSeen.has(id));

  const placesSeen=new Set(seen.map(unitLocation));
  for(const [id,image] of Object.entries(bindings.locations??{}))
    add('location',id,story.entities.get(id)?.label??id,images[/** @type {string} */(image)],placesSeen.has(id));

  const variantsSeen=new Set(reachedVariants(story,furthest).map(v=>v.id));
  for(const [id,image] of Object.entries(bindings.variants??{})) {
    const variant=story.variantArt?.definitions.get(id);
    const label=variant?`${story.entities.get(variant.entityId)?.label??variant.entityId} · ${variant.name}`:id;
    add('variant',id,label,images[/** @type {string} */(image)],variantsSeen.has(id));
  }

  // CGs and close-ups have no names: they are numbered in reading order.
  const cgs=[...(story.cgs?.values()??[])].filter(cg=>bindings.cgs?.[cg.id]).sort((a,b)=>a.start-b.start);
  cgs.forEach((cg,i)=>add('cg',cg.id,`CG ${i+1}`,images[bindings.cgs[cg.id]],cg.start<=furthest));
  const firstUse=new Map();
  for(const use of story.cutInArt?.uses??[])if(!firstUse.has(use.cutInId)||use.start<firstUse.get(use.cutInId))firstUse.set(use.cutInId,use.start);
  const cutIns=[...firstUse].filter(([id])=>bindings.cutIns?.[id]).sort((a,b)=>a[1]-b[1]);
  cutIns.forEach(([id,start],i)=>add('cutin',id,t('特写 {n}',{n:i+1}),images[bindings.cutIns[id]],start<=furthest));

  if(extra) {
    for(const id of extra.gallery??[])
      add('original',`book:${id}`,extra.images[id]?.caption||t(id===extra.cover?'原书封面':'原书图片'),extra.images[id],true);
    const starts=new Map();
    for(const range of illustrationRanges(story,extra,complete))if(!starts.has(range.imageId))starts.set(range.imageId,range.start);
    [...starts].sort((a,b)=>a[1]-b[1]).forEach(([id,start],i)=>
      add('original',`book:${id}`,extra.images[id]?.caption||t('插图 {n}',{n:i+1}),extra.images[id],start<=furthest));
  }
  return entries;
}
