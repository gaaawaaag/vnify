import {scriptLines} from '../core/script-text.js';
import {readRecord} from '../core/text-record.js';

// Read protocol references, including links inside literal documents. Ordinary
// names, comment examples and strings in directive attributes are not references.
export function completeEntityDeclarations(text,registry=[]) {
  const lines=scriptLines(text),declared=new Set(),used=new Set();
  const chapter=lines.findIndex(l=>!l.literal&&/^\s*@chapter\s/.test(l.text));
  if(chapter<0)return text;
  for(const {text:line,literal} of lines) {
    const trimmed=line.trim();
    if(!literal) {
      if(trimmed.startsWith('//'))continue;
      const declaration=/^@(character|location)\s+(\S+)/.exec(trimmed);
      if(declaration){declared.add(declaration[2]);continue;}
      if(trimmed.startsWith('@')) {
        const owner=/^@(reveal|profile)\s+(\S+)/.exec(trimmed);
        if(owner)used.add(owner[2]);
        if(/^@scene\s/.test(trimmed)) {
          try {const {attrs}=readRecord(trimmed,1,['loc','time','pov','effect','title']);for(const key of ['loc','pov'])if(attrs[key])used.add(attrs[key]);}
          catch {/* The normal parser reports malformed attributes without repairing them. */}
        }
        continue;
      }
      const speaker=/^\[([A-Za-z][A-Za-z0-9_-]*)(?:\||\])/.exec(trimmed);
      if(speaker&&speaker[1]!=='guest')used.add(speaker[1]);
    }
    for(const match of line.matchAll(/\\\{\{|\{\{([A-Za-z][A-Za-z0-9_-]*)\|[^{}]*\}\}/g))if(match[1])used.add(match[1]);
  }
  const headers=[];
  for(const e of registry)if(used.has(e.id)&&!declared.has(e.id)) {
    headers.push(`@${e.kind} ${e.id} label=${JSON.stringify(e.label)}${e.kind==='character'&&e.color?` color=${JSON.stringify(e.color)}`:''}`);
    declared.add(e.id);
  }
  if(!headers.length)return text;
  const profile=lines.findIndex(l=>!l.literal&&/^\s*@profile\s/.test(l.text));
  const output=lines.map(l=>l.text);output.splice(profile>=0?Math.min(chapter,profile):chapter,0,...headers);
  return output.join('\n');
}

