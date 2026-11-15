import {emptyExtra,hasExtra,validateExtra,illustrationRanges,activeIllustration} from '../core/extra.js';
import {createReferencePanel} from './reference-panel.js';

function element(tag,className,text='') {
  const node=document.createElement(tag);if(className)node.className=className;node.textContent=text;return node;
}
// Extra is not part of the reading flow: opening it never moves or discloses the story position. Its pieces show in the
// appendix panel, titles on the left and the chosen piece on the right; the original book's pictures are in the gallery.
export function createExtraPanel({onOpen=()=>{},onClose=()=>{},onChange=()=>{}}) {
  const $=id=>document.getElementById(id);
  let bookId=null,extra=emptyExtra();
  let ranges={story:null,complete:true,value:[]};
  const panel=createReferencePanel({dialog:$('appendix-dialog'),onOpen,onClose,
    entries:()=>extra.items.map((item,i)=>({id:String(i),title:item.title,search:item.paragraphs.join('')})),
    detail:entry=>{
      const item=extra.items[Number(entry.id)],article=element('article','reference-article');
      for(const text of item.paragraphs)article.append(element('p','',text));
      return [element('h3','reference-title',item.title),article];
    }});
  const listed=()=>extra.items.length>0;
  function sync(){ranges={story:null,complete:true,value:[]};$('open-extra').hidden=!listed();onChange();}
  // The book's Extra as the shelf holds it, its images given by address.
  function setBook(id,next) {
    bookId=id;
    try{extra=next?validateExtra(next):emptyExtra();}catch{extra=emptyExtra();}
    sync();
  }
  // Original-book illustrations are positioned by source; the ranges follow the current story.
  function illustration(story,index,complete=true) {
    if(!story||story.book.id!==bookId||!extra.illustrations.length)return null;
    if(ranges.story!==story||ranges.complete!==complete)ranges={story,complete,value:illustrationRanges(story,extra,complete)};
    const id=activeIllustration(ranges.value,index);
    return id?{id:`book:${id}`,src:extra.images[id].src}:null;
  }
  const cover=id=>id===bookId&&extra.cover?extra.images[extra.cover].src:null;
  $('open-extra').onclick=()=>{if(listed())panel.open();};
  return {setBook,illustration,cover,has:()=>hasExtra(extra),current:()=>bookId?{bookId,extra}:null};
}
