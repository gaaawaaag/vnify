// @ts-check
/** @import {AudioAssets,PackageCredits} from '../types/assets.js' */
/** @import {Story} from '../types/story.js' */

/* The work's credits (docs/dev/audio.md): the package's credits record (image models, a notice, whether vnify. is
 * credited, the agents' models) together with what the text and the audio manifest already say — the original, the tracks' and sounds'
 * sources, the voices. A package without a record still shows the rest, with vnify. credited. */
export const CREDITS_VERSION=1;

/** @param {unknown} value @returns {PackageCredits} */
export function validateCredits(value) {
  const credits=/** @type {any} */(value);
  if(!credits||typeof credits!=='object'||credits.version!==CREDITS_VERSION)throw new Error('致谢记录无效。');
  if(!Array.isArray(credits.images)||credits.images.length>64||credits.images.some((/** @type {unknown} */ m)=>typeof m!=='string'||!m.trim()||m.length>200))
    throw new Error('致谢记录的 images 须为模型名称数组。');
  if(credits.notice!==undefined&&(typeof credits.notice!=='string'||credits.notice.length>2000))throw new Error('致谢记录的说明无效。');
  if(typeof credits.signature!=='boolean')throw new Error('致谢记录的 signature 须为布尔值。');
  if(credits.agents!==undefined&&(!Array.isArray(credits.agents)||credits.agents.length>8
    ||credits.agents.some((/** @type {unknown} */ m)=>typeof m!=='string'||!m.trim()||m.length>100)))throw new Error('致谢记录的 agents 须为模型名称数组。');
  const agents=(credits.agents??[]).map((/** @type {string} */ m)=>m.trim());
  return {version:CREDITS_VERSION,images:credits.images.map((/** @type {string} */ m)=>m.trim()),
    ...(credits.notice?.trim()?{notice:credits.notice.trim()}:{}),signature:credits.signature,...(agents.length?{agents}:{})};
}

/** @typedef {{text:string,meta?:string,url?:string}} CreditItem */
/** @typedef {{key:'original'|'notice'|'images'|'music'|'sounds'|'voices'|'made',items:CreditItem[]}} CreditSection */

/**
 * The sections to show, in order, leaving out empty ones.
 * @param {Story} story @param {PackageCredits|null|undefined} credits @param {AudioAssets|null|undefined} audio
 * @param {{book:(title:string)=>string}} words how the original's title is written in the interface language
 * @returns {CreditSection[]}
 */
export function creditSections(story,credits,audio,words) {
  const files=audio?.files??{};
  /** @param {string} name @param {string|undefined} fileId @returns {CreditItem|null} */
  const sourced=(name,fileId)=>{
    const file=fileId?files[fileId]:undefined;
    if(!file)return null;
    const source=file.source??{},meta=[source.author,source.license].filter(Boolean).join(' · ');
    return {text:source.title&&source.title!==file.name?source.title:name,...(meta?{meta}:{}),...(source.url?{url:source.url}:{})};
  };
  const music=(story.music?.tracks??[]).map(track=>sourced(track.name,audio?.bindings.tracks[track.id])).filter(Boolean);
  const sounds=(story.sounds?.sounds??[]).map(sound=>sourced(sound.name,audio?.bindings.sounds?.[sound.id])).filter(Boolean);
  // Voices by service, named as the record names them.
  /** @type {Map<string,string[]>} */
  const voiceNames=new Map();
  for(const [key,label] of Object.entries(story.voices?.labels??{})) {
    const service=key.startsWith('elevenlabs:')?'ElevenLabs':key.startsWith('gemini:')?'Gemini TTS':'Fish Audio';
    voiceNames.set(service,[...voiceNames.get(service)??[],label]);
  }
  /** @type {CreditSection[]} */
  const sections=[
    {key:'original',items:[{text:words.book(story.book.title),...(story.book.author?{meta:story.book.author}:{})}]},
    {key:'notice',items:credits?.notice?[{text:credits.notice}]:[]},
    {key:'images',items:(credits?.images??[]).map(text=>({text}))},
    {key:'music',items:/** @type {CreditItem[]} */(music)},
    {key:'sounds',items:/** @type {CreditItem[]} */(sounds)},
    {key:'voices',items:[...voiceNames].map(([text,names])=>({text,meta:names.join('、')}))},
    {key:'made',items:[...credits?.signature===false?[]:[{text:'vnify.'}],...(credits?.agents??[]).map(text=>({text,meta:'agent'}))]},
  ];
  return sections.filter(section=>section.items.length);
}
