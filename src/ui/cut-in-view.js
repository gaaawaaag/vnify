// The close-up keeps a fixed place and size; the reading card may cover it. Clicks on the picture go on to the story;
// round buttons beside it open the full image or collapse it, and a collapsed close-up stays so until another appears.
// onChange hears when the close-up comes into view or leaves it.
export function createCutInView({root,image,reader,controls=null,onChange=()=>{}}) {
  const {open,collapse,expand,viewer,viewerImage}=controls??{};
  let current=null,url=null,revision=0,collapsed=false,decoded=false,shown=false;
  const toggle=(list,name,on)=>on?list.add(name):list.remove(name);
  function sync(){
    root.hidden=!decoded;toggle(reader.classList,'cut-in-active',decoded&&!collapsed);
    if(shown!==(decoded&&!collapsed)){shown=!shown;onChange(shown);}
    if(!controls)return;
    toggle(root.classList,'collapsed',collapsed);
    open.hidden=collapse.hidden=collapsed;expand.hidden=!collapsed;
  }
  function reset(){
    revision++;current=null;decoded=false;collapsed=false;sync();
    if(viewer?.open)viewer.close();
    image.removeAttribute('src');viewerImage?.removeAttribute('src');url=null;
  }
  async function show(value){
    if(!value){reset();return;}
    if(current===value.id)return;
    reset();current=value.id;const token=revision;
    url=value.src;image.src=url;
    try{
      await image.decode();
      if(token===revision){decoded=true;sync();}
    }catch{if(token===revision)reset();}
  }
  if(controls) {
    // Stage clicks advance the story; these controls must not.
    const act=handler=>event=>{event.stopPropagation();handler();};
    open.onclick=act(()=>{viewerImage.src=url;viewer.showModal();});
    collapse.onclick=act(()=>{collapsed=true;sync();expand.focus();});
    expand.onclick=act(()=>{collapsed=false;sync();open.focus();});
    viewer.onclick=()=>viewer.close();
  }
  return {show,reset,get visible(){return shown;}};
}
