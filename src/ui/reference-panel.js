import {t} from '../reader/player-text.js';
/* A full-stage panel of entries (world terms, Extra pieces): the list on the left, the chosen entry on the right, like
 * the gallery. Narrow screens either stack them, the chosen entry above the list ('stack'), or show the list alone and
 * open an entry over it with a back button ('drill'). Text is set as plain text only. Opening never moves the story.
 *
 * entries() → [{id,title,summary?,search?}]; detail(entry) → nodes for the right side. */
export function createReferencePanel({dialog,entries,detail,count=()=>'',empty='',onOpen=()=>{},onClose=()=>{}}) {
  const part=name=>dialog.querySelector(`.reference-${name}`);
  const list=part('entries'),view=part('detail'),filter=part('filter'),back=part('back');
  let items=[],chosen=null;
  const element=(tag,className,text)=>Object.assign(document.createElement(tag),className?{className}:{},text!==undefined?{textContent:text}:{});

  function showDetail() {
    const entry=items.find(item=>item.id===chosen);
    view.replaceChildren(...(entry?detail(entry):[]));view.scrollTop=0;
  }
  function renderList() {
    const query=filter?.value.trim()??'';
    const shown=query?items.filter(item=>[item.title,item.summary??'',item.search??''].some(text=>text.includes(query))):items;
    list.replaceChildren(...shown.map(item=>{
      const button=element('button','reference-entry');button.type='button';button.setAttribute('role','listitem');
      button.append(element('span','reference-entry-title',item.title));
      if(item.summary)button.append(element('small','',item.summary));
      button.setAttribute('aria-current',String(item.id===chosen));
      button.onclick=()=>{
        chosen=item.id;
        for(const other of list.children)other.setAttribute('aria-current',String(other===button));
        showDetail();dialog.classList.add('is-reading');
        if(dialog.dataset.narrow==='drill'&&matchMedia('(max-width:600px)').matches)back.focus();
      };
      return button;
    }));
    if(!shown.length)list.append(element('p','reference-empty',query?t('没有找到'):typeof empty==='function'?empty():empty));
  }
  function open() {
    items=entries();
    if(!items.some(item=>item.id===chosen))chosen=items[0]?.id??null;
    if(filter)filter.value='';
    dialog.classList.remove('is-reading');
    part('count').textContent=count(items);
    onOpen();document.body.classList.add('stage-panel-open');
    renderList();showDetail();dialog.showModal();list.scrollTop=0;
  }
  if(filter)filter.oninput=renderList;
  back.onclick=()=>{dialog.classList.remove('is-reading');list.querySelector('[aria-current="true"]')?.focus();};
  part('close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{
    document.body.classList.remove('stage-panel-open');list.replaceChildren();view.replaceChildren();onClose();
  });
  return {open,get isOpen(){return dialog.open;}};
}
