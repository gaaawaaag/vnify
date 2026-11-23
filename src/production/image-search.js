// @ts-check
/* Photo libraries searched for backgrounds (docs/dev/image-search.md): Pexels and Pixabay, each with the user's free API
 * key kept with the other keys. A chosen picture is downloaded into the work and bound, credited by library and author.
 * Shared by the asset manager page (names) and the server side (image-library.js). */
export const IMAGE_SEARCH_SOURCES=/** @type {const} */(['pexels','pixabay']);
export const IMAGE_SEARCH_NAMES={pexels:'Pexels',pixabay:'Pixabay'};
// Kinds whose pictures may be searched for first: places and moods, where a photo or an illustration can stand in.
export const SEARCH_KINDS=new Set(['ambient','location']);

/** @typedef {'pexels'|'pixabay'} ImageSearchSource */
/** @typedef {{source:ImageSearchSource,key:string,id:string,name:string,author:string,license:string,url:string,
 *   width:number,height:number,thumb:string,download:string}} ImageHit */

/** The credit line written as the picture's maker. @param {{source:string,author?:string}} hit */
export const imageCredit=hit=>[IMAGE_SEARCH_NAMES[/** @type {ImageSearchSource} */(hit.source)]??hit.source,String(hit.author??'').trim()].filter(Boolean).join(' · ');
