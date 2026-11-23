// @ts-check
import { mkdir, readFile, writeFile, rename, readdir, rm, stat, open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';

/** @import {Readable} from 'node:stream' */
/** @import {DeviceSessions,Progress,ReadingRecord} from '../types/library.js' */

/* Where the bookshelf keeps its two kinds of data, behind one interface so another backend (WebDAV) can replace the disk:
 * - content: each book's files (package tree, meta.json, cover), written only when a book is imported or replaced;
 * - reading: each book's reading data (positions, reading sessions and records), written while someone reads. It is kept per
 *   device, each device writing only its own records, and outlives the book's content when the book is removed;
 * - home: the shelf's own files, such as the home page background, apart from any book.
 * Names are paths inside a book, such as `meta.json` or `package/assets/backgrounds/<sha>.webp`; callers check them,
 * as they check book keys and device ids. */

/**
 * @typedef {object} ContentStore
 * @property {()=>Promise<string[]>} keys Book keys present.
 * @property {(key:string,name:string)=>Promise<Buffer|null>} read
 * @property {(key:string,name:string,length:number)=>Promise<Buffer|null>} head The first bytes of a file.
 * @property {(key:string,name:string)=>Promise<{size:number,stream:()=>Readable}|null>} open A file to stream, with its size.
 * @property {(key:string,name:string,data:string|Uint8Array)=>Promise<void>} write Replaces the file as a whole.
 * @property {(key:string,name:string)=>Promise<boolean>} has
 * @property {(key:string,folder:string)=>Promise<string[]>} list File names directly inside a folder of the book.
 * @property {(key:string,name:string)=>Promise<void>} remove
 * @property {(key:string)=>Promise<void>} discard Takes the whole book off the shelf, keeping it recoverable.
 */
/**
 * @typedef {object} ReadingStore
 * @property {()=>Promise<string[]>} keys Book keys with reading data, removed books included.
 * @property {(key:string)=>Promise<Progress[]>} positions Each device's last position in the book.
 * @property {(key:string,device:string,value:Progress)=>Promise<void>} putPosition
 * @property {(key:string)=>Promise<void>} clearPositions Forgets every device's position, keeping the sessions.
 * @property {(key:string)=>Promise<DeviceSessions[]>} sessions
 * @property {(key:string,device:string)=>Promise<DeviceSessions|null>} deviceSessions
 * @property {(key:string,value:DeviceSessions)=>Promise<void>} putSessions Replaces the device's file as a whole.
 * @property {(key:string)=>Promise<ReadingRecord[]>} records Each device's record of the book (finished, later rating).
 * @property {(key:string,value:ReadingRecord)=>Promise<void>} putRecord Replaces the device's record as a whole.
 */

/** @param {string} file @param {string|Uint8Array} data */
async function writeAtomic(file, data) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(temp, data);
  await rename(temp, file);
}

/**
 * @typedef {object} HomeStore
 * @property {(name:string)=>Promise<Buffer|null>} read
 * @property {(name:string,data:string|Uint8Array)=>Promise<void>} write
 * @property {(name:string)=>Promise<void>} remove
 */

/** @param {string} folder @returns {Promise<any[]>} */
async function readAll(folder) {
  const names = (await readdir(folder).catch(() => [])).filter(name => name.endsWith('.json'));
  const values = await Promise.all(names.map(name => readFile(path.join(folder, name), 'utf8').then(JSON.parse).catch(() => null)));
  return values.filter(Boolean);
}

/* The shelf on disk: one folder per book key, removed books move to .trash; reading data sits apart under
 * .reading/<key>/{progress,sessions,records}/<device>.json; the shelf's own files under .home/. */
/** @param {string} root @returns {{root:string,content:ContentStore,reading:ReadingStore,home:HomeStore,migrate:()=>Promise<void>}} */
export function createDiskStorage(root) {
  const file = (/** @type {string} */ key, /** @type {string} */ name) => path.join(root, key, ...name.split('/'));
  const readingDir = path.join(root, '.reading');
  const own = (/** @type {string} */ key, /** @type {string} */ kind, /** @type {string} */ device) => path.join(readingDir, key, kind, `${device}.json`);
  /** @type {ContentStore} */
  const content = {
    async keys() {
      await mkdir(root, { recursive: true });
      return (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name);
    },
    read: (key, name) => readFile(file(key, name)).catch(() => null),
    async head(key, name, length) {
      const handle = await open(file(key, name)).catch(() => null);
      if (!handle) return null;
      try { const { buffer, bytesRead } = await handle.read(Buffer.alloc(length), 0, length, 0); return buffer.subarray(0, bytesRead); }
      finally { await handle.close(); }
    },
    async open(key, name) {
      const info = await stat(file(key, name)).catch(() => null);
      return info?.isFile() ? { size: info.size, stream: () => createReadStream(file(key, name)) } : null;
    },
    write: (key, name, data) => writeAtomic(file(key, name), data),
    has: (key, name) => stat(file(key, name)).then(() => true, () => false),
    list: (key, folder) => readdir(file(key, folder)).catch(() => []),
    remove: (key, name) => rm(file(key, name), { force: true }),
    async discard(key) {
      await mkdir(path.join(root, '.trash'), { recursive: true });
      await rename(path.join(root, key), path.join(root, '.trash', `${key}-${Date.now()}`));
    },
  };
  /** @type {ReadingStore} */
  const reading = {
    keys: () => readdir(readingDir, { withFileTypes: true }).then(entries => entries.filter(entry => entry.isDirectory()).map(entry => entry.name), () => []),
    positions: key => readAll(path.join(readingDir, key, 'progress')),
    putPosition: (key, device, value) => writeAtomic(own(key, 'progress', device), JSON.stringify(value)),
    clearPositions: key => rm(path.join(readingDir, key, 'progress'), { recursive: true, force: true }),
    sessions: key => readAll(path.join(readingDir, key, 'sessions')),
    deviceSessions: (key, device) => readFile(own(key, 'sessions', device), 'utf8').then(JSON.parse).catch(() => null),
    putSessions: (key, value) => writeAtomic(own(key, 'sessions', value.device), JSON.stringify(value)),
    records: key => readAll(path.join(readingDir, key, 'records')),
    putRecord: (key, value) => writeAtomic(own(key, 'records', value.device), JSON.stringify(value)),
  };
  const homeFile = (/** @type {string} */ name) => path.join(root, '.home', name);
  /** @type {HomeStore} */
  const home = {
    read: name => readFile(homeFile(name)).catch(() => null),
    write: (name, data) => writeAtomic(homeFile(name), data),
    remove: name => rm(homeFile(name), { force: true }),
  };
  // Shelves from before reading data moved out kept one progress.json in each book folder; it becomes the position
  // of a device named "migrated". Runs once when the shelf opens.
  async function migrate() {
    for (const key of await content.keys()) {
      const old = file(key, 'progress.json');
      const value = await readFile(old, 'utf8').then(JSON.parse).catch(() => undefined);
      if (value === undefined) continue;
      if (value && typeof value === 'object') await writeAtomic(own(key, 'progress', 'migrated'), JSON.stringify({ ...value, device: 'migrated' }));
      await rm(old, { force: true });
    }
  }
  return { root, content, reading, home, migrate };
}
