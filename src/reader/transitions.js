// Reader transitions in one place: change durations, easing or keyframes here.
// Animated changes run through playTransition; holds are how long a title stays before text.
// The CSS enter animations of chapter/scene titles and the letterbox remain in styles/style.css.
export const TRANSITIONS=Object.freeze({
  titleIn:{keyframes:[{opacity:0},{opacity:1}],duration:1000,easing:'ease-out'},
  titleOut:{keyframes:[{opacity:1},{opacity:0}],duration:700,easing:'ease-in'},
  backgroundSlide:{keyframes:[{transform:'translateX(-100%)'},{transform:'translateX(0)'}],duration:520,easing:'cubic-bezier(.22,.61,.36,1)'},
  backgroundFade:{keyframes:[{opacity:0},{opacity:1}],duration:420,easing:'cubic-bezier(.22,.61,.36,1)'},
});
export const HOLDS=Object.freeze({chapter:2200,scene:1600,separator:1200});

export const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;

// Returns the running Animation, or null when motion is off; callers await finished or call finish().
export function playTransition(node,name,{enabled=true}={}) {
  const transition=TRANSITIONS[name];
  if(!transition)throw new Error(`未知切换效果：${name}`);
  if(!enabled||reducedMotion())return null;
  return node.animate(transition.keyframes,{duration:transition.duration,easing:transition.easing,fill:'both'});
}
