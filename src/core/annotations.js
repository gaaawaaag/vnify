import {scriptLines} from './script-text.js';

const idPattern=/^[A-Za-z][A-Za-z0-9_-]*$/;
// JSON comment records keep multiline note text out of the playback sequence.
export function readAnnotations(input,fail) {
  const notes=new Map();
  for(const {text,line,literal} of scriptLines(input)) {
    if(literal || !/^\/\/\s*@vn-note\b/.test(text.trim()))continue;
    let note;
    try {note=JSON.parse(text.trim().replace(/^\/\/\s*@vn-note\s*/,''));}
    catch {fail('注解记录须为 // @vn-note 后接 JSON 对象',line);}
    if(!note || typeof note.id!=='string' || !idPattern.test(note.id) || note.id==='none' || typeof note.text!=='string' || !note.text.trim() || !Array.isArray(note.source) || !note.source.length || note.source.some(id=>typeof id!=='string'||!idPattern.test(id)||id==='none') || new Set(note.source).size!==note.source.length || Object.keys(note).some(key=>!['id','text','source'].includes(key)))fail('注解须包含有效 id、非空 text 和不重复的 source 来源数组',line);
    if(notes.has(note.id))fail(`重复注解 ID：${note.id}`,line);
    notes.set(note.id,{id:note.id,text:note.text,source:[...note.source]});
  }
  return notes;
}
