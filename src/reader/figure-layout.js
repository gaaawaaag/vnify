/* Standing portraits are all drawn at one image height, whatever their head-to-body proportions; the stage sets that
 * height and the hair line, and each figure's hair top (measured from a transparent image) is put on the line. Without
 * a measured hair top the image is assumed to be a cowboy shot whose hair starts at REFERENCE.top and whose head spans
 * REFERENCE.head of the image height (the avatar crop uses the same framing).
 * A saved avatar square sets the figure instead, so that every head is drawn the same size and height: the square,
 * taken from just above the hair to above the collarbone, is drawn CROP.size image heights tall, as that square sits in
 * the reference cowboy shot, and the hair, CROP.headroom of the square below its top, goes on the line. A full-length
 * picture is thus enlarged and its legs run past the screen bottom; the scale stays within SCALE_LIMITS.
 * stature lowers a short character by the height they lack (an adult stands ADULT_HEADS reference heads tall, the drop
 * compressed by DROP_SCALE so children stay in view) and shrinks the image only half as much, as children's heads are
 * large for their height. The stage keeps the hair line within its limits and the image bottom below the band's solid edge. */
export const REFERENCE={top:.04,head:.2};
export const CROP={size:.3,headroom:.05};
const ADULT_HEADS=7.5,DROP_SCALE=.5,SCALE_LIMITS=[.5,3];
// How far everyone on stage may be enlarged together before they are moved down instead.
export const STAGE_ZOOM_LIMIT=1.3;

// hairTop: the hair top as a fraction of the image height, or null; crop: a saved avatar square's top and side as
// fractions of the image height, or null. Returns, in stage image heights, scale (image height), top (image top
// relative to the hair line) and drop (how far the hair line sinks).
export function figureLayout(hairTop=null,stature=1,crop=null) {
  const fit=crop?Math.min(SCALE_LIMITS[1],Math.max(SCALE_LIMITS[0],CROP.size/crop.size)):1;
  const scale=fit*(1-(1-stature)/2),hair=crop?crop.top+CROP.headroom*crop.size:hairTop??REFERENCE.top;
  return {scale,top:-hair*scale,drop:(1-stature)*ADULT_HEADS*DROP_SCALE*REFERENCE.head};
}

/* A figure whose image ends above the floor (a large head saved in its avatar square makes the image small) would leave
 * a gap under it. Everyone on stage is first enlarged together about their hair lines, up to STAGE_ZOOM_LIMIT, and what
 * is still missing moves them all down by the same distance, so heads keep one size and one height.
 * figures: layouts from figureLayout; stage: pixel sizes of the stage (height), the hair line, the floor, the band top
 * and the image height (base), as the stylesheet resolves them. Returns the common zoom and the downward shift in pixels. */
/** @param {{scale:number,top:number,drop:number}[]} figures @param {{height:number,hair:number,floor:number,bandTop:number,base:number}} stage */
export function stageFit(figures,stage,limit=STAGE_ZOOM_LIMIT) {
  const {height,hair,floor,bandTop,base}=stage;
  if(!figures.length||!(base>0))return {zoom:1,shift:0};
  // The hair line as the stylesheet clamps it: on screen, and .3 image heights above the band.
  const placed=figures.map(f=>({hair:Math.max(.02*height,Math.min(hair+f.drop*base,bandTop-.3*base)),reach:(f.top+f.scale)*base}));
  const zoom=Math.min(limit,Math.max(1,...placed.map(p=>p.reach>0?(floor-p.hair)/p.reach:1)));
  const shift=Math.max(0,...placed.map(p=>floor-(p.hair+p.reach*zoom)));
  return {zoom,shift};
}
