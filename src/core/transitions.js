import {readRecord} from './text-record.js';
import {scriptLines} from './script-text.js';

// A comment record marks a boundary, without inserting a fake body unit.
// A batch-ending record is resolved when later accepted batches are merged.
export function readTransitions(text, story) {
  const records = [];
  for (const {text:line,line:lineNo,literal} of scriptLines(text)) {
    if(literal)continue;
    const i=lineNo-1;
    if (!line.trim().startsWith('// @vn-transition')) continue;
    const record = readRecord(line.trim().slice(3), 0, ['source'], ['source']);
    if (record.command !== '@vn-transition' || record.pos.length
      || !/^[A-Za-z][A-Za-z0-9_-]*(?:,[A-Za-z][A-Za-z0-9_-]*)*$/.test(record.attrs.source))
      throw new Error(`第 ${i + 1} 行：过渡记录格式无效。`);
    const source = record.attrs.source.split(',');
    if (new Set(source).size !== source.length) throw new Error(`第 ${i + 1} 行：过渡来源重复。`);
    const next = story.units.find(u => u.line > i + 1);
    if (next && next.block.index !== story.units.indexOf(next))
      throw new Error(`第 ${i + 1} 行：过渡之后须建立新的内容块。`);
    if (next && records.some(r => r.beforeBlock === next.block.id))
      throw new Error(`第 ${i + 1} 行：同一内容块的过渡重复。`);
    const previous = next ? story.units[next.block.index - 1] : story.units.at(-1);
    records.push({source, line:i + 1, beforeBlock:next?.block.id ?? null,
      chapterId:previous?.chapter.id ?? next?.chapter.id ?? null});
  }
  return records;
}
