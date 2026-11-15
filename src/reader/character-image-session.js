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
  return {setStory,avatar};
}
