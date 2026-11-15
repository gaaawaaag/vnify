import {renderPrompt} from '../prompts/library.js';
// glossary: world terms written alongside character dossiers (simple or detailed only).
export function dossierOptions(value={}) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('人物资料设置无效。');
  const mode=value.mode??'detailed',batching=value.batching??'chapter',glossary=value.glossary??false;
  // group: dossiers follow chapter groups and the director no longer waits for them (new tasks).
  if(!['off','simple','detailed'].includes(mode)||!['chapter','book','group'].includes(batching)||(mode==='off'&&batching!=='group'))throw new Error('人物资料设置无效。');
  if(typeof glossary!=='boolean'||glossary&&mode==='off')throw new Error('世界词条需要人物资料为简单或详细模式。');
  return {mode,batching,...(glossary?{glossary:true}:{})};
}

export function validateDossierMode(details,value) {
  const options=dossierOptions(value);
  if(options.mode==='simple')for(const event of details.events) {
    if(!['@intro','@person'].includes(event.command)||event.attrs.group!==undefined)throw new Error('简单人物资料只接受姓名与简介；请移除分组、详情或外观事件。');
  }
  if(!options.glossary&&details.terms?.length)throw new Error('未开启世界词条；请移除 @term。');
  return details;
}
