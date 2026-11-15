/* The reading menu opens from its button and stays open until closed: by the button, Escape, choosing an item, or a
 * click elsewhere on the page (which then does not advance the text). The place, save state and menu button stay on
 * screen; the title card and the menu items show only while it is open. Nothing here changes the reading area's size. */
export function createReaderChrome({reader,welcome,header,onClose=()=>{}}) {
  const top=reader.querySelector('.reader-top'),bottom=reader.querySelector('.reader-bottom'),button=reader.querySelector('#reader-menu');
  let active=false;
  const isOpen=()=>!reader.classList.contains('chrome-hidden');
  function set(open) {
    reader.classList.toggle('chrome-hidden',!open);
    button.setAttribute('aria-expanded',String(open));
    if(!open)onClose();
  }
  function sync() {
    header.hidden=welcome.hidden;
    const next=!reader.hidden;
    if(next!==active){active=next;set(false);}
  }
  button.addEventListener('click',event=>{event.stopPropagation();set(!isOpen());});
  reader.addEventListener('click',event=>{
    if(!isOpen()||top.contains(event.target)||bottom.contains(event.target))return;
    event.stopPropagation();set(false);
  },true);
  reader.querySelector('#reader-menu-list').addEventListener('click',event=>{if(event.target.closest('button'))set(false);});
  document.addEventListener('keydown',event=>{
    if(!active||!isOpen()||event.key!=='Escape'||document.querySelector('dialog[open]'))return;
    event.preventDefault();set(false);button.focus();
  });
  new MutationObserver(sync).observe(reader,{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(sync).observe(welcome,{attributes:true,attributeFilter:['hidden']});
  const resize=new ResizeObserver(()=>{
    reader.style.setProperty('--reader-top-height',top.offsetHeight+'px');
    reader.style.setProperty('--reader-bottom-height',bottom.offsetHeight+'px');
  });[top,bottom].forEach(bar=>resize.observe(bar));
  sync();
  return {open:()=>set(true),close:()=>set(false),isOpen};
}
