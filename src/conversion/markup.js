// A small tolerant XML/XHTML reader for EPUB input. It builds an element tree only;
// nothing is rendered or executed. Unknown entities stay as written.
const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ensp:' ',emsp:' ',thinsp:' ',
  mdash:'—',ndash:'–',hellip:'…',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',middot:'·',bull:'•',copy:'©',reg:'®',times:'×'};
const VOID=new Set(['br','img','hr','meta','link','input','col','area','base','wbr','source']);

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi,(match,name)=>{
    if(name[0]!=='#')return ENTITIES[name]??match;
    const code=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1));
    return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):match;
  });
}

// Local names drop namespace prefixes (svg:image → image, epub:type stays as an attribute name).
const local=name=>name.slice(name.indexOf(':')+1).toLowerCase();
function attributes(text) {
  const attrs={};
  for(const m of text.matchAll(/([^\s=/>]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
    attrs[m[1].toLowerCase()]=decodeEntities(m[2]??m[3]??m[4]??'');
  return attrs;
}

export function parseMarkup(text) {
  const root={name:'#root',attrs:{},children:[]},stack=[root];
  let pos=0;
  const top=()=>stack[stack.length-1];
  const addText=value=>{if(value)top().children.push(decodeEntities(value));};
  while(pos<text.length) {
    const lt=text.indexOf('<',pos);
    if(lt<0){addText(text.slice(pos));break;}
    addText(text.slice(pos,lt));
    if(text.startsWith('<!--',lt)){const end=text.indexOf('-->',lt+4);pos=end<0?text.length:end+3;continue;}
    if(text.startsWith('<![CDATA[',lt)) {
      const end=text.indexOf(']]>',lt+9),value=text.slice(lt+9,end<0?text.length:end);
      if(value)top().children.push(value);
      pos=end<0?text.length:end+3;continue;
    }
    if(text[lt+1]==='?'||text[lt+1]==='!'){const end=text.indexOf('>',lt);pos=end<0?text.length:end+1;continue;}
    const m=/^<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/.exec(text.slice(lt,lt+65536));
    if(!m){addText('<');pos=lt+1;continue;}
    pos=lt+m[0].length;
    const name=local(m[2]);
    if(m[1]) {
      // A stray closing tag is ignored; an earlier unclosed element is closed with its parent.
      const at=stack.findLastIndex(node=>node.name===name);
      if(at>0)stack.length=at;
      continue;
    }
    const raw=m[3].replace(/\/\s*$/,''),node={name,attrs:attributes(raw),children:[]};
    top().children.push(node);
    if(/\/\s*$/.test(m[3])||VOID.has(name))continue;
    if(name==='script'||name==='style') {
      // Raw text elements may contain "<"; skip to the closing tag without parsing it.
      const end=text.toLowerCase().indexOf(`</${m[2].toLowerCase()}`,pos);
      pos=end<0?text.length:text.indexOf('>',end)+1||text.length;continue;
    }
    stack.push(node);
  }
  return root;
}

export function* elements(node,name) {
  for(const child of node.children) {
    if(typeof child==='string')continue;
    if(!name||child.name===name)yield child;
    yield* elements(child,name);
  }
}
export const first=(node,name)=>elements(node,name).next().value??null;
export function textContent(node) {
  return node.children.map(child=>typeof child==='string'?child:textContent(child)).join('');
}
// Attribute lookup ignores namespace prefixes (xlink:href, epub:type).
export function attr(node,name) {
  if(Object.hasOwn(node.attrs,name))return node.attrs[name];
  const key=Object.keys(node.attrs).find(k=>local(k)===name);
  return key===undefined?undefined:node.attrs[key];
}
