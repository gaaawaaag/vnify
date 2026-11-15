import {activeCutIn} from '../core/cut-ins.js';
import {t} from '../reader/player-text.js';
import {createCutInView} from './cut-in-view.js';
import {activeCg} from '../core/cgs.js';
import {variantAt,unitLocation} from '../core/variants.js';
import { emptyBackgrounds,backgroundCandidates,reconcileBackgrounds } from '../reader/backgrounds.js';
import {createBackgroundView} from './background-view.js';
import {preload} from './image-preload.js';

const AHEAD=6;

// The reading background, CG and Cut-in on stage; the gallery reads the same pictures through pictures().
export function createBackgroundPanel({getContext,onSceneChange=()=>{},getIllustration=()=>null,toast}) {
  const $=id=>document.getElementById(id);
  let data=null,bookId=null,ready=Promise.resolve(),generation=0;
  let stageScope='scene',stageChapter=null;
  let cgVisible=false,renderVersion=0;
  const cutInView=createCutInView({root:$('cut-in-region'),image:$('cut-in-image'),reader:$('reader'),controls:{open:$('cut-in-open'),
    collapse:$('cut-in-collapse'),expand:$('cut-in-expand'),viewer:$('cut-in-viewer'),viewerImage:$('cut-in-viewer-image')},
    onChange:()=>onSceneChange()});
  const view=createBackgroundView({root:$('reader-background'),reader:$('reader'),onCgChange:value=>{cgVisible=value;onSceneChange();}});
  async function render({scope,chapterId,animate=false} = {}) {
    if(scope){stageScope=scope;stageChapter=chapterId??null;}
    const revision=++renderVersion;await ready;
    if(revision!==renderVersion)return;
    const {story,index,intro}=getContext();
    const unit=story?.units[index];
    const target=stageScope==='chapter'&&unit?{chapter:{id:stageChapter??unit.chapter.id},block:{loc:null}}:unit;
    const loc=stageScope==='scene'&&unit?unitLocation(unit):null;
    const variant=loc&&document.documentElement.dataset.variants!=='off'?variantAt(story,loc,index):null;
    const candidates=story?.book.id===bookId?backgroundCandidates(data,target,story,variant):[];
    const cut=stageScope==='scene'&&!intro&&story?.book.id===bookId?activeCutIn(story,index):null;
    const cutImage=cut&&data?.bindings.cutIns?.[cut.id];
    // An original-book illustration takes the Cut-in place over a Director Cut-in.
    const illustration=stageScope==='scene'&&!intro&&story?getIllustration(story,index):null;
    void cutInView.show(illustration??(cutImage&&data.images[cutImage]?{id:cutImage,src:data.images[cutImage].src}:null));
    const cg=stageScope==='scene'&&!intro?activeCg(story,index):null;
    const cgImage=cg&&data?.bindings.cgs?.[cg.id];
    if(cgImage&&data.images[cgImage]){
      const shown=await view.show({id:cgImage,src:data.images[cgImage].src,kind:'cg',animate});
      if(shown!==false||revision!==renderVersion)return;
    }
    for(const candidate of candidates){
      if(revision!==renderVersion)return;
      const shown=await view.show({...candidate,src:data.images[candidate.id].src,animate});
      if(shown!==false||revision!==renderVersion)return;
    }
    if(revision===renderVersion)await view.show({id:null,src:null,kind:'fallback',animate});
  }
  // The images of the next few lines: their background, CG and Cut-in.
  function preloadAhead() {
    const {story,index}=getContext();
    if(!story||story.book.id!==bookId||!data)return;
    for(let i=index+1;i<=Math.min(index+AHEAD,story.units.length-1);i++) {
      const unit=story.units[i],loc=unitLocation(unit);
      const variant=loc&&document.documentElement.dataset.variants!=='off'?variantAt(story,loc,i):null;
      const ids=[backgroundCandidates(data,unit,story,variant)[0]?.id,data.bindings.cgs?.[activeCg(story,i)?.id],
        data.bindings.cutIns?.[activeCutIn(story,i)?.id]];
      for(const id of ids)if(id)preload(data.images[id]?.src);
    }
  }
  // The book's background manifest as the shelf holds it, its images given by address.
  function setStory(story,manifest) {
    ++generation;bookId=story.book.id;
    cutInView.reset();view.reset();stageScope='scene';stageChapter=null;
    try {data=reconcileBackgrounds(manifest,story);}
    catch {data=emptyBackgrounds(story.book.id);toast(t('作品的背景清单无法使用，请重新导入作品包。'));}
    render();
    return ready;
  }
  // The book's pictures as the shelf holds them, for the gallery once they are read in.
  async function pictures(id) {
    await ready;
    return bookId===id&&data?data:null;
  }
  async function titleCard(id){
    await ready;
    const key=bookId===id?data?.bindings.titleCard:null;
    return key?data.images[key]?.src??null:null;
  }
  return {get cgVisible(){return cgVisible;},get cutInVisible(){return cutInView.visible;},setStory,render,preloadAhead,titleCard,pictures};
}
