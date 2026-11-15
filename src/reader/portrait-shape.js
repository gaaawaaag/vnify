// @ts-check
// Portraits are about 2:3: models such as gpt-image draw only fixed sizes and local upscaling multiplies the requested
// size, so a shape within 3% of 2:3 is used as it is; the player sizes figures by height either way.
export const PORTRAIT_TOLERANCE=.03;
/** @param {number} width @param {number} height */
export const isPortraitShape=(width,height)=>width>0&&height>0&&Math.abs(width/height*1.5-1)<=PORTRAIT_TOLERANCE;
