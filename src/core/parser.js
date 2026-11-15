/** @import {Story} from '../types/story.js' */
import { isColor } from './colors.js';
import {DEFAULT_LANGUAGE, isBookLanguage, BOOK_LANGUAGES} from './language.js';
import {readAnnotations} from './annotations.js';
import {readTransitions} from './transitions.js';
// Compact authoring format -> immutable per-unit playback state. No code evaluation.
export class ScriptError extends Error {
  constructor(message, line, block) {
    super(`第 ${line} 行${block ? ` · ${block}` : ''}：${message}`);
    this.name = 'ScriptError'; this.line = line; this.block = block;
  }
}
const idPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const BLOCK_KINDS = ['scene', 'narration', 'document'];
const DOCUMENT_STYLES = ['message', 'verse'];
const METADATA = ['book', 'character', 'location', 'profile'];
const STATE_COMMANDS = ['reveal', 'source', 'effect'];
const PROFILE_USAGE = '@profile <实体ID> <档案ID> facts="..." prompt="..." inferred=""';

// Positional arguments first, then key=value attributes; quoted values are JSON strings.
function parseArgs(raw, count, allowed, required, usage, fail) {
  const tokens = []; let i = 0;
  while (i < raw.length) {
    while (/\s/.test(raw[i] || '') && i < raw.length) i++;
    if (i === raw.length) break;
    let token = '', quoted = false;
    while (i < raw.length && (quoted || !/\s/.test(raw[i]))) {
      const ch = raw[i++];
      if (ch === '"') { quoted = !quoted; token += ch; }
      else if (ch === '\\' && quoted) {
        if (!['"', '\\'].includes(raw[i])) fail('引号内仅支持 \\" 与 \\\\ 转义');
        token += ch + raw[i++];
      } else token += ch;
    }
    if (quoted) fail('参数双引号未闭合');
    tokens.push(token);
  }
  if (tokens.slice(0, count).some(token => !token.includes('=') && token.includes('\\_'))) {
    fail('ID 中不允许 Markdown 转义：请将 \\_ 改为 _（例如 anna_karenina），直接使用纯文本脚本');
  }
  if (tokens.length < count || tokens.slice(0, count).some(token => token.includes('='))) {
    if (usage) fail(`@profile 缺少所属实体 ID 或档案 ID。必须写成：${usage}；档案名中的前缀不能替代独立的实体 ID`);
    fail('指令缺少位置参数，属性 key=value 不能代替位置参数');
  }
  const pos = tokens.splice(0, count), attrs = Object.create(null);
  if (pos.some(x => /[="\\]/.test(x))) fail('位置参数不能包含引号、反斜杠或等号');
  for (const token of tokens) {
    const match = /^(\w+)=(.*)$/.exec(token);
    if (!match || !allowed.includes(match[1])) fail(`未知或错误参数：${token}`);
    const [, key, val] = match;
    if (Object.hasOwn(attrs, key)) fail(`重复参数：${key}`);
    if (val.startsWith('"')) {
      try { attrs[key] = JSON.parse(val); } catch { fail(`无效引号参数：${token}`); }
    } else {
      if (!val || /["\\]/.test(val)) fail(`无效参数：${token}`);
      attrs[key] = val;
    }
  }
  for (const key of required) if (!Object.hasOwn(attrs, key)) fail(`缺少参数：${key}`);
  return [pos, attrs];
}

class ScriptParser {
  constructor(input, {strictSources, initialRevealed, allowEmptyContent}) {
    Object.assign(this, {input, strictSources, initialRevealed, allowEmptyContent});
    this.entities = new Map(); this.chapters = []; this.blocks = []; this.units = []; this.warnings = [];
    this.annotations = readAnnotations(input, (message, line) => { throw new ScriptError(message, line); });
    this.usedAnnotations = new Set(); this.missingAnnotations = new Set();
    this.chapterIds = new Set(); this.blockIds = new Set();
    this.book = null; this.version = false; this.chapter = null; this.block = null;
    this.source = []; this.revealed = new Map();
    this.effectNext = null; this.pending = null; this.lineNo = 0; this.blockStart = 0;
    this.sourceBeforeBlock = null; this.reorderedSource = null; this.sceneLoc = null;
    this.pageStart = null; this.pageLine = null;
    this.lines = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  }

  fail(message) { throw new ScriptError(message, this.lineNo, this.block?.id); }
  warn(message, line = this.lineNo) { this.warnings.push({line, message}); }
  args(raw, count, allowed = [], required = [], usage = '') {
    return parseArgs(raw, count, allowed, required, usage, message => this.fail(message));
  }
  validId(value) {
    if (!idPattern.test(value || '') || value === 'none') this.fail(`无效或保留的 ID：${value ?? ''}`);
    return value;
  }
  entity(id, kind) {
    const found = this.entities.get(id);
    if (!found || (kind && found.kind !== kind)) {
      this.fail(`不存在的${kind === 'character' ? '人物' : kind === 'location' ? '地点' : '实体'}：${id}`);
    }
    return found;
  }
  // Visible speakers and mentions become known at their unit.
  expose(id) {
    if (!this.revealed.has(id)) this.revealed.set(id, {label: this.entity(id, 'character').label, profile: null});
  }
  effect(value) {
    if (!['none', 'memory', 'dream'].includes(value)) this.fail(`未知效果：${value}`);
    return value;
  }
  endBlock() {
    const {block} = this;
    if (this.pageLine !== null && this.pageStart === this.units.length) throw new ScriptError('分屏记录后缺少正文', this.pageLine, block?.id);
    if (this.pending !== null) throw new ScriptError('状态指令后缺少正文', this.pending, block?.id);
    if (block?.kind === 'document' && !block.closed) this.fail('document 必须包含 @text 正文和 @enddocument 结束标记');
    if (block && this.units.length === this.blockStart) this.fail(`内容块 ${block.id} 没有正文`);
  }

  parse() {
    for (this.n = 0; this.n < this.lines.length; this.n++) this.readLine();
    this.lineNo = this.lines.length;
    this.endBlock();
    const {book, units, chapter, blocks} = this;
    if (!book || (!this.allowEmptyContent && (!units.length || (chapter && !blocks.some(b => b.chapterId === chapter.id))))) {
      this.fail('脚本缺少书籍或可播放正文');
    }
    const unused = [...this.annotations.keys()].filter(id => !this.usedAnnotations.has(id));
    if (unused.length) this.warn(`${unused.length} 条注解未关联正文，已保留记录并跳过注解显示。`, 1);
    joinShortUnits(units, book.lang);
    const story = {annotations: this.annotations, version: this.version, book, chapters: this.chapters, blocks, units,
      warnings: this.warnings, entities: this.entities};
    story.transitions = readTransitions(this.input, story);
    return story;
  }

  readLine() {
    this.lineNo = this.n + 1;
    let line = this.lines[this.n].trim(), documentText = false;
    if (line === '@text' && this.block?.kind === 'document') { line = this.readDocumentText(); documentText = true; }
    if (!documentText && line.startsWith('// @vn-page')) return this.pageMarker(line);
    if (!documentText && (!line || line.startsWith('//'))) return;
    if (!this.version) {
      if (line !== '@vn 0.10') this.fail('首个有效行必须为 @vn 0.10');
      this.version = line.slice(4);
      return;
    }
    if (!documentText && line.startsWith('@')) return this.command(line);
    this.textLine(line, documentText);
  }

  readDocumentText() {
    const {block, lines} = this;
    if (block.closed) this.fail('document 只能包含一份全文');
    const start = this.n + 1, body = [];
    while (++this.n < lines.length && lines[this.n].trim() !== '@enddocument') {
      body.push(lines[this.n].trim() === '\\@enddocument' ? lines[this.n].replace('\\@enddocument', '@enddocument') : lines[this.n]);
    }
    if (this.n === lines.length) this.fail('document 缺少 @enddocument 结束标记');
    const text = body.join('\n');
    if (!text.trim()) this.fail('document 正文不能为空');
    this.lineNo = start + 1; block.closed = true;
    return text;
  }

  pageMarker(line) {
    if (line !== '// @vn-page') this.fail('分屏记录应独占一行：// @vn-page');
    if (!['scene', 'narration'].includes(this.block?.kind)) this.fail('分屏记录只能位于 @scene／@narration 内');
    if (this.pageLine !== null && this.pageStart === this.units.length) this.fail('分屏记录后缺少正文');
    this.pageStart = this.units.length; this.pageLine = this.lineNo;
  }

  command(line) {
    const match = /^@(\w+)(?:\s+(.*))?$/.exec(line);
    if (!match) this.fail('指令格式错误');
    const [, command, raw = ''] = match;
    if (METADATA.includes(command)) return this.declare(command, raw);
    if (!this.book) this.fail('缺少 @book');
    if (command === 'chapter') return this.openChapter(raw);
    if (BLOCK_KINDS.includes(command)) return this.openBlock(command, raw);
    if (command === 'cast') this.fail('@cast 已移除：出场由导演记录安排，删除这一行');
    if (!STATE_COMMANDS.includes(command)) this.fail(`未知指令：@${command}`);
    this.stateCommand(command, raw);
  }

  declare(command, raw) {
    if (this.chapter) this.fail('元数据声明必须放在所有章节之前');
    if (command === 'book') {
      const [[id], a] = this.args(raw, 1, ['title', 'author', 'lang'], ['title']);
      if (this.book) this.fail('重复书籍声明');
      if (a.author !== undefined && !a.author.trim()) this.fail('author 不能为空；没有作者时省略');
      if (a.lang !== undefined && !isBookLanguage(a.lang)) this.fail(`lang 须为 ${BOOK_LANGUAGES.join('／')}；中文作品可省略`);
      this.book = {id: this.validId(id), title: a.title, author: a.author ?? null, lang: a.lang ?? DEFAULT_LANGUAGE};
      return;
    }
    if (!this.book) this.fail('先声明 @book');
    if (command === 'profile') {
      const fields = ['facts', 'prompt', 'inferred'];
      const [[id, profileId], a] = this.args(raw, 2, fields, fields, PROFILE_USAGE);
      const e = this.entity(id); this.validId(profileId);
      if (e.profiles.has(profileId)) this.fail(`重复档案：${id}/${profileId}`);
      e.profiles.set(profileId, a);
      return;
    }
    const [[id], a] = this.args(raw, 1, command === 'character' ? ['label', 'color'] : ['label'], ['label']);
    this.validId(id);
    if (id === 'guest') this.fail('guest 为非实体说话人标记，不能声明为实体 ID');
    if (this.entities.has(id)) this.fail(`重复实体：${id}`);
    if (a.color !== undefined && !isColor(a.color)) this.fail('人物颜色必须为 #RRGGBB 六位十六进制颜色');
    const color = a.color?.toLowerCase() ?? null;
    if (color && [...this.entities.values()].some(e => e.color === color)) this.warn('人物默认色重复，建议选用可区分的颜色');
    this.entities.set(id, {id, kind: command, label: a.label, color, profiles: new Map()});
  }

  openChapter(raw) {
    this.endBlock();
    // Workbench batches may continue a previously validated book. Standalone imports stay empty.
    if (!this.chapter) for (const [id, state] of this.initialRevealed) if (this.entities.has(id)) {
      const profile = this.entities.get(id).profiles.has(state.profile) ? state.profile : null;
      this.revealed.set(id, {label: state.label, profile});
    }
    const previous = this.chapter;
    if (!this.allowEmptyContent && previous && !this.blocks.some(b => b.chapterId === previous.id)) this.fail('上一章节没有内容块');
    const [[id], a] = this.args(raw, 1, ['title'], ['title']); this.validId(id);
    if (this.chapterIds.has(id)) this.fail(`重复章节：${id}`);
    this.chapterIds.add(id);
    this.chapter = {id, title: a.title, index: this.units.length};
    this.chapters.push(this.chapter); this.block = null;
  }

  openBlock(kind, raw) {
    if (!this.chapter) this.fail('内容块必须位于章节内');
    this.endBlock();
    const fields = {scene: ['loc', 'time', 'pov', 'effect', 'title'], narration: ['effect'], document: ['effect', 'style']}[kind];
    const [[id], a] = this.args(raw, 1, fields);
    this.validId(id);
    if (this.blockIds.has(id)) this.fail(`重复内容块：${id}`);
    if (a.loc) this.entity(a.loc, 'location');
    if (a.pov && a.pov !== 'none') this.entity(a.pov, 'character');
    if (a.style && !DOCUMENT_STYLES.includes(a.style)) this.fail(`document style 只能为 ${DOCUMENT_STYLES.join('／')}`);
    this.blockIds.add(id);
    const effect = this.effect(a.effect || 'none');
    // A present-time scene without loc continues the previous present-time scene's place, across chapters.
    const loc = a.loc || (kind === 'scene' && effect === 'none' ? this.sceneLoc : null);
    if (kind === 'scene' && effect === 'none') this.sceneLoc = loc;
    this.block = {id, kind, chapterId: this.chapter.id, title: a.title || '', loc, ...(loc && !a.loc ? {locInherited: true} : {}),
      time: a.time || '', pov: a.pov || 'none', effect, ...(kind === 'document' ? {style: a.style || 'message'} : {}), index: this.units.length};
    this.blocks.push(this.block); this.blockStart = this.units.length;
    this.effectNext = null;
    this.pageStart = null; this.pageLine = null;
    const early = this.sourceBeforeBlock;
    this.source = early?.source ?? []; this.reorderedSource = early;
    if (early) {
      this.pending = early.line;
      this.warn(`@source 位于内容块 ${id} 之前，已按该新块的来源读取；生成时先建块，再写 @source。`, early.line);
      this.sourceBeforeBlock = null;
    }
  }

  // Only an adjacent block opener makes the intended ownership unambiguous.
  // Ordinary comments/blanks are transparent; semantic records are boundaries.
  sourceOwnedByNextBlock() {
    const {lines} = this;
    let next = this.n + 1;
    const transparent = text => !text || (text.startsWith('//') && !/^\/\/\s*@(?:vn-transition|vn-page|source-use)\b/.test(text));
    while (next < lines.length && transparent(lines[next].trim())) next++;
    return /^@(scene|narration|document)(?:\s|$)/.test(lines[next]?.trim() ?? '');
  }

  stateCommand(command, raw) {
    if (command === 'source' && this.sourceOwnedByNextBlock()) {
      const [[list]] = this.args(raw, 1), ids = list.split(',');
      ids.forEach(id => this.validId(id));
      this.sourceBeforeBlock = {source: ids, line: this.lineNo};
      return;
    }
    const {block} = this;
    if (!block) this.fail('状态指令必须位于内容块内');
    if (block.kind === 'document' && (block.closed || !['source', 'reveal'].includes(command))) {
      this.fail('document 仅支持正文前的 @source／@reveal；正文用 @text 与 @enddocument 包围');
    }
    if (command === 'reveal') {
      const [[id], a] = this.args(raw, 1, ['label', 'profile']); const e = this.entity(id);
      if (a.profile && !e.profiles.has(a.profile)) this.fail(`不存在的档案：${id}/${a.profile}`);
      const previous = this.revealed.get(id);
      this.revealed.set(id, {label: a.label ?? previous?.label ?? e.label, profile: a.profile ?? previous?.profile ?? null});
    } else if (command === 'source') {
      const [[list]] = this.args(raw, 1); this.source = list.split(','); this.source.forEach(id => this.validId(id));
      if (this.reorderedSource && JSON.stringify(this.source) !== JSON.stringify(this.reorderedSource.source)) {
        this.fail('新块的 @source 与块前来源冲突，无法自动确定归属；先建块，再为正文保留正确的来源');
      }
    } else {
      const [[scope, value]] = this.args(raw, 2);
      if (scope !== 'next') this.fail('只支持 @effect next');
      if (this.effectNext !== null) this.fail('前一个单句效果尚未消费');
      this.effectNext = this.effect(value);
    }
    this.pending ??= this.lineNo;
  }

  // Speaker labels: [ID], [ID|心声], [guest|称呼] or [guest|称呼|心声].
  readSpeaker(line, documentText) {
    const unit = {text: line, speakerId: null, guestSpeaker: '', kind: 'narration'};
    // Literal media text has no speaker labels; a leading \{{ is consumed with the mentions.
    if (documentText || line.startsWith('\\{{')) return unit;
    if (line.startsWith('\\')) {
      unit.text = line.slice(1);
      if (!/^(?:@|\[|\/\/|\\)/.test(unit.text)) this.fail('正文反斜杠仅用于转义保留前缀');
      return unit;
    }
    if (!line.startsWith('[')) return unit;
    const match = /^\[([^\[\]]+)\]\s*(.+)$/.exec(line);
    if (!match) this.fail('人物标签或正文不完整');
    const parts = match[1].split('|');
    unit.speakerId = parts.shift();
    if (unit.speakerId === 'guest') {
      unit.guestSpeaker = parts.shift()?.trim() ?? ''; unit.speakerId = null;
      if (!unit.guestSpeaker || unit.guestSpeaker.length > 300) {
        this.fail('非实体对白须写作 [guest|称呼] 台词，称呼不能为空或超过 300 字');
      }
    } else this.entity(unit.speakerId, 'character');
    unit.kind = parts[0] === '心声' ? 'thought' : 'dialogue';
    if (unit.kind === 'thought') parts.shift();
    if (parts.length) this.fail('错误的人物标签，应为 [ID] 或 [ID|心声]；表情标签已移除');
    unit.text = match[2];
    return unit;
  }

  annotationFor(noteId) {
    if (noteId === null) return undefined;
    const annotation = this.annotations.get(noteId);
    if (annotation) this.usedAnnotations.add(noteId);
    else if (!this.missingAnnotations.has(noteId)) {
      this.missingAnnotations.add(noteId);
      this.warn(`注解 ${noteId} 未提供定义，已按普通文字显示。`);
    }
    return annotation;
  }

  // {{ID|visible text}} marks a mention. Escaping \{{ leaves a literal opener.
  // Keep plain text for history/validation and separate spans for safe rendering.
  readRuns(text) {
    const runs = [], places = [];
    let plain = '';
    const flush = () => { if (plain) runs.push({text: plain, characterId: null}); plain = ''; };
    for (let i = 0; i < text.length;) {
      if (text.startsWith('\\{{', i)) { plain += '{{'; i += 3; continue; }
      if (!text.startsWith('{{', i)) { plain += text[i++]; continue; }
      const end = text.indexOf('}}', i + 2);
      if (end < 0) this.fail('人物提及缺少闭合 }}');
      const token = text.slice(i + 2, end), parts = token.split('|');
      const noteOnly = parts[0].startsWith('note:');
      const noteId = noteOnly ? parts[0].slice(5) : (parts[2]?.startsWith('note:') ? parts[2].slice(5) : null);
      if (!parts[1]?.trim() || /[{}]/.test(token) || (parts.length !== 2 && !(parts.length === 3 && noteId && !noteOnly))) {
        this.fail('人物提及／注解引用须为 {{人物ID|称呼}}、{{note:注解ID|词语}} 或 {{人物ID|称呼|note:注解ID}}，不可嵌套或留空');
      }
      const annotation = this.annotationFor(noteId), extra = annotation ? {annotation} : {};
      i = end + 2;
      if (noteOnly) { flush(); runs.push({text: parts[1], characterId: null, ...extra}); continue; }
      if (!idPattern.test(parts[0])) this.fail('无效人物提及 ID');
      if (this.entities.get(parts[0])?.kind === 'location') {
        if (annotation) { flush(); runs.push({text: parts[1], characterId: null, annotation}); } else plain += parts[1];
        this.warn(`地点 ${parts[0]} 被写成人物提及，已将「${parts[1]}」作为普通文字显示。`);
        places.push(parts[0]);
        continue;
      }
      flush();
      this.entity(parts[0], 'character');
      this.expose(parts[0]);
      runs.push({text: parts[1], characterId: parts[0], ...extra});
    }
    flush();
    return {runs, places, text: runs.map(run => run.text).join('')};
  }

  // Authored pages accumulate lines; a state change inside one falls back to one line per screen.
  paginate(unit) {
    const {block} = this;
    if (this.pageStart !== null) {
      const first = this.units[this.pageStart];
      const changed = first && (first.kind !== unit.kind || first.speakerId !== unit.speakerId
        || (first.guestSpeaker ?? '') !== unit.guestSpeaker || first.effect !== (this.effectNext ?? block.effect));
      if (changed) { this.pageStart = null; this.pageLine = null; }
    }
  }

  textLine(line, documentText) {
    const {block} = this;
    if (!block) this.fail('正文必须位于内容块内');
    if (block.kind === 'document' && !documentText) this.fail('document 正文必须用 @text 与 @enddocument 包围');
    const unit = this.readSpeaker(line, documentText);
    if (unit.speakerId) this.expose(unit.speakerId);
    const {runs, text, places} = this.readRuns(unit.text);
    if (!this.source.length) {
      if (this.strictSources) this.fail('缺少 @source 来源映射');
      this.warn('缺少来源映射（试读允许）');
    }
    this.paginate(unit);
    const {units, chapter, revealed} = this, previous = units.at(-1);
    const backgroundContext = documentText
      ? (previous?.backgroundContext ?? (previous ? {chapterId: previous.chapter.id, blockId: previous.block.id, loc: previous.block.loc}
        : {chapterId: chapter.id, blockId: block.id, loc: null}))
      : undefined;
    units.push({id: `${block.id}:${units.length - this.blockStart + 1}`, line: this.lineNo, text, runs, kind: unit.kind, speakerId: unit.speakerId,
      ...(unit.guestSpeaker ? {guestSpeaker: unit.guestSpeaker} : {}),
      ...(documentText ? {backgroundContext} : {}),
      // Locations mistakenly written as mentions still count as uses for entity recovery.
      ...(places.length ? {places: [...new Set(places)]} : {}),
      pageStart: this.pageStart,
      speaker: unit.speakerId ? (revealed.get(unit.speakerId)?.label ?? this.entity(unit.speakerId).label) : unit.guestSpeaker,
      chapter: {...chapter}, block: {...block}, source: [...this.source],
      location: block.loc ? (revealed.get(block.loc)?.label ?? this.entity(block.loc).label) : '',
      effect: this.effectNext ?? block.effect,
      // Shared snapshots remain immutable: replace maps on subsequent changes.
      revealed});
    this.revealed = new Map(revealed);
    this.pending = null; this.effectNext = null; this.reorderedSource = null;
  }
}

export const SHORT_UNIT_CHARS = 5;
// English counts words: "Oh no!" and "I see." are short, "What is it?" is not.
export const SHORT_UNIT_WORDS = 3;
export const JOINED_SCREEN_UNITS = 3;
/** @param {{text:string}} unit @param {string} lang */
const shortUnit = (unit, lang) => lang === 'en'
  ? (unit.text.match(/[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu) || []).length < SHORT_UNIT_WORDS
  : unit.text.replace(/[\p{P}\p{S}\s]/gu, '').length < SHORT_UNIT_CHARS;
// Source IDs number the original paragraphs; lines from different paragraphs stay apart.
const sameParagraph = (a, b) => (!a.source.length && !b.source.length) || a.source.some(id => b.source.includes(id));

// Very short lines ("啊！", "天啊！") share a screen with a neighbour of the same block, paragraph, speaker and effect.
// Only units outside authored pages join; one joined screen holds at most JOINED_SCREEN_UNITS units.
function joinShortUnits(units, lang) {
  let start = null;
  units.forEach((unit, i) => {
    const previous = units[i - 1];
    const joinable = previous && unit.pageStart === null && previous.pageStart === null && unit.block.kind !== 'document'
      && previous.block.id === unit.block.id && previous.kind === unit.kind && previous.speakerId === unit.speakerId
      && previous.speaker === unit.speaker && previous.effect === unit.effect && sameParagraph(previous, unit);
    const first = start ?? i - 1, group = joinable ? units.slice(first, i) : [];
    if (joinable && group.length < JOINED_SCREEN_UNITS && (shortUnit(unit, lang) || group.every(other => shortUnit(other, lang)))) {
      start = first;
      previous.joinStart = first; unit.joinStart = first;
    } else start = null;
  });
}

/**
 * @param {string} input
 * @param {{strictSources?:boolean,initialRevealed?:Map<string,{label:string,profile:string|null}>,allowEmptyContent?:boolean}} [options]
 * @returns {Story}
 */
export function parseScript(input, {strictSources = false, initialRevealed = new Map(), allowEmptyContent = false} = {}) {
  return new ScriptParser(input, {strictSources, initialRevealed, allowEmptyContent}).parse();
}

export const BOOK_TEXT_LIMIT = 200;
/**
 * A title and author as the shelf and the asset manager accept them: one line each, the author optional.
 * @param {unknown} value
 * @returns {{title:string,author:string|null}}
 */
export function checkBookInfo(value) {
  const {title, author} = /** @type {any} */ (value ?? {});
  const line = (/** @type {unknown} */ text) => typeof text === 'string' && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(text);
  if (!line(title) || !title.trim()) throw new Error('书名不能为空，且只能写一行。');
  if (author !== null && author !== undefined && !line(author)) throw new Error('作者只能写一行。');
  const result = {title: title.trim(), author: author?.trim() || null};
  if (result.title.length > BOOK_TEXT_LIMIT || (result.author?.length ?? 0) > BOOK_TEXT_LIMIT) {
    throw new Error(`书名和作者各不超过 ${BOOK_TEXT_LIMIT} 字。`);
  }
  return result;
}
/**
 * The text with its @book line naming another title and author; the book ID and every other line stay as they are.
 * @param {string} raw
 * @param {{title:string,author:string|null}} info
 */
export function withBookInfo(raw, info) {
  const {title, author} = checkBookInfo(info);
  const lines = raw.split('\n');
  const at = lines.findIndex(line => /^\s*@book\s/.test(line));
  if (at < 0) throw new Error('正文缺少 @book。');
  const match = /^(\s*@book\s+)(\S+)/.exec(lines[at]);
  if (!match || !idPattern.test(match[2])) throw new Error('正文的 @book 无效。');
  const cr = lines[at].endsWith('\r') ? '\r' : '';
  // The language belongs to the text, not to the shelf's book info, so it stays.
  const lang = /\slang=(?:"([^"]*)"|(\S+))/.exec(lines[at]);
  const langAttr = lang ? ` lang=${lang[1] ?? lang[2]}` : '';
  lines[at] = `${match[1]}${match[2]} title=${JSON.stringify(title)}${author ? ` author=${JSON.stringify(author)}` : ''}${langAttr}${cr}`;
  return lines.join('\n');
}
