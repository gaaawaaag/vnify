import {directorImagePrompt} from './director.js';
import {characterBackgroundPrompt} from './image-prompts.js';
import {defaultColor} from './colors.js';
/* Each character's effective standing-portrait design: chapter results are immutable deltas merged per ID,
 * in story order (never JSON/comment order or the current reading position). */
export function portraitRegistry(story,directors,options={}) {
  const order=new Map(story.chapters.map((chapter,i)=>[chapter.id,i]));
  const docs=directors.filter(doc=>order.has(doc.chapterId)).slice().sort((a,b)=>order.get(a.chapterId)-order.get(b.chapterId));
  const registry=new Map(),descriptions=new Map();
  for(const doc of docs)for(const c of doc.characters) {
    const design={...descriptions.get(c.characterId),...c};
    descriptions.set(c.characterId,design);
    const content=[design.face,design.body].filter(Boolean).join('\n');
    const color=story.entities.get(c.characterId)?.color||defaultColor(c.characterId);
    const mode=options.transparencyMethod==='cutout'?'cutout':'transparent';
    registry.set(c.characterId,{
      ...design,chapterId:doc.chapterId,contentPrompt:content,transparency:mode,
      prompt:directorImagePrompt(doc,content,'standing',color,mode),backgroundPrompt:characterBackgroundPrompt(mode,color),
    });
  }
  return registry;
}
