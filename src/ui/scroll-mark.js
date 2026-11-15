/* Scrollers show a hairline with a small dot instead of the native scrollbar; the part already scrolled past is drawn
 * brighter. The mark sits beside the scroller in its parent, so it does not scroll with the content, and it hides when
 * there is nothing to scroll. Colours: --scroll-track and --scroll-mark (tokens.css). */
const INSET=8;

export function attachScrollMark(scroller) {
  const parent=scroller.parentElement;
  if(getComputedStyle(parent).position==='static')parent.style.position='relative';
  const track=document.createElement('span');
  track.className='scroll-mark';track.setAttribute('aria-hidden','true');track.hidden=true;
  track.append(Object.assign(document.createElement('i'),{className:'scroll-mark-read'}),
    Object.assign(document.createElement('i'),{className:'scroll-mark-dot'}));
  parent.append(track);
  scroller.style.scrollbarWidth='none';scroller.classList.add('has-scroll-mark');
  function update() {
    const room=scroller.scrollHeight-scroller.clientHeight;
    track.hidden=room<=1||!scroller.clientHeight;
    if(track.hidden)return;
    track.style.top=`${scroller.offsetTop+INSET}px`;
    track.style.height=`${scroller.clientHeight-INSET*2}px`;
    track.style.left=`${scroller.offsetLeft+scroller.offsetWidth-6}px`;
    track.style.setProperty('--scroll-ratio',String(Math.min(1,Math.max(0,scroller.scrollTop/room))));
  }
  scroller.addEventListener('scroll',update,{passive:true});
  // Late images and new content change the height without resizing the scroller itself.
  scroller.addEventListener('load',update,true);
  if(typeof ResizeObserver==='function')new ResizeObserver(update).observe(scroller);
  new MutationObserver(update).observe(scroller,{childList:true,subtree:true,characterData:true});
  window.addEventListener('resize',update);
  update();
  return {update};
}
