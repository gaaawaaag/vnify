import {t} from '../reader/player-text.js';
import {creditSections} from '../reader/credits.js';

/* The credits panel (docs/dev/audio.md): opened from the reading menu or the end card, it covers the stage like the
 * glossary and appendix. Sections on the left, their entries on the right; empty sections are left out. Text is set
 * as plain text; links open in a new tab. */
const LABELS={original:'原作',notice:'说明',images:'图像',music:'音乐',sounds:'音效',voices:'语音',made:'制作'};

export function createCreditsPanel({dialog,getBook,onOpen=()=>{},onClose=()=>{}}) {
  const list=dialog.querySelector('.credits-list');
  function render() {
    const book=getBook();
    list.replaceChildren();
    if(!book)return;
    for(const section of creditSections(book.story,book.credits,book.audio,{book:title=>t('《{title}》',{title})})) {
      const heading=document.createElement('h3');heading.textContent=t(LABELS[section.key]);
      const body=document.createElement('ul');body.className=`credits-items credits-${section.key}`;
      for(const item of section.items) {
        const row=document.createElement('li'),name=document.createElement('span');
        name.className='credits-name';name.textContent=item.text;row.append(name);
        if(item.meta){const meta=document.createElement('span');meta.className='credits-meta';meta.textContent=item.meta;row.append(meta);}
        if(item.url&&/^https?:\/\//.test(item.url)) {
          const link=document.createElement('a');link.className='credits-link';link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';
          link.textContent=t('链接');row.append(link);
        }
        body.append(row);
      }
      list.append(heading,body);
    }
  }
  dialog.querySelector('.reference-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{document.body.classList.remove('stage-panel-open');onClose();});
  return {
    // Whether the open book has anything to credit (vnify. counts unless the work turned it off).
    has:()=>{const book=getBook();return Boolean(book&&creditSections(book.story,book.credits,book.audio,{book:x=>x}).length);},
    open() {
      onOpen();render();document.body.classList.add('stage-panel-open');
      dialog.showModal();list.scrollTop=0;
    },
  };
}
