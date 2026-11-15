import {playTransition} from '../reader/transitions.js';

// Keep the previous decoded image visible until its replacement is ready.
/* Each layer is marked tall or wide (by the picture's own proportions) and CG or scene; the stylesheet shows it to
 * fill the screen or whole over a blurred copy depending on the screen's orientation. A tall picture shown now marks
 * the reader, so narrow screens can let it run behind the text. */
export function createBackgroundView({root,reader,onCgChange=()=>{}}) {
  let current=null,pending=null,version=0,transition=null;
  const release=frame=>frame.node.remove();
  const mark=frame=>{frame.node.className=`reader-background-layer${frame.tall?' is-tall':''}${frame.kind==='cg'?' is-cg':''}`;};
  const markReader=()=>reader.classList.toggle('tall-picture',Boolean(current?.tall&&current.id));
  function reset() {
    version++;pending=null;transition?.finish();
    if(current)release(current);current=null;
    reader.classList.remove('has-background');reader.classList.remove('tall-picture');onCgChange(false);
  }
  // src is the image's address on the shelf; null shows no image.
  function show({id,src,kind,locationId=null,animate=false}) {
    const key=`${id}:${kind}:${locationId}`;
    if(pending?.key===key)return pending.promise;
    if(!pending&&current?.id===id){transition?.finish();current.kind=kind;current.locationId=locationId;mark(current);onCgChange(kind==='cg');return Promise.resolve(true);}
    const token=++version;
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
      if(current?.id===id){current.kind=kind;current.locationId=locationId;mark(current);onCgChange(kind==='cg');return;}
      const node=document.createElement('div');
      if(url)node.style.backgroundImage=`url("${url}")`;
      const next={id,kind,locationId,node,tall},previous=current;
      mark(next);root.append(node);current=next;markReader();onCgChange(kind==='cg'||previous?.kind==='cg');
      reader.classList.toggle('has-background',Boolean(id||previous?.id));
      const animations=[];
      if(animate&&previous) {
        const slide=previous.id&&id&&previous.kind==='location'&&kind==='location'&&(!locationId||!previous.locationId||locationId!==previous.locationId);
        const animation=playTransition(node,slide?'backgroundSlide':'backgroundFade');
        if(animation)animations.push(animation);
      }
      let finished=false;
      const finish=()=>{
        if(finished)return;finished=true;
        if(previous)release(previous);
        animations.forEach(animation=>animation.cancel());
        reader.classList.toggle('has-background',Boolean(id));onCgChange(kind==='cg');
        if(transition?.finish===finish)transition=null;
      };
      transition={finish};
      try{await Promise.all(animations.map(animation=>animation.finished));}catch{/* Superseded navigation settles the previous frame. */}
      finish();return true;
    })().finally(()=>{if(pending?.promise===promise)pending=null;});
    pending={key,promise};return promise;
  }
  return {show,reset};
}
