import {playTransition,backgroundChange,BACKGROUND_CHANGES} from '../reader/transitions.js';

// Keep the previous decoded image visible until its replacement is ready.
/* Each layer is marked tall or wide (by the picture's own proportions) and CG or scene; the stylesheet shows it to
 * fill the screen or whole over a blurred copy depending on the screen's orientation. A tall picture shown now marks
 * the reader, so narrow screens can let it run behind the text.
 * Each frame remembers its chapter and whether the reader was in a memory or dream when it was shown, which picks the
 * change that plays (src/reader/transitions.js). */
export function createBackgroundView({root,reader,onCgChange=()=>{}}) {
  let current=null,pending=null,version=0,transition=null;
  const release=frame=>frame.node.remove();
  const mark=frame=>{frame.node.className=`reader-background-layer${frame.tall?' is-tall':''}${frame.kind==='cg'?' is-cg':''}`;};
  const markReader=()=>reader.classList.toggle('tall-picture',Boolean(current?.tall&&current.id));
  // A document drops the memory or dream marks while it lies over the scene; the scene keeps its own.
  const has=name=>reader.classList.contains?.(name);
  const effectNow=()=>has('document-mode')?current?.effect??'none':has('memory-mode')?'memory':has('dream-mode')?'dream':'none';
  function reset() {
    version++;pending=null;transition?.finish();
    if(current)release(current);current=null;
    reader.classList.remove('has-background');reader.classList.remove('tall-picture');onCgChange(false);
  }
  function retake(frame,{kind,locationId,place,chapterId,effect}) {
    Object.assign(frame,{kind,locationId,place,chapterId,effect});mark(frame);onCgChange(kind==='cg');
  }
  // src is the image's address on the shelf; null shows no image.
  function show({id,src,kind,locationId=null,place=null,chapterId=null,animate=false}) {
    const key=`${id}:${kind}:${locationId}`,effect=effectNow(),state={kind,locationId,place,chapterId,effect};
    if(pending?.key===key)return pending.answer;
    if(!pending&&current?.id===id) {
      transition?.finish();
      // Into or out of a memory or dream on the same picture, the picture itself blurs or fogs over and clears.
      const change=animate&&current.id&&current.effect!==effect?BACKGROUND_CHANGES[backgroundChange(current,{id,...state})]:null;
      retake(current,state);
      for(const name of change?.same??[])playTransition(current.node,name);
      return Promise.resolve(true);
    }
    const token=++version;
    let answerEarly;
    const early=new Promise(resolve=>{answerEarly=resolve;});
    const promise=(async()=>{
      const url=src??null;
      let tall=false;
      if(url) {
        const img=new Image();img.src=url;
        try{await img.decode();}
        catch{return false;}
        tall=img.naturalHeight>img.naturalWidth;
      }
      if(token!==version)return;
      transition?.finish();
      // A rapid return to the displayed image only cancels the pending change.
      if(current?.id===id){retake(current,state);return;}
      const node=document.createElement('div');
      if(url)node.style.backgroundImage=`url("${url}")`;
      const next={id,node,tall,...state},previous=current;
      mark(next);root.append(node);current=next;markReader();onCgChange(kind==='cg'||previous?.kind==='cg');
      reader.classList.toggle('has-background',Boolean(id||previous?.id));
      const animations=[];
      if(animate&&previous) {
        const change=BACKGROUND_CHANGES[backgroundChange(previous,next)];
        const play=(frame,names=[])=>names.map(name=>playTransition(frame.node,name)).filter(Boolean);
        const incoming=play(next,change.next);
        if(incoming.length) {
          if(change.wipe)node.classList?.add('is-wiping');
          animations.push(...incoming,...(previous.id?play(previous,change.previous):[]));
          play(next,change.settle);
          if(change.lead!=null)setTimeout(()=>answerEarly(true),change.lead);
        }
      }
      let finished=false;
      const finish=()=>{
        if(finished)return;finished=true;
        if(previous)release(previous);
        animations.forEach(animation=>animation.cancel());
        node.classList?.remove('is-wiping');
        reader.classList.toggle('has-background',Boolean(id));onCgChange(kind==='cg');
        if(transition?.finish===finish)transition=null;
      };
      transition={finish};
      try{await Promise.all(animations.map(animation=>animation.finished));}catch{/* Superseded navigation settles the previous frame. */}
      finish();return true;
    })().finally(()=>{if(pending?.promise===promise)pending=null;});
    // A title may follow a long change before it is done: callers are answered after its lead.
    const answer=Promise.race([promise,early]);
    pending={key,promise,answer};
    return answer;
  }
  return {show,reset};
}
