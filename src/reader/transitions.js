// Reader transitions in one place: change durations, easing or keyframes here.
// Animated changes run through playTransition; holds are how long a title stays before text.
// The CSS enter animations of chapter/scene titles, the letterbox and standing figures remain in styles/style.css;
// the memory/dream picture filter and vignette fade by CSS transitions in styles/surfaces.css.
export const TRANSITIONS=Object.freeze({
  titleIn:{keyframes:[{opacity:0},{opacity:1}],duration:1000,easing:'ease-out'},
  titleOut:{keyframes:[{opacity:1},{opacity:0}],duration:700,easing:'ease-in'},
  backgroundFade:{keyframes:[{opacity:0},{opacity:1}],duration:420,easing:'cubic-bezier(.22,.61,.36,1)'},
  // Another place: a dissolve while the new picture settles from slightly enlarged.
  placeIn:{keyframes:[{opacity:0},{opacity:1}],duration:900,easing:'ease-in-out'},
  placeSettle:{keyframes:[{transform:'scale(1.04)'},{transform:'scale(1)'}],duration:2200,easing:'cubic-bezier(.2,.6,.3,1)'},
  // A new chapter: the picture sweeps in from the right with a soft edge (the mask is in styles/backgrounds.css).
  chapterWipe:{keyframes:[{'--wipe':'-14%'},{'--wipe':'114%'}],duration:1100,easing:'cubic-bezier(.55,.05,.35,1)'},
  // Into a memory the scene blurs away and the memory comes out of the blur; out of it the present comes into focus.
  memoryLeave:{keyframes:[{filter:'blur(0px)'},{filter:'blur(10px)'}],duration:600,easing:'ease-in'},
  memoryEnter:{keyframes:[{opacity:0,filter:'blur(14px)'},{opacity:1,filter:'blur(0px)'}],duration:1000,easing:'ease-out'},
  memoryReturn:{keyframes:[{opacity:0,filter:'blur(10px)'},{opacity:1,filter:'blur(0px)'}],duration:800,easing:'ease-out'},
  // Into a dream the scene whitens into fog and the dream comes out of it; waking, the fog clears faster.
  dreamFogOut:{keyframes:[{filter:'blur(0px) brightness(1)'},{filter:'blur(14px) brightness(1.8)'}],duration:800,easing:'ease-in'},
  dreamFogIn:{keyframes:[{opacity:0,filter:'blur(14px) brightness(1.8)'},{opacity:1,filter:'blur(0px) brightness(1)'}],duration:1100,delay:600,easing:'ease-out'},
  wakeFogOut:{keyframes:[{filter:'blur(0px) brightness(1)'},{filter:'blur(14px) brightness(1.8)'}],duration:600,easing:'ease-in'},
  wakeFogIn:{keyframes:[{opacity:0,filter:'blur(14px) brightness(1.8)'},{opacity:1,filter:'blur(0px) brightness(1)'}],duration:900,delay:450,easing:'ease-out'},
  // The same picture kept across the change blurs or fogs over and clears again.
  memoryBlur:{keyframes:[{filter:'blur(0px)'},{filter:'blur(10px)',offset:.4},{filter:'blur(0px)'}],duration:1100,easing:'ease-in-out'},
  memoryFocus:{keyframes:[{filter:'blur(0px)'},{filter:'blur(8px)',offset:.3},{filter:'blur(0px)'}],duration:900,easing:'ease-in-out'},
  dreamFog:{keyframes:[{filter:'blur(0px) brightness(1)'},{filter:'blur(14px) brightness(1.8)',offset:.45},{filter:'blur(0px) brightness(1)'}],duration:1700,easing:'ease-in-out'},
  wakeFog:{keyframes:[{filter:'blur(0px) brightness(1)'},{filter:'blur(14px) brightness(1.8)',offset:.4},{filter:'blur(0px) brightness(1)'}],duration:1300,easing:'ease-in-out'},
});
export const HOLDS=Object.freeze({chapter:2200,scene:1600,separator:1200});

/* How a background change plays: previous and next name the transitions of the outgoing and incoming picture, settle
 * one that runs on after the change counts as done, wipe marks the incoming picture for the chapter mask, lead how
 * soon (ms) a title may follow before the change is done, and same what plays when the picture stays the same. */
export const BACKGROUND_CHANGES=Object.freeze({
  fade:{next:['backgroundFade']},
  place:{next:['placeIn'],settle:['placeSettle'],lead:300},
  chapter:{next:['chapterWipe'],wipe:true},
  memoryIn:{previous:['memoryLeave'],next:['memoryEnter'],same:['memoryBlur']},
  memoryOut:{next:['memoryReturn'],same:['memoryFocus']},
  dreamIn:{previous:['dreamFogOut'],next:['dreamFogIn'],same:['dreamFog']},
  dreamOut:{previous:['wakeFogOut'],next:['wakeFogIn'],same:['wakeFog']},
});

/* Which change plays between two frames ({id,kind,locationId,place,chapterId,effect}; place is the scene's location
 * whatever picture stands for it): a new chapter, then entering or leaving a memory or dream, then travel between
 * places; anything else fades. With the same picture on both sides there is nothing to wipe, so only a memory or
 * dream counts. */
export function backgroundChange(previous,next) {
  const samePicture=previous.id===next.id;
  if(!samePicture&&previous.chapterId&&next.chapterId&&previous.chapterId!==next.chapterId)return 'chapter';
  if((previous.effect??'none')!==(next.effect??'none')) {
    if(next.effect==='memory')return 'memoryIn';
    if(next.effect==='dream')return 'dreamIn';
    return previous.effect==='memory'?'memoryOut':'dreamOut';
  }
  if(samePicture)return null;
  if(!previous.id||!next.id)return 'fade';
  const pictures=previous.kind==='location'&&next.kind==='location'
    &&(!next.locationId||!previous.locationId||next.locationId!==previous.locationId);
  const places=previous.kind!=='cg'&&next.kind!=='cg'&&!!previous.place&&!!next.place&&previous.place!==next.place;
  return pictures||places?'place':'fade';
}

export const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;

// Returns the running Animation, or null when motion is off; callers await finished or call finish().
export function playTransition(node,name,{enabled=true}={}) {
  const transition=TRANSITIONS[name];
  if(!transition)throw new Error(`未知切换效果：${name}`);
  if(!enabled||reducedMotion())return null;
  return node.animate(transition.keyframes,{duration:transition.duration,delay:transition.delay??0,easing:transition.easing,fill:'both'});
}
