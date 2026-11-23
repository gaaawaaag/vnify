import {renderPrompt} from '../prompts/library.js';

// A standing portrait is transparent: asked of the image tool directly, or drawn on a flat color and cut out afterwards.
export const TRANSPARENCY_METHODS=['native','cutout'];
/** @param {'transparent'|'cutout'} mode @param {string} [color] */
export function characterBackgroundPrompt(mode,color) {
  return renderPrompt(mode==='cutout'?'image11.cutout':'image11.transparent',{color:color??'#667788'});
}
// Variants are edits of the default image: the prompt names only what the variant changes. A portrait edit repeats the
// background sentence of the default portrait (mode and color as in characterBackgroundPrompt): editing models do not
// keep a transparent background unless asked.
/** @param {any} variant @param {'transparent'|'cutout'} [mode] @param {string} [color] */
export function variantEditPrompt(variant,mode='transparent',color) {
  if(variant.prompt!==undefined)return renderPrompt('image11.variant-location',{object:variant.prompt});
  const object=[variant.face,variant.body].filter(Boolean).join('\n');
  return object?renderPrompt('image11.variant-character',{object,background:characterBackgroundPrompt(mode,color)}):null;
}
// A job with reference images gets a preface naming what the references fix; the text prompt still sets the rest.
// A CG may combine a cast preface with a scene preface for the source panel of the same moment.
export function referencePrompt(kinds,prompt,names=[]) {
  const preface=[kinds].flat().map(kind=>kind==='cast'?renderPrompt('image11.ref-cast',{names:names.join(', ')}):renderPrompt(`image11.ref-${kind}`));
  return `${preface.join('\n')}\n\n${prompt}`;
}
/* A CG's main characters, named @1–@3 in its prompt: each is listed with their look, by name and, when their portrait goes
 * along, by its label among the reference pictures (label '' when the preset does not number them). */
/** @param {string} prompt @param {{name:string,look:string,label?:string|null}[]} cast label: null when no portrait is sent */
export function castPrompt(prompt,cast) {
  if(!cast.length)return prompt;
  const named=cast.map(c=>c.label?`${c.name} (${c.label})`:c.name),sent=named.filter((_,i)=>typeof cast[i].label==='string');
  const preface=[...(sent.length?[renderPrompt('image11.ref-cast',{names:sent.join(', ')})]:[]),
    renderPrompt('image11.cast',{cast:cast.map((c,i)=>`- ${named[i]}: ${c.look}`).join('\n')})];
  return `${preface.join('\n')}\n\n${prompt.replace(/@([1-9])(?!\d)/g,(token,n)=>named[Number(n)-1]??token)}`;
}
// mode: how a standing portrait's transparency is made (see characterBackgroundPrompt).
export function composeImagePrompt(doc,content,purpose='background',color,mode='transparent') {
  const style=doc.artStyles[['standing','cg','title-card','end-card'].includes(purpose)?'character':'background'];
  return renderPrompt(`image11.${purpose}`,{object:content,style,background:characterBackgroundPrompt(mode,color)});
}
