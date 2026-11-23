// @ts-check
/** @import {IncomingMessage,ServerResponse} from 'node:http' */
/** @import {BookListing,BookMeta,BookRecord,CommitRequest,Progress,ReadingDays,ReadingRecord,ReadingSession,ReadingStats} from '../types/library.js' */
/** @import {ContentStore,HomeStore,ReadingStore} from './library-storage.mjs' */
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { crc32, zipLayout } from '../core/zip-store.js';
import { imageHeader } from '../core/image-header.js';
import { IMAGE_LIMIT, imageOrientation } from '../reader/backgrounds.js';
import { AUDIO_LIMIT, audioType } from '../reader/audio-assets.js';
import { DEFAULT_LANGUAGE, isBookLanguage } from '../core/language.js';
import { readPackage } from '../reader/story-package.js';
import { checkBookInfo, withBookInfo } from '../core/parser.js';
import { checkBlurb, readBlurb, withBlurb } from '../core/blurb.js';
import { createDiskStorage } from './library-storage.mjs';
import { allowed, fail, readBody, send } from './http.mjs';

// Book library: each book is its .vn.zip tree unpacked, plus small meta and cover files, and reading data (positions and
// reading sessions per device) kept apart, by a storage backend (library-storage.mjs). Images are named by their SHA-256, so a sync only uploads images the book lacks.
// The page reaches it only through /api/library.
const KEY = /^[a-z][a-z0-9_-]{0,79}$/;
const ASSET = /^assets\/(?:(backgrounds|characters|extra)\/([a-f0-9]{64})\.(png|jpg|webp)|(audio)\/([a-f0-9]{64})\.(mp3|m4a|ogg))$/;
const ASSET_FOLDERS = ['backgrounds', 'characters', 'extra', 'audio'];
const COVER_TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const FILE_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8' };
const MB = 1024 * 1024;
const DEVICE = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const count = (/** @type {unknown} */ value) => Number.isSafeInteger(value) && /** @type {number} */ (value) >= 0;

// The position the shelf shows: the latest save from any device, with the furthest place any device reached.
/** @param {Progress[]} positions @returns {Progress|null} */
function latestPosition(positions) {
  const valid = positions.filter(value => value && Number.isInteger(value.index));
  if (!valid.length) return null;
  const latest = valid.reduce((a, b) => ((b.savedAt ?? 0) > (a.savedAt ?? 0) ? b : a));
  const furthest = Math.max(...valid.map(value => value.furthest ?? value.index));
  return { ...latest, furthest: Math.max(furthest, latest.index) };
}
// Whether a position is at the last unit of a book that is all there (not still being made).
/** @param {Pick<Progress,'index'|'furthest'|'count'>} position @param {BookMeta} meta */
const atEnd = (position, meta) => meta.complete && count(position.count) && Math.max(position.index, position.furthest ?? 0) + 1 >= /** @type {number} */ (position.count);
// The first time any device finished the book.
/** @param {ReadingRecord[]} records @returns {number|null} */
function finishedAt(records) {
  const times = /** @type {number[]} */ (records.map(record => record?.finishedAt).filter(count));
  return times.length ? Math.min(...times) : null;
}
const RATING = (/** @type {unknown} */ value) => Number.isInteger(value) && /** @type {number} */ (value) >= 1 && /** @type {number} */ (value) <= 5;
const REVIEW_LIMIT = 2000;
// The rating and review set last on any device.
/** @param {ReadingRecord[]} records @returns {{rating:number|null,review:string}} */
function latestReview(records) {
  const reviewed = records.filter(record => count(record?.reviewedAt));
  if (!reviewed.length) return { rating: null, review: '' };
  const latest = reviewed.reduce((a, b) => (/** @type {number} */ (b.reviewedAt) > /** @type {number} */ (a.reviewedAt) ? b : a));
  return { rating: RATING(latest.rating) ? /** @type {number} */ (latest.rating) : null, review: typeof latest.review === 'string' ? latest.review : '' };
}
// The home page background: the default photo, the cover of the book read last, or an uploaded picture; dim is a
// brightness percentage. The uploaded picture stays when another choice is made, so switching back costs nothing.
const BACKGROUNDS = new Set(['default', 'recent', 'custom']);
const defaultHome = () => ({ background: { kind: 'default', dim: 100, custom: null } });
/** @param {any} value */
function checkHome(value) {
  const kind = value?.kind, dim = value?.dim;
  if (!BACKGROUNDS.has(kind) || !Number.isInteger(dim) || dim < 30 || dim > 100) throw fail(400, '主页背景设置无效。');
  return { kind, dim };
}

// A session as the page sends it: its days split the active time by local date.
/** @param {any} value @returns {ReadingSession} */
function checkSession(value) {
  const bad = () => fail(400, '阅读记录无效。');
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !DEVICE.test(value.id)) throw bad();
  const { id, start, end, tz, active, days, from, to, furthest, version } = value;
  if (!count(start) || !count(end) || end < start || !Number.isInteger(tz) || Math.abs(tz) > 18 * 60 || !count(active)) throw bad();
  if (!count(from) || !count(to) || !count(furthest) || (version !== undefined && !count(version))) throw bad();
  if (!days || typeof days !== 'object' || Array.isArray(days)) throw bad();
  const entries = Object.entries(days);
  if (entries.length > 400 || entries.some(([date, time]) => !DAY.test(date) || !count(time))) throw bad();
  if (entries.reduce((sum, [, time]) => sum + time, 0) !== active) throw bad();
  return { id, start, end, tz, active, days: Object.fromEntries(entries), from, to, furthest, ...(version !== undefined ? { version } : {}) };
}

// The package path of an original-book image id, if the book holds it.
/** @param {unknown} id @param {string[]} files @returns {string|null} */
function originalCoverPath(id, files) {
  return typeof id === 'string' ? files.find(name => name.startsWith(`assets/extra/${id}.`)) ?? null : null;
}
// The work's language from the @book line of its text, for books saved before the shelf kept it.
/** @param {string} story @returns {import('../types/story.js').Book['lang']} */
function storyLanguage(story) {
  const lang = /^@book\b[^\n]*?\slang=(\S+)/m.exec(story)?.[1];
  return isBookLanguage(lang) ? /** @type {import('../types/story.js').Book['lang']} */ (lang) : DEFAULT_LANGUAGE;
}
// Writes with backpressure; a reader that goes away ends the download.
/** @param {ServerResponse} res @param {Uint8Array} chunk @returns {Promise<void>} */
function write(res, chunk) {
  if (res.destroyed || res.writableEnded) return Promise.reject(fail(499, '下载已中断。'));
  if (res.write(chunk)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const settle = (/** @type {boolean} */ ok) => () => {
      res.off('drain', drained); res.off('close', closed);
      if (ok) resolve(); else reject(fail(499, '下载已中断。'));
    };
    const drained = settle(true), closed = settle(false);
    res.on('drain', drained); res.on('close', closed);
  });
}
// `root` is a folder on disk, or a storage backend with the same content and reading stores.
/** @param {string|{content:ContentStore,reading:ReadingStore,home?:HomeStore,migrate?:()=>Promise<void>}} root */
export function createLibrary(root) {
  const storage = typeof root === 'string' ? createDiskStorage(root) : root;
  const { content, reading, home } = storage;
  // Requests wait for the one-time move of older reading data; if it fails, the shelf still opens and tries again next start.
  const ready = (storage.migrate?.() ?? Promise.resolve()).catch(error => console.error('书架阅读数据迁移失败：', error));
  /** @returns {Promise<any>} */
  const readJSON = async (/** @type {string} */ key, /** @type {string} */ name) => {
    try { return JSON.parse((await content.read(key, name))?.toString('utf8') ?? 'null'); } catch { return null; }
  };
  /** @type {Map<string,Promise<unknown>>} */
  const queues = new Map();
  // One operation per book at a time; different books proceed independently.
  /** @template T @param {string} key @param {()=>Promise<T>} task @returns {Promise<T>} */
  function serial(key, task) {
    const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(task);
    queues.set(key, next);
    return next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
  }
  /* Fields the shelf shows that older books lack: the original book's cover (from an EPUB, kept in extra.json) among
   * the package files, for shelves that prefer it to the made cover, and the work's language and picture orientation for
   * its marks. Books committed before a field existed get it on their first listing. */
  const complete = (/** @type {BookMeta} */ meta) => meta.originalCover !== undefined && meta.lang !== undefined && meta.orientation !== undefined
    && meta.blurb !== undefined;
  /** @param {string} key @param {BookMeta} meta */
  async function withShelfFields(key, meta) {
    if (complete(meta)) return meta;
    return serial(key, async () => {
      /** @type {BookMeta|null} */
      const current = await readJSON(key, 'meta.json');
      if (!current) return meta;
      if (complete(current)) return current;
      if (current.originalCover === undefined) current.originalCover = originalCoverPath((await readJSON(key, 'package/extra.json'))?.cover, current.files);
      if (current.lang === undefined || current.blurb === undefined) {
        const text = (await content.read(key, 'package/story.vn.txt'))?.toString('utf8') ?? '';
        if (current.lang === undefined) current.lang = storyLanguage(text);
        if (current.blurb === undefined) { try { current.blurb = readBlurb(text); } catch { current.blurb = null; } }
      }
      if (current.orientation === undefined) {
        const images = (await readJSON(key, 'package/manifest.json'))?.backgrounds?.images;
        current.orientation = imageOrientation(Object.values(images && typeof images === 'object' ? images : {}));
      }
      await content.write(key, 'meta.json', JSON.stringify(current));
      return current;
    });
  }
  /* When the book was first finished. Positions saved before records existed that already reached the end of a complete
   * book become a record of the device that saved them, dated by that save, on the first listing. */
  /** @param {string} key @param {BookMeta} meta @param {Progress|null} progress @returns {Promise<number|null>} */
  async function finished(key, meta, progress) {
    const records = await reading.records(key), time = finishedAt(records);
    if (time !== null || !progress || !atEnd(progress, meta) || !count(progress.savedAt)) return time;
    const device = typeof progress.device === 'string' && DEVICE.test(progress.device) ? progress.device : 'migrated';
    await serial(key, () => markFinished(key, device, /** @type {number} */ (progress.savedAt)));
    return /** @type {number} */ (progress.savedAt);
  }
  // Notes the first time this device finished the book; a later finish keeps the first.
  /** @param {string} key @param {string} device @param {number} time */
  async function markFinished(key, device, time) {
    const own = (await reading.records(key)).find(record => record?.device === device);
    if (own && count(own.finishedAt)) return;
    await reading.putRecord(key, { ...own, device, finishedAt: time });
  }
  // The book's reading over every device: time, dates, first start, first finish, and the latest rating and review.
  /** @param {string} key @returns {Promise<BookRecord>} */
  async function bookRecord(key) {
    const records = await reading.records(key), dates = new Set();
    let active = 0, startedAt = /** @type {number|null} */ (null);
    for (const record of await reading.sessions(key)) {
      for (const session of Array.isArray(record?.sessions) ? record.sessions : []) {
        if (!count(session?.active)) continue;
        active += session.active;
        if (count(session.start) && (startedAt === null || session.start < startedAt)) startedAt = session.start;
        for (const [date, time] of Object.entries(session.days ?? {})) if (DAY.test(date) && count(time) && time > 0) dates.add(date);
      }
    }
    return { finishedAt: finishedAt(records), startedAt, active, days: dates.size, ...latestReview(records) };
  }
  // Sets this device's rating and review; the shelf answers with the book's record.
  /** @param {string} key @param {string} device @param {number|null} rating @param {string} review */
  async function putReview(key, device, rating, review) {
    if (!await content.has(key, 'meta.json')) throw fail(404, '书架上没有这本作品。');
    const own = (await reading.records(key)).find(record => record?.device === device);
    await reading.putRecord(key, { ...own, device, rating, review, reviewedAt: Date.now() });
  }
  /** @returns {Promise<BookListing[]>} */
  async function list() {
    const books = [];
    for (const key of await content.keys()) {
      if (!KEY.test(key)) continue;
      const stored = await readJSON(key, 'meta.json');
      if (!stored) continue;
      const meta = await withShelfFields(key, stored);
      const progress = latestPosition(await reading.positions(key));
      const { files, ...visible } = meta;
      books.push({ key, ...visible, progress: progress && {
        index: progress.index, count: progress.count, furthest: progress.furthest, chapter: progress.chapter ?? '', savedAt: progress.savedAt,
      }, finishedAt: await finished(key, meta, progress), rating: latestReview(await reading.records(key)).rating });
    }
    const recent = book => Math.max(book.progress?.savedAt || 0, book.addedAt || 0);
    return books.sort((a, b) => recent(b) - recent(a));
  }
  /* The book as a .vn.zip, written while it is sent: each file is read once for its checksum and once to send it,
   * so a large book never sits in memory. The length is known up front for the download's progress. A download does not
   * hold the book's queue, so a slow one never delays saving positions; an import meanwhile can cut it short. */
  /** @param {ServerResponse} res @param {string} key */
  async function sendPackage(res, key) {
    /** @type {BookMeta|null} */
    const meta = await readJSON(key, 'meta.json');
    if (!meta) throw fail(404, '书架上没有这本作品。');
    const files = [];
    for (const name of meta.files) {
      const file = await content.open(key, `package/${name}`);
      if (!file) throw fail(500, '书架文件缺失。');
      let crc = 0;
      for await (const chunk of file.stream()) crc = crc32(chunk, crc);
      files.push({ name, size: file.size, crc, file });
      // A reader who left while the checksums were summed gets nothing more.
      if (res.destroyed) return;
    }
    const { size, before, after } = zipLayout(files);
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Cache-Control': 'no-store', 'Content-Length': size,
      'Content-Disposition': `attachment; filename="${key}.vn.zip"` });
    for (const [i, { file }] of files.entries()) {
      await write(res, before[i]);
      for await (const chunk of file.stream()) await write(res, chunk);
    }
    res.end(after);
  }
  /** @param {string} key @param {string} name @param {Buffer} body */
  async function putAsset(key, name, body) {
    const match = ASSET.exec(name);
    if (!match) throw fail(400, '无效图片路径。');
    if (createHash('sha256').update(body).digest('hex') !== (match[2] ?? match[5])) throw fail(400, '图片校验失败。');
    if (!await content.has(key, `package/${name}`)) await content.write(key, `package/${name}`, body);
  }
  /** @param {string} key @returns {Promise<string[]>} */
  async function assets(key) {
    const found = [];
    for (const folder of ASSET_FOLDERS) {
      for (const name of await content.list(key, `package/assets/${folder}`)) if (ASSET.test(`assets/${folder}/${name}`)) found.push(`assets/${folder}/${name}`);
    }
    return found;
  }
  // An uploaded image must be the file the manifest declares; its SHA-256 was checked when it was uploaded.
  /** @param {string} key @param {string} name @param {{type:string,width:number,height:number}} img */
  async function checkImage(key, name, img) {
    const file = `package/${name}`;
    let header = imageHeader(await content.head(key, file, 64 * 1024) ?? new Uint8Array());
    // A JPEG's size can sit behind a long metadata segment.
    if (!header && img.type === 'image/jpeg') header = imageHeader(await content.read(key, file) ?? new Uint8Array());
    if (!header || header.type !== img.type || header.width !== img.width || header.height !== img.height) {
      throw fail(400, '图片格式或尺寸与清单不一致。');
    }
  }
  // An uploaded audio file must be of the type the manifest declares.
  /** @param {string} key @param {string} name @param {{type:string}} file */
  async function checkAudio(key, name, file) {
    /** @type {string|null} */
    let type = null;
    try { type = audioType(await content.head(key, `package/${name}`, 16) ?? new Uint8Array()); } catch {}
    if (type !== file.type) throw fail(400, '音频格式与清单不一致。');
  }
  /* Text files arrive with the list of uploaded images. The book is checked as a whole (text, manifest, every binding
   * and image) before anything is replaced, so pages and other tools can trust what the shelf holds. */
  /** @param {string} key @param {CommitRequest} body */
  async function commit(key, body) {
    const { manifest, story, extra, assets: paths } = body || {};
    if (typeof manifest !== 'string' || typeof story !== 'string' || (extra !== null && typeof extra !== 'string')) throw fail(400, '作品内容不完整。');
    if (!Array.isArray(paths) || paths.some(name => !ASSET.test(name)) || new Set(paths).size !== paths.length) throw fail(400, '图片清单无效。');
    for (const name of paths) if (!await content.has(key, `package/${name}`)) throw fail(409, '作品图片尚未全部上传。');
    /** @type {Record<string,string|null>} */
    const texts = { 'manifest.json': manifest, 'story.vn.txt': story, 'extra.json': extra };
    let book;
    try {
      book = await readPackage({
        text: async (name, limit) => { const text = texts[name] ?? null; return text !== null && Buffer.byteLength(text) <= limit ? text : null; },
        image: async (name, _id, img) => { await checkImage(key, name, img); return {}; },
        audio: async (name, _id, file) => { await checkAudio(key, name, file); return {}; },
      });
    } catch (/** @type {any} */ error) { throw error.status ? error : fail(400, error.message); }
    if (book.story.book.id.toLowerCase() !== key) throw fail(400, '作品信息无效。');
    const uploaded = new Set(paths), declared = [...book.files].filter(name => ASSET.test(name));
    if (declared.length !== uploaded.size || declared.some(name => !uploaded.has(name))) throw fail(400, '图片清单与作品包不一致。');
    // A different text replaces the book: positions in the old text mean nothing in the new one. Sessions stay: the time
    // was spent, and each names the version it was read in.
    const before = await content.read(key, 'package/story.vn.txt');
    if (before && before.toString('utf8') !== story) await reading.clearPositions(key);
    await content.write(key, 'package/story.vn.txt', story);
    if (extra !== null) await content.write(key, 'package/extra.json', extra);
    else await content.remove(key, 'package/extra.json');
    await content.write(key, 'package/manifest.json', manifest);
    for (const name of await assets(key)) if (!uploaded.has(name)) await content.remove(key, `package/${name}`);
    /** @type {BookMeta|null} */
    const previous = await readJSON(key, 'meta.json');
    const now = Date.now(), { title, author } = book.story.book;
    /** @type {BookMeta} */
    const record = {
      bookId: book.story.book.id, title: title.slice(0, 200), author: author?.slice(0, 200) ?? null, complete: book.complete,
      addedAt: previous?.addedAt || now, updatedAt: now, cover: previous?.cover ?? null,
      originalCover: originalCoverPath(book.extra?.cover, paths),
      lang: book.story.book.lang, orientation: imageOrientation(Object.values(book.backgrounds.images)), blurb: book.story.blurb ?? null,
      files: ['manifest.json', 'story.vn.txt', ...(extra !== null ? ['extra.json'] : []), ...paths],
    };
    await content.write(key, 'meta.json', JSON.stringify(record));
    return { updatedAt: now };
  }
  /* A new title and author, written into the stored text's @book line, and a new blurb, into its blurb record, so an
   * exported package carries them too. The reading units stay the same, so positions keep; the version still moves on,
   * since the text file changed. */
  /** @param {string} key @param {unknown} value */
  async function putInfo(key, value) {
    let info, blurb;
    try {
      info = checkBookInfo(value);
      // A blurb left out keeps the one the text has; an empty one removes it.
      const given = /** @type {{blurb?:unknown}|null} */ (value)?.blurb;
      blurb = given === undefined ? undefined : checkBlurb(given) || null;
    } catch (/** @type {any} */ error) { throw fail(400, error.message); }
    /** @type {BookMeta|null} */
    const meta = await readJSON(key, 'meta.json'), story = await content.read(key, 'package/story.vn.txt');
    if (!meta || !story) throw fail(404, '书架上没有这本作品。');
    const text = story.toString('utf8'), current = readBlurb(text), next = blurb === undefined ? current : blurb;
    if (meta.title === info.title && meta.author === info.author && next === current) return { updatedAt: meta.updatedAt };
    await content.write(key, 'package/story.vn.txt', withBlurb(withBookInfo(text, info), next));
    const updatedAt = Math.max(Date.now(), meta.updatedAt + 1);
    await content.write(key, 'meta.json', JSON.stringify({ ...meta, ...info, blurb: next, updatedAt }));
    return { updatedAt };
  }
  /* One file of a book. Images are named by their content, so a cached copy never goes stale. The text files change
   * with each import: they are read in the book's queue, so never halfway through an import, and a page that names the
   * version it opened (?v=updatedAt) is refused once another version replaced it, instead of mixing two versions. */
  /** @param {IncomingMessage} req @param {ServerResponse} res @param {string} key @param {string} name */
  async function sendFile(req, res, key, name) {
    const type = FILE_TYPES[name.slice(name.lastIndexOf('.') + 1)];
    if (ASSET.test(name)) {
      /** @type {BookMeta|null} */
      const meta = await readJSON(key, 'meta.json');
      const file = meta?.files.includes(name) ? await content.open(key, `package/${name}`) : null;
      if (!file) throw fail(404, '书架上没有这个文件。');
      res.writeHead(200, { 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Type': type, 'Content-Length': file.size });
      await pipeline(file.stream(), res);
      return;
    }
    const { meta, data } = await serial(key, async () => {
      /** @type {BookMeta|null} */
      const meta = await readJSON(key, 'meta.json');
      return { meta, data: meta?.files.includes(name) ? await content.read(key, `package/${name}`) : null };
    });
    if (!meta || !data) throw fail(404, '书架上没有这个文件。');
    const version = new URL(req.url ?? '', 'http://localhost').searchParams.get('v');
    if (version !== null && version !== String(meta.updatedAt)) throw fail(409, '作品已在别处更新，请回到书架重新打开。');
    const tag = `"${meta.updatedAt}"`, cache = { 'Cache-Control': 'no-cache', ETag: tag };
    if (req.headers['if-none-match'] === tag) { res.writeHead(304, cache).end(); return; }
    res.writeHead(200, { ...cache, 'Content-Type': type, 'Content-Length': data.length }).end(data);
  }
  /** @param {string} key @param {string|null} id @param {string|undefined} type @param {Buffer} body */
  async function putCover(key, id, type, body) {
    const meta = await readJSON(key, 'meta.json');
    if (!meta) throw fail(404, '书架上没有这本作品。');
    for (const ext of Object.values(COVER_TYPES)) await content.remove(key, `cover.${ext}`);
    if (body.length) {
      if (!COVER_TYPES[type] || typeof id !== 'string' || id.length > 200) throw fail(400, '封面无效。');
      await content.write(key, `cover.${COVER_TYPES[type]}`, body);
    }
    meta.cover = body.length ? { id, type, at: Date.now() } : null;
    await content.write(key, 'meta.json', JSON.stringify(meta));
  }
  /** @param {string} key */
  async function cover(key) {
    const meta = await readJSON(key, 'meta.json');
    const data = meta?.cover && await content.read(key, `cover.${COVER_TYPES[meta.cover.type]}`);
    if (!data) throw fail(404, '没有封面。');
    return { type: meta.cover.type, data };
  }
  // Removed books stay recoverable (on disk they move to .trash). Their reading sessions stay on the shelf, so reading
  // time still counts; the position goes with the book.
  /** @param {string} key */
  async function remove(key) {
    if (!await content.has(key, 'meta.json')) throw fail(404, '书架上没有这本作品。');
    await content.discard(key);
    await reading.clearPositions(key);
  }
  // Adds or replaces one session in the device's record of the book; the page sends a session again as it grows.
  /** @param {string} key @param {string} device @param {ReadingSession} session */
  async function putSession(key, device, session) {
    /** @type {BookMeta|null} */
    const meta = await readJSON(key, 'meta.json');
    if (!meta) throw fail(404, '书架上没有这本作品。');
    // The device's record keeps the book's name for the statistics, written only when it changes.
    const own = (await reading.records(key)).find(record => record?.device === device);
    if (own?.title !== meta.title || (own?.author ?? null) !== (meta.author ?? null)) {
      await reading.putRecord(key, { ...own, device, title: meta.title, author: meta.author ?? null });
    }
    const record = await reading.deviceSessions(key, device);
    const sessions = (Array.isArray(record?.sessions) ? record.sessions : []).filter(item => item?.id !== session.id);
    sessions.push(session);
    sessions.sort((a, b) => a.start - b.start);
    await reading.putSessions(key, { device, sessions });
  }
  /** @returns {Promise<{background:{kind:string,dim:number,custom:{type:string,at:number}|null}}>} */
  async function homeSettings() {
    const saved = await home?.read('home.json');
    try { return { ...defaultHome(), ...JSON.parse(saved?.toString('utf8') ?? 'null') }; } catch { return defaultHome(); }
  }
  /** @param {any} value */
  async function putHome(value) {
    if (!home) throw fail(404, '不支持的操作。');
    const settings = await homeSettings(), next = checkHome(value);
    if (next.kind === 'custom' && !settings.background.custom) throw fail(409, '还没有上传背景图片。');
    settings.background = { ...settings.background, ...next };
    await home.write('home.json', JSON.stringify(settings));
    return settings;
  }
  // An uploaded background replaces the previous one and becomes the choice.
  /** @param {Buffer} body */
  async function putBackground(body) {
    if (!home) throw fail(404, '不支持的操作。');
    const header = imageHeader(body);
    if (!header || !COVER_TYPES[header.type]) throw fail(400, '背景图片应为 PNG、JPEG 或 WebP。');
    const settings = await homeSettings(), previous = settings.background.custom;
    if (previous && previous.type !== header.type) await home.remove(`background.${COVER_TYPES[previous.type]}`);
    await home.write(`background.${COVER_TYPES[header.type]}`, body);
    settings.background = { ...settings.background, kind: 'custom', custom: { type: header.type, at: Date.now() } };
    await home.write('home.json', JSON.stringify(settings));
    return settings;
  }
  // Reading time per local date over every device and book, removed books included; dates from and to are inclusive.
  /** @param {string|null} from @param {string|null} to @returns {Promise<ReadingDays>} */
  async function readingDays(from, to) {
    /** @type {ReadingDays} */
    const days = {};
    for (const key of await reading.keys()) {
      if (!KEY.test(key)) continue;
      for (const record of await reading.sessions(key)) {
        for (const session of Array.isArray(record?.sessions) ? record.sessions : []) {
          for (const [date, time] of Object.entries(session?.days ?? {})) {
            if (!DAY.test(date) || !count(time) || (from && date < from) || (to && date > to)) continue;
            const day = days[date] ??= { total: 0, books: {} };
            day.total += time;
            day.books[key] = (day.books[key] ?? 0) + time;
          }
        }
      }
    }
    return Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)));
  }

  // Every day's reading, and each book read: its name (from the shelf, else as last recorded), finish and rating.
  /** @returns {Promise<ReadingStats>} */
  async function stats() {
    const shelved = new Set(await content.keys()), books = [];
    for (const key of await reading.keys()) {
      if (!KEY.test(key)) continue;
      const records = await reading.records(key);
      /** @type {BookMeta|null} */
      const meta = shelved.has(key) ? await readJSON(key, 'meta.json') : null;
      const named = records.filter(record => typeof record?.title === 'string').at(-1);
      books.push({ key, title: meta?.title ?? named?.title ?? null, author: meta ? meta.author ?? null : named?.author ?? null,
        onShelf: !!meta, finishedAt: finishedAt(records), rating: latestReview(records).rating });
    }
    return { days: await readingDays(null, null), books };
  }

  /** @param {IncomingMessage} req @param {ServerResponse} res @param {string} pathname @param {string|null} origin */
  async function handle(req, res, pathname, origin) {
    try {
      if (!allowed(req, origin)) { send(res, 403, { error: '请求来源不允许。' }); return; }
      await ready;
      const parts = pathname.slice('/api/library'.length).split('/').filter(Boolean);
      const { method } = req;
      if (!parts.length) {
        if (method !== 'GET') throw fail(405, '不支持的操作。');
        send(res, 200, { books: await list() });
        return;
      }
      // Book keys start with a letter, so names starting with _ never meet a book.
      if (parts[0] === '_home') {
        const route = `${method} ${parts.slice(1).join('/')}`;
        if (route === 'GET ') { send(res, 200, await homeSettings()); return; }
        if (route === 'PUT ') { send(res, 200, await serial('_home', async () => putHome(JSON.parse((await readBody(req, MB)).toString('utf8'))))); return; }
        if (route === 'PUT background') { const body = await readBody(req, IMAGE_LIMIT); send(res, 200, await serial('_home', () => putBackground(body))); return; }
        if (route === 'GET background') {
          const custom = (await homeSettings()).background.custom;
          const data = custom && await home?.read(`background.${COVER_TYPES[custom.type]}`);
          if (!custom || !data) throw fail(404, '没有背景图片。');
          // Addressed by its upload time (?v=at), so a cached copy never goes stale.
          res.writeHead(200, { 'Content-Type': custom.type, 'Content-Length': data.length, 'Cache-Control': 'private, max-age=31536000, immutable' }).end(data);
          return;
        }
        throw fail(404, '不支持的操作。');
      }
      if (parts.length === 1 && parts[0] === '_stats') {
        if (method !== 'GET') throw fail(405, '不支持的操作。');
        send(res, 200, await stats());
        return;
      }
      if (parts.length === 1 && parts[0] === '_days') {
        if (method !== 'GET') throw fail(405, '不支持的操作。');
        const query = new URL(req.url ?? '', 'http://localhost').searchParams;
        const from = query.get('from'), to = query.get('to');
        if ((from !== null && !DAY.test(from)) || (to !== null && !DAY.test(to))) throw fail(400, '日期无效。');
        send(res, 200, { days: await readingDays(from, to) });
        return;
      }
      const [key, action, ...rest] = parts;
      if (!KEY.test(key)) throw fail(400, '无效作品编号。');
      const route = `${method} ${action || ''}`;
      if (route === 'GET package') { await sendPackage(res, key); return; }
      if (route === 'GET story') {
        const text = await content.read(key, 'package/story.vn.txt');
        if (!text) throw fail(404, '书架上没有这本作品。');
        send(res, 200, text.toString('utf8'), 'text/plain; charset=utf-8');
        return;
      }
      if (route === 'GET file') { await sendFile(req, res, key, rest.join('/')); return; }
      if (route === 'GET assets') { send(res, 200, { assets: await assets(key) }); return; }
      if (route === 'PUT asset') {
        const body = await readBody(req, rest[1] === 'audio' ? AUDIO_LIMIT : IMAGE_LIMIT);
        await serial(key, () => putAsset(key, rest.join('/'), body));
        send(res, 200, { ok: true });
        return;
      }
      if (route === 'POST commit') {
        const body = JSON.parse((await readBody(req, 40 * MB)).toString('utf8'));
        send(res, 200, await serial(key, () => commit(key, body)));
        return;
      }
      // updatedAt tells a page whether the copy it kept from an earlier open is still the shelf's version.
      if (route === 'GET progress') {
        const meta = await readJSON(key, 'meta.json');
        send(res, 200, { progress: latestPosition(await reading.positions(key)), updatedAt: meta?.updatedAt ?? null });
        return;
      }
      if (route === 'PUT progress') {
        const value = JSON.parse((await readBody(req, MB)).toString('utf8'));
        if (!value || typeof value !== 'object' || !Number.isInteger(value.index) || typeof value.device !== 'string' || !DEVICE.test(value.device)) {
          throw fail(400, '阅读进度无效。');
        }
        // savedAt lets a page tell its own last save from a later one made on another device.
        const savedAt = await serial(key, async () => {
          /** @type {BookMeta|null} */
          const meta = await readJSON(key, 'meta.json');
          if (!meta) throw fail(404, '书架上没有这本作品。');
          // A position in a text that another import replaced means nothing in the new one.
          if (value.version !== undefined && value.version !== meta.updatedAt) throw fail(409, '作品已在别处更新，请回到书架重新打开。');
          const now = Date.now();
          await reading.putPosition(key, value.device, { ...value, savedAt: now });
          // Reaching the end once finishes the book for good; turning back afterwards does not undo it.
          if (atEnd(value, meta)) await markFinished(key, value.device, now);
          return now;
        });
        send(res, 200, { ok: true, savedAt });
        return;
      }
      if (route === 'GET record') { send(res, 200, await bookRecord(key)); return; }
      if (route === 'PUT review') {
        const value = JSON.parse((await readBody(req, MB)).toString('utf8'));
        const { device, rating, review } = value ?? {};
        if (typeof device !== 'string' || !DEVICE.test(device) || !(rating === null || RATING(rating)) || typeof review !== 'string' || review.length > REVIEW_LIMIT) {
          throw fail(400, '评分或短评无效。');
        }
        await serial(key, () => putReview(key, device, rating, review.trim()));
        send(res, 200, await bookRecord(key));
        return;
      }
      if (route === 'PUT session') {
        const value = JSON.parse((await readBody(req, MB)).toString('utf8'));
        if (typeof value?.device !== 'string' || !DEVICE.test(value.device)) throw fail(400, '阅读记录无效。');
        const session = checkSession(value.session);
        await serial(key, () => putSession(key, value.device, session));
        send(res, 200, { ok: true });
        return;
      }
      if (route === 'PUT info') {
        const value = JSON.parse((await readBody(req, MB)).toString('utf8'));
        send(res, 200, await serial(key, () => putInfo(key, value)));
        return;
      }
      if (route === 'GET cover') { const { type, data } = await cover(key); send(res, 200, data, type); return; }
      if (route === 'PUT cover') {
        const body = await readBody(req, 4 * MB);
        const id = new URL(req.url ?? '', 'http://localhost').searchParams.get('id');
        await serial(key, () => putCover(key, id, req.headers['content-type'], body));
        send(res, 200, { ok: true });
        return;
      }
      if (route === 'DELETE ') { await serial(key, () => remove(key)); send(res, 200, { ok: true }); return; }
      throw fail(404, '不支持的操作。');
    } catch (/** @type {any} */ error) {
      // A failure in the middle of a streamed download can only cut the response off.
      if (res.headersSent) { res.destroy(error); return; }
      const known = error.status || error instanceof SyntaxError;
      send(res, error.status || (known ? 400 : 500), { error: known ? error.message : '书架存储失败。' });
    }
  }
  return { handle };
}
