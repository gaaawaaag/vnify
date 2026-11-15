export function normalizeScript(text) { return text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'); }

// Protocol scanners must leave literal document bodies untouched, including
// lines that resemble metadata, comments or chapter declarations.
export function scriptLines(text) {
  let document=false,literal=false;
  const current=normalizeScript(text);
  return current.split('\n').map((text,index)=>{
    const trimmed=text.trim(),body=literal&&trimmed!=='@enddocument';
    if(literal&&trimmed==='@enddocument'){literal=false;document=false;}
    else if(!literal&&/^@document\s/.test(trimmed))document=true;
    else if(!literal&&document&&trimmed==='@text')literal=true;
    return {text,line:index+1,literal:body};
  });
}
