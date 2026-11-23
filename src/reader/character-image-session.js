import {emptyCharacterImages,reconcileCharacterImages,resolveCharacterImage} from './character-images.js';

// The open book's character images as the shelf holds them (given by address), kept apart from text progress.
export function createCharacterImageSession({onError=()=>{},onChange=()=>{}}={}) {
  let data=null,story=null;
  function setStory(next,manifest) {
    story=next;
    try {data=reconcileCharacterImages(manifest,story);}
    catch {data=emptyCharacterImages(story.book.id);onError('作品的角色图片清单无法使用，请重新导入作品包。');}
    onChange();
  }
  function avatar(bookId,id,visibleIds,expression=null,options) {return story?.book.id===bookId?resolveCharacterImage(data,id,visibleIds,expression,options):null;}
  // Every look of every character with a standing portrait, disclosed or not (for sizing the stage, never shown).
  function looks() {
    if(!data)return [];
    return Object.entries(data.bindings).flatMap(([characterId,slots])=>
      [[null,slots.standing],...Object.entries(slots.variants??{})].flatMap(([variantId,portrait])=>{
        const image=portrait&&data.images[portrait.imageId];
        return image?[{characterId,variantId,image,crop:portrait.crop??null}]:[];
      }));
  }
  return {setStory,avatar,looks};
}
