// @ts-check
/** @import {AvatarCrop} from '../types/assets.js' */
import {validateAvatarCrop} from '../reader/character-images.js';
import {CROP} from '../reader/figure-layout.js';

/* The avatar square of a standing portrait: from a little blank above the hair top to the middle of the collarbone, so
 * every head is framed alike (the player sizes figures by it). The hair top and the head's middle are measured from a
 * transparent portrait; the collarbone is told by whoever looked at the picture, or estimated from the outline (the
 * neck, then where the shoulders widen) as a first guess to be checked. Moving and zooming serve the manager's crop tool. */

/** @typedef {{width:number,height:number,data:Uint8Array}} Rgba */

const clamp=(/** @type {number} */ value,/** @type {number} */ min,/** @type {number} */ max)=>Math.max(min,Math.min(max,value));
/** @param {AvatarCrop} crop @param {{width:number,height:number}} image @param {number} dx @param {number} dy */
export function moveAvatarCrop(crop,image,dx,dy) {
  validateAvatarCrop(crop,image);
  if(!Number.isFinite(dx) || !Number.isFinite(dy))throw new Error('裁切位移无效。');
  return {x:clamp(crop.x+dx,0,image.width-crop.size),y:clamp(crop.y+dy,0,image.height-crop.size),size:crop.size};
}
/** @param {AvatarCrop} crop @param {{width:number,height:number}} image @param {number} zoom */
export function zoomAvatarCrop(crop,image,zoom) {
  validateAvatarCrop(crop,image);
  if(!Number.isFinite(zoom) || zoom<1)throw new Error('裁切缩放无效。');
  const size=Math.min(image.width,image.height)/zoom;
  return {x:clamp(crop.x+(crop.size-size)/2,0,image.width-size),y:clamp(crop.y+(crop.size-size)/2,0,image.height-size),size};
}

const OPAQUE=128;
// A row counts as part of the figure from MIN_RUN opaque pixels, so a stray speck above the hair is passed over.
const MIN_RUN=3;

/** Opaque extent of each row: [first, last] column, or null. @param {Rgba} image */
function rowExtents(image) {
  const {width,height,data}=image,rows=[];
  for(let y=0;y<height;y++) {
    let first=-1,last=-1,count=0;
    for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>=OPAQUE){if(first<0)first=x;last=x;count++;}
    rows.push(count>=MIN_RUN?/** @type {[number,number]} */([first,last]):null);
  }
  return rows;
}

/** Whether the portrait has real transparency to measure. @param {Rgba} image */
export function hasAlphaOutline(image) {
  const {data}=image;
  let clear=0;
  for(let i=3;i<data.length;i+=4*7)if(data[i]<OPAQUE)clear++;
  return clear>data.length/(4*7)*.05;
}

/**
 * Measures a transparent portrait: the hair top, the head's middle column and a collarbone guess (pixels).
 * @param {Rgba} image
 * @returns {{top:number,center:number,clavicle:number|null}}
 */
export function measurePortrait(image) {
  if(!hasAlphaOutline(image))throw new Error('这张立绘没有透明背景，量不出发顶；请用 --top 与 --clavicle 给出位置。');
  const rows=rowExtents(image),{height}=image;
  const top=rows.findIndex(r=>r!==null);
  if(top<0)throw new Error('立绘是全透明的。');
  // The head's middle: the average middle of the rows in the top tenth of the picture below the hair top.
  const head=rows.slice(top,top+Math.max(1,Math.round(height*.1))).filter(r=>r!==null);
  const center=head.reduce((n,r)=>n+(/** @type {[number,number]} */(r)[0]+/** @type {[number,number]} */(r)[1])/2,0)/head.length;
  return {top,center,clavicle:estimateClavicle(rows,top,height)};
}

/* The narrowest row below the head is taken as the neck; the middle of the collarbone is where the outline has begun to
 * widen below it (a fifth wider than the neck), before the shoulders spread. Tuned on real cowboy-shot portraits; long
 * hair, high collars or raised arms hide the neck, so this is only a first guess. */
/** @param {([number,number]|null)[]} rows @param {number} top @param {number} height */
function estimateClavicle(rows,top,height) {
  const width=(/** @type {number} */ y)=>{const r=rows[y];return r?r[1]-r[0]+1:0;};
  const from=Math.round(top+height*.12),to=Math.min(rows.length-1,Math.round(top+height*.32));
  let neck=-1;
  for(let y=from;y<=to;y++)if(width(y)>0&&(neck<0||width(y)<width(neck)))neck=y;
  if(neck<0)return null;
  for(let y=neck;y<Math.min(rows.length,neck+height*.15);y++)if(width(y)>=width(neck)*1.2)return y;
  return null;
}

/**
 * The avatar square from the hair top to the collarbone: the hair sits CROP.headroom of the square below its top, as the
 * player expects; centred on the head and kept inside the picture.
 * @param {{width:number,height:number}} image @param {{top:number,clavicle:number,center:number}} at pixels
 * @returns {AvatarCrop}
 */
export function avatarCropFor(image,{top,clavicle,center}) {
  if(![top,clavicle,center].every(Number.isFinite)||clavicle<=top)throw new Error('锁骨须在发顶之下。');
  let size=Math.round((clavicle-top)/(1-CROP.headroom));
  size=Math.min(size,image.width,image.height);
  const y=clamp(Math.round(clavicle-size),0,image.height-size),x=clamp(Math.round(center-size/2),0,image.width-size);
  return validateAvatarCrop({x,y,size},image);
}

/** The square cut out, for looking at. @param {Rgba} image @param {AvatarCrop} crop @returns {Rgba} */
export function cropPixels(image,{x,y,size}) {
  const data=new Uint8Array(size*size*4);
  for(let row=0;row<size;row++)data.set(image.data.subarray(((y+row)*image.width+x)*4,((y+row)*image.width+x+size)*4),row*size*4);
  return {width:size,height:size,data};
}

/* The whole portrait on grey with the square outlined and ticks on both edges at every 5% of the height (longer every
 * 10%), so positions can be read off as fractions. */
/** @param {Rgba} image @param {AvatarCrop|null} crop @returns {Rgba} */
export function guidePixels(image,crop) {
  const {width,height}=image,data=new Uint8Array(width*height*4);
  for(let i=0;i<width*height;i++) {
    const a=image.data[i*4+3]/255,check=((Math.floor(i%width/16)+Math.floor(i/width/16))%2)?200:170;
    for(let c=0;c<3;c++)data[i*4+c]=Math.round(image.data[i*4+c]*a+check*(1-a));
    data[i*4+3]=255;
  }
  const paint=(/** @type {number} */ x,/** @type {number} */ y,/** @type {number[]} */ rgb)=>{
    if(x<0||y<0||x>=width||y>=height)return;
    data.set(rgb,(y*width+x)*4);
  };
  for(let k=1;k<20;k++) {
    const y=Math.round(height*k/20),long=k%2===0?width*.08:width*.04;
    for(let t=0;t<2;t++)for(let x=0;x<long;x++){paint(x,y+t,[0,90,255]);paint(width-1-x,y+t,[0,90,255]);}
  }
  if(crop)for(let t=0;t<3;t++)for(let d=0;d<crop.size;d++) {
    paint(crop.x+d,crop.y+t,[255,0,0]);paint(crop.x+d,crop.y+crop.size-1-t,[255,0,0]);
    paint(crop.x+t,crop.y+d,[255,0,0]);paint(crop.x+crop.size-1-t,crop.y+d,[255,0,0]);
  }
  return {width,height,data};
}
