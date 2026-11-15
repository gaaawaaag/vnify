// @ts-check
import {imageUse,canEdit,formatKey,fingerprint} from './image-presets.js';
import {renderPrompt} from '../prompts/library.js';

const lines=(/** @type {string} */ id)=>/** @type {string[]} */(renderPrompt(id).split('\n'));
const FRAMING={en:lines('image11.standing-framing'),zh:lines('image11.standing-framing-zh')};
/** The standing framing a composed prompt carries, in English and in Chinese; a rewrite keeps one set word for word. @param {string} prompt */
export const keptFraming=prompt=>FRAMING.en.every(line=>prompt.includes(line))?FRAMING:null;
/** @param {string} composed @param {string} text */
export const framingKept=(composed,text)=>!keptFraming(composed)||Object.values(FRAMING).some(set=>set.every(line=>text.includes(line)));

// A rewrite counts while it was made under the preset's current format, from the prompt as it is composed now, keeping its framing.
/** @param {any} preset @param {any} image @param {'prompt'|'edit'} which */
function rewriteOf(preset,image,which) {
  const key=formatKey(preset),entry=image.formatted?.[preset.id],done=entry?.[which],composed=which==='edit'?image.editPrompt:image.prompt;
  if(!key||entry?.format!==key||!composed||done?.source!==fingerprint(composed))return null;
  return framingKept(composed,done.text)?done.text:null;
}

/* The prompts the agent rewrites for one image service preset (docs/prompt-formats.md): every image the work's 生图方案
 * draws with it, the text prompt and, when the preset edits by instruction, the edit prompt. Prompts the user rewrote by
 * hand are left out; so are ones already rewritten under the current format, unless all is set. A CG's item says who
 * @1–@3 are; the rewrite keeps those tokens, and the program adds the cast lines when it sends. A standing portrait's item
 * lists the framing sentences, English and Chinese, of which the rewrite keeps one set word for word (keep). */
/** @param {any[]} catalog @param {{uses:Record<string,string>,overrides:Record<string,string>}} scheme @param {any} preset @param {{all?:boolean}} [options] */
export function formatItems(catalog,scheme,preset,{all=false}={}) {
  const items=[];
  for(const asset of catalog)for(const image of asset.images) {
    if(image.prompt==null||(scheme.overrides[image.key]??scheme.uses[imageUse(asset,image)])!==preset.id)continue;
    const cast=asset.cast?.length?{cast:asset.cast.map((/** @type {any} */ c,/** @type {number} */ i)=>({token:`@${i+1}`,name:c.label,look:c.look}))}:{};
    const keep=keptFraming(image.prompt),kept=keep?{keep}:{};
    if(!image.sent&&(all||!rewriteOf(preset,image,'prompt')))items.push({key:image.key,ratio:image.aspectRatio,prompt:image.prompt,...kept,...cast});
    if(image.editPrompt!==undefined&&canEdit(preset)&&preset.format.edit==='instruction'&&!image.sentEdit&&(all||!rewriteOf(preset,image,'edit')))
      items.push({key:`${image.key}#edit`,ratio:image.aspectRatio,prompt:image.editPrompt});
  }
  return items;
}

/** The @1–@3 tokens a prompt uses, for checking that a rewrite kept them. @param {string} text */
export const castTokens=text=>[...new Set(text.match(/@\d+/g)??[])].sort().join(' ');

/* The text sent for an image (docs/prompt-formats.md): the user's own rewrite, else the agent's rewrite for this preset
 * made under its current format from the current composed prompt, else the composed prompt. An edit sends the edit instruction unless the preset's format
 * sends the full description. pending: the preset rewrites prompts and this one has no rewrite yet. */
/** @param {any} preset @param {any} image @param {boolean} edit */
export function chosenPrompt(preset,image,edit) {
  const instruction=edit&&preset.format.edit==='instruction'&&image.editPrompt!==undefined;
  const [manual,agent,composed]=instruction?[image.sentEdit,rewriteOf(preset,image,'edit'),image.editPrompt]
    :[image.sent,rewriteOf(preset,image,'prompt'),image.prompt];
  if(manual)return {prompt:manual,source:'manual',pending:false};
  if(agent)return {prompt:agent,source:'formatted',pending:false};
  return {prompt:composed,source:'composed',pending:!!formatKey(preset)&&!!composed};
}
