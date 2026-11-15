export function chapterProgress(story,index) {
  const id=story.units[index].chapter.id;
  const start=story.units.findIndex(u=>u.chapter.id===id);
  let end=start;while(end<story.units.length && story.units[end].chapter.id===id)end++;
  return {current:index-start+1,total:end-start};
}
