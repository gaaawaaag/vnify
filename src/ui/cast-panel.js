import {t} from '../reader/player-text.js';
import {groupCharacters} from '../reader/character-data.js';
import {createAvatarView} from './avatar-view.js';

function element(tag,className,text='') {
  const node=document.createElement(tag);node.className=className;node.textContent=text;return node;
}
// World terms have their own panel (reference-panel.js), opened from the reading menu.
export function createCastPanel({getCharacters,getAvatar=()=>null,colorFor,onOpen,onClose}) {
  const dialog=document.getElementById('cast-dialog'),body=document.getElementById('cast-body');
  const back=document.getElementById('cast-back'),title=document.getElementById('cast-title');
  let selected=null;
  function avatarView(id) {
    const avatar=getAvatar(id);
    return avatar?createAvatarView(avatar,avatar.image.src):null;
  }
  function render() {
    const characters=getCharacters(),person=characters.find(c=>c.id===selected);
    body.replaceChildren();back.hidden=!person;title.textContent=t(person?'人物资料':'演员表');
    if(!person) {
      selected=null;
      if(!characters.length)body.append(element('p','cast-empty',t('故事尚未介绍人物。')));
      const groups=groupCharacters(characters),hasGroups=groups.some(g=>g.name);
      for(const group of groups) {
        const section=element('section','cast-group');
        if(hasGroups)section.append(element('h3','cast-group-title',group.name||t('其他人物')));
        const list=element('div','cast-grid');
        for(const c of group.people) {
          const button=element('button','cast-person');button.type='button';button.dataset.character=c.id;button.style.setProperty('--person-color',colorFor(c.id));
          // Every card keeps the same figure area; without a picture it shows the name's first character.
          const figure=element('span','cast-figure'),avatar=avatarView(c.id);
          if(avatar)figure.append(avatar);
          else {const initial=element('span','cast-initial',[...c.label][0]??'');initial.setAttribute('aria-hidden','true');figure.append(initial);}
          const copy=element('span','cast-person-copy');copy.append(element('strong','',c.label),element('span','',c.summary||'？？？'));
          button.append(figure,copy);
          button.onclick=()=>{selected=c.id;render();back.focus();};list.append(button);
        }
        section.append(list);body.append(section);
      }
    } else {
      const profile=element('div','character-profile');profile.dataset.character=person.id;profile.style.setProperty('--person-color',colorFor(person.id));
      // The picture the reader has reached; without one, the name's first character.
      const portrait=element('div','character-portrait'),picture=element('div','character-picture'),avatar=avatarView(person.id);
      if(avatar)picture.append(avatar);
      else {const initial=element('span','cast-initial',[...person.label][0]??'');initial.setAttribute('aria-hidden','true');picture.append(initial);}
      portrait.append(picture);
      const information=element('div','character-information');
      information.append(element('h3','character-name',person.label));
      if(person.fullName && person.fullName!==person.label)information.append(element('p','character-full-name',t('全名 · {name}',{name:person.fullName})));
      information.append(element('p','character-summary',person.summary||'？？？'));
      const details=person.detailEntries || person.entries.map(text=>({text,category:''}));
      for(const [category,label] of [['alias',t('称呼')],['relation',t('关系')],['background',t('背景')],['',t('资料')]]) {
        const rows=details.filter(e=>e.category===category);if(!rows.length)continue;
        const section=element('section','character-section');section.append(element('h4','character-section-title',label));
        const entries=element('ul','character-entries');
        for(const row of rows) {
          const item=element('li','');
          const target=characters.find(c=>c.id===row.target);
          if(target) {
            const link=element('button','character-relation-link',target.label);link.type='button';link.dataset.character=target.id;
            link.style.setProperty('--person-color',colorFor(target.id));
            link.onclick=()=>{selected=target.id;render();back.focus();};
            item.className='has-relation';item.append(link,element('span','',row.text));
          } else item.textContent=row.text;
          entries.append(item);
        }
        section.append(entries);information.append(section);
      }
      if(person.appearance){
        const facts=element('details','character-appearance');facts.append(element('summary','','外观参考'),element('p','',person.appearance));information.append(facts);
      }
      profile.append(portrait,information);body.append(profile);
    }
    body.scrollTop=0;
  }
  function open(id=null) {
    if(id && !getCharacters().some(c=>c.id===id))return;
    selected=id;
    if(!dialog.open){onOpen();document.body.classList.add('cast-open');render();dialog.showModal();}
    else render();
  }
  back.onclick=()=>{selected=null;render();body.querySelector('button')?.focus();};
  document.getElementById('cast-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{document.body.classList.remove('cast-open');body.replaceChildren();onClose();});
  function refresh() {
    if(!dialog.open)return;
    const scroll=body.scrollTop,personFocus=document.activeElement?.dataset.character;
    render();body.scrollTop=scroll;
    if(personFocus)[...body.querySelectorAll('.cast-person,.character-relation-link')].find(node=>node.dataset.character===personFocus)?.focus({preventScroll:true});
  }
  return {open,refresh};
}
