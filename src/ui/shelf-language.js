// The shelf's interface language, chosen from the globe menu in the home header and kept in this browser. An open
// work shows the player in its own language (src/ui/app.js); back on the shelf, this choice applies again.
const KEY='vn-shelf-language';

/** @typedef {'zh'|'zh-Hant'|'en'|'ja'} ShelfLanguage */
/** @param {string|null|undefined} value @returns {ShelfLanguage} */
const shelfLanguage=value=>value==='en'||value==='ja'||value==='zh-Hant'?value:'zh';

/** @param {{getItem(key:string):string|null}} [storage] @returns {ShelfLanguage} */
export function readShelfLanguage(storage=globalThis.localStorage) {
  try {return shelfLanguage(storage.getItem(KEY));} catch {return 'zh';}
}

/** @param {{onChange:(lang:ShelfLanguage)=>void}} options */
export function createLanguageMenu({onChange}) {
  const button=/** @type {HTMLElement} */(document.getElementById('home-language'));
  const menu=/** @type {HTMLElement} */(document.getElementById('home-language-menu'));
  let lang=readShelfLanguage();
  const sync=()=>{for(const item of menu.querySelectorAll('[data-lang]'))item.setAttribute('aria-checked',String(/** @type {HTMLElement} */(item).dataset.lang===lang));};
  function close() {menu.hidden=true;button.setAttribute('aria-expanded','false');}
  button.onclick=()=>{const opens=menu.hidden;menu.hidden=!opens;button.setAttribute('aria-expanded',String(opens));};
  document.addEventListener('click',event=>{
    const target=/** @type {Node} */(event.target);
    if(!menu.hidden&&!menu.contains(target)&&!button.contains(target))close();
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){close();button.focus();}});
  for(const item of menu.querySelectorAll('[data-lang]'))/** @type {HTMLElement} */(item).onclick=()=>{
    lang=shelfLanguage(/** @type {HTMLElement} */(item).dataset.lang);
    try {localStorage.setItem(KEY,lang);} catch {}
    sync();close();onChange(lang);
  };
  sync();
  return {get language(){return lang;}};
}
