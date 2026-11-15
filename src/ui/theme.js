// Synchronous head bootstrap. Theme stylesheets are scoped by html[data-theme]; a loaded sheet stays,
// so moving between a book's theme (while reading) and the default (home, workbench) is an attribute change.
(() => {
  const registry=globalThis.VN_THEME_REGISTRY,root=document.documentElement,key='vn-appearance',fallback=registry[0];
  const normalize=value=>registry.find(theme=>theme.id===value)||fallback;
  const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'null')||{};}catch{return {};}};
  const write=patch=>{try{localStorage.setItem(key,JSON.stringify({...read(),...patch}));}catch{}};
  const sheets=new Map();
  // Registry paths are relative to the app root; resolved from this script so they follow the server's v/<build>/ links.
  const appRoot=document.currentScript?.src?new URL('../../',document.currentScript.src).href:document.baseURI;
  // url() inside a custom property resolves against the stylesheet that uses the variable, so theme
  // assets written relative to the theme folder are made absolute before the CSS is applied.
  const URL_PATTERN=new RegExp('url\\(\\s*(["\']?)([^"\')]+)\\1\\s*\\)','g');
  const absolute=(css,base)=>css.replace(URL_PATTERN,
    (match,quote,target)=>/^(?:[a-z][\w+.-]*:|\/)/i.test(target.trim())?match:`url("${new URL(target.trim(),base).href}")`);
  function load(value) {
    const theme=normalize(value);
    const url=new URL(theme.stylesheet,appRoot).href;
    if(!sheets.has(theme.id))sheets.set(theme.id,fetch(url).then(response=>{
      if(!response.ok)return false;
      return response.text().then(css=>{
        const style=document.createElement('style');style.dataset.vnTheme=theme.id;
        style.textContent=absolute(css,url);
        document.head.append(style);return true;
      });
    }).catch(()=>false));
    return sheets.get(theme.id).then(ok=>ok?theme.id:fallback.id);
  }
  // Theme icons: a theme's registry `icons` names an SVG of <symbol>s whose ids match the page's icon sprite
  // (i-hide, i-history…). They replace those symbols while the theme is active. Only drawing elements are kept;
  // scripts, event attributes, styles and links leaving the theme folder are dropped.
  const SVG='http://www.w3.org/2000/svg';
  const DRAWING=new Set(['g','path','circle','ellipse','rect','line','polyline','polygon','image','defs','lineargradient',
    'radialgradient','stop','clippath','mask','use','title']);
  const iconSets=new Map(),defaults=new Map();
  function clean(node,base) {
    for(const child of [...node.children]) {
      if(!DRAWING.has(child.localName.toLowerCase())){child.remove();continue;}
      for(const attribute of [...child.attributes]) {
        const name=attribute.name.toLowerCase(),value=attribute.value.trim();
        if(name.startsWith('on')||name==='style'){child.removeAttribute(attribute.name);continue;}
        if(name==='href'||name==='xlink:href') {
          if(child.localName==='image'&&!/^(?:[a-z][\w+.-]*:|\/|\\)/i.test(value)&&new URL(value,base).href.startsWith(base))
            child.setAttribute(attribute.name,new URL(value,base).href);
          else if(!value.startsWith('#'))child.removeAttribute(attribute.name);
        } else if(/url\(/i.test(value)&&!/^url\(\s*#[^)]*\)$/i.test(value))child.removeAttribute(attribute.name);
      }
      clean(child,base);
    }
    return node;
  }
  function loadIcons(theme) {
    if(!theme.icons)return Promise.resolve(new Map());
    if(!iconSets.has(theme.id)) {
      const url=new URL(theme.icons,appRoot).href,base=new URL('./',url).href;
      iconSets.set(theme.id,fetch(url).then(response=>response.ok?response.text():'').then(text=>{
        const doc=new DOMParser().parseFromString(text,'image/svg+xml'),icons=new Map();
        for(const symbol of doc.querySelectorAll('symbol[id]')) {
          const copy=document.createElementNS(SVG,'symbol');
          for(const name of ['id','viewBox','preserveAspectRatio'])if(symbol.hasAttribute(name))copy.setAttribute(name,symbol.getAttribute(name));
          copy.append(...[...symbol.childNodes].map(node=>document.importNode(node,true)));
          icons.set(symbol.id,clean(copy,base));
        }
        return icons;
      }).catch(()=>new Map()));
    }
    return iconSets.get(theme.id);
  }
  const ready=new Promise(resolve=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',resolve,{once:true}):resolve());
  function applyIcons(id) {
    return Promise.all([loadIcons(normalize(id)),ready]).then(([icons])=>{
      if(active!==id)return;
      for(const [name,symbol] of defaults)document.getElementById(name)?.replaceWith(symbol.cloneNode(true));
      for(const [name,symbol] of icons) {
        const current=document.querySelector(`svg.icon-sprite > symbol#${CSS.escape(name)}`);
        if(!current)continue;
        if(!defaults.has(name))defaults.set(name,current.cloneNode(true));
        current.replaceWith(symbol.cloneNode(true));
      }
    });
  }
  let active=fallback.id,request=0;
  function activate(value) {
    const token=++request;
    return load(value).then(id=>{
      if(token!==request||active===id)return active;
      active=root.dataset.theme=id;void applyIcons(id);window.dispatchEvent(new Event('vn-theme-change'));
      return id;
    });
  }
  const global=()=>normalize(read().theme).id;
  const bookThemes=()=>{const value=read().bookThemes;return value&&typeof value==='object'&&!Array.isArray(value)?value:{};};
  globalThis.VNTheme=Object.freeze({
    themes:registry,
    global,
    // A book follows the global choice unless this browser remembers one for it.
    book:bookId=>registry.some(theme=>theme.id===bookThemes()[bookId])?bookThemes()[bookId]:null,
    preferred(bookId){return this.book(bookId)??global();},
    setGlobal(value){const id=normalize(value).id;write({theme:id});return id;},
    setBook(bookId,value) {
      const next={...bookThemes()};
      if(value&&registry.some(theme=>theme.id===value))next[bookId]=value;else delete next[bookId];
      write({bookThemes:next});
    },
    activate,
    activateDefault:()=>activate(fallback.id),
    get active(){return active;},
    absolute,
  });
  root.dataset.theme=fallback.id;
  void load(fallback.id).then(()=>window.dispatchEvent(new Event('vn-theme-change')));
  window.addEventListener('storage',event=>{if(event.key===key||event.key===null)window.dispatchEvent(new Event('vn-theme-preferences'));});
  try{localStorage.removeItem('vn-theme');}catch{}
})();
