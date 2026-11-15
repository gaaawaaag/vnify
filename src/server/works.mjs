// @ts-check
/** @import {IncomingMessage,ServerResponse} from 'node:http' */
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { loadDirectorProject } from '../production/director-project.js';
import { assetCatalog } from '../production/asset-catalog.js';
import {
  findWorks, bindImage, removeImage, adjustPortrait, editDescription, editStature, editStyles, setPromptOverride, exportWork, setExportImages, setImageRatio,
  createDirectorProject, importPackage, setBookInfo,
} from '../production/director-edits.js';
import { readDirectors } from '../core/director.js';
import { parseScript } from '../core/parser.js';
import { importStoryPackage } from '../reader/story-package.js';
import { fixedStylesOf } from '../conversion/director.js';
import { fail, readBody, send } from './http.mjs';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createGeneration } from './generation.mjs';
import { readGenerated, historyOf } from '../production/generation-log.js';
import { validateImageScheme } from '../production/image-presets.js';
import { hasBackground } from '../production/image-generation.js';
import { validateExportImages } from '../production/webp.js';

const IMAGE_BODY = 25 * 1024 * 1024, PACKAGE_BODY = 1024 * 1024 * 1024, JSON_BODY = 1024 * 1024;

/* The asset manager's works: every folder under works/ with a director project, or with a finished text or package
 * that becomes one when opened. A loaded project is kept until its project file changes. */
/** @param {string} root the production folder @param {() => Promise<any[]>} presets the image service presets */
export function createWorks(root, presets) {
  const worksDir = path.join(root, 'works');
  /** @type {Map<string,{stamp:number,loaded:any,catalog:any[]}>} */
  const cache = new Map();
  // Changes to one project run one after another, so two quick edits never write over each other.
  /** @type {Map<string,Promise<unknown>>} */
  const queues = new Map();
  /** @template T @param {string} key @param {() => Promise<T>} task @returns {Promise<T>} */
  function serial(key, task) {
    const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(task);
    queues.set(key, next);
    return next;
  }
  /** @param {string} id */
  async function work(id) {
    const found = (await findWorks(worksDir)).find(w => w.id === id);
    if (!found) throw fail(404, '没有这部作品。');
    return found;
  }
  /** @param {string} projectPath */
  async function load(projectPath) {
    const stamp = (await stat(projectPath)).mtimeMs, hit = cache.get(projectPath);
    if (hit && hit.stamp === stamp) return hit;
    return remember(projectPath, await loadDirectorProject(projectPath), stamp);
  }
  /* Keeps a project just loaded, such as the one a binding checked before writing it, so the next read does not
   * load the whole work again. @param {string} projectPath @param {any} loaded @param {number} [stamp] */
  async function remember(projectPath, loaded, stamp) {
    stamp ??= (await stat(projectPath)).mtimeMs;
    const docs = readDirectors(/** @type {string} */ (loaded.job.readableOutput), loaded.story);
    const entry = { stamp, loaded, catalog: assetCatalog({ ...loaded, docs }) };
    cache.set(projectPath, entry);
    return entry;
  }
  /** @param {any} loaded @param {any[]} catalog */
  function summary(loaded, catalog) {
    // Images the director wrote no prompt for are not missing: they count only once a picture is uploaded.
    const images = catalog.flatMap(e => e.images).filter(i => i.prompt !== null || i.bound), records = loaded.job.records;
    const cover = catalog.find(e => e.cat === 'cover')?.images[0].bound?.imageId ?? null;
    return {
      title: loaded.story.book.title, author: loaded.story.book.author, chapters: loaded.story.chapters.length, ratio: loaded.generation.ratio ?? '16:9',
      bound: images.filter(i => i.bound).length, total: images.length, cover,
      directors: { saved: records.filter((/** @type {any} */ r) => r.directorSaved).length, total: records.length },
    };
  }
  async function list() {
    const works = [];
    for (const found of await findWorks(worksDir)) {
      try {
        if (found.projectPath) {
          const { loaded, catalog } = await load(found.projectPath);
          works.push({ id: found.id, updated: found.updated, ...summary(loaded, catalog) });
        } else {
          const file = path.join(/** @type {string} */ (found.dir), /** @type {string} */ (found.input)), bytes = await readFile(file);
          const raw = file.toLowerCase().endsWith('.vn.zip') ? (await importStoryPackage(new Blob([bytes]))).raw : bytes.toString('utf8');
          const story = parseScript(raw);
          works.push({ id: found.id, updated: found.updated, textOnly: true, input: found.input, title: story.book.title, chapters: story.chapters.length });
        }
      } catch (/** @type {any} */ error) { works.push({ id: found.id, updated: found.updated, error: error.message }); }
    }
    return works.sort((a, b) => b.updated - a.updated);
  }
  /** @param {string} projectPath @param {string} id */
  async function detail(projectPath, id) {
    const { loaded, catalog: base } = await load(projectPath);
    // Each image carries its generation history; the scheme says which preset draws each use.
    const log = await readGenerated(projectPath);
    const catalog = [];
    for (const asset of base) catalog.push({ ...asset, images: await Promise.all(asset.images.map(async (/** @type {any} */ image) => ({
      ...image, history: historyOf(log, image.key),
      ...(asset.cat === 'character' && image.bound ? { bound: { ...image.bound, background: await backgroundOf(loaded, image.bound.imageId) } } : {}),
    }))) });
    const scheme = validateImageScheme(loaded.project.imageScheme, await presets());
    const styles = loaded.job.artStyle ?? { background: '', character: '' }, fixed = fixedStylesOf(loaded.job.director);
    const status = loaded.job.records.map((/** @type {any} */ r, /** @type {number} */ i) => ({
      chapterId: loaded.job.plan[i].chapter.id, title: loaded.job.plan[i].chapter.title, saved: r.directorSaved,
    }));
    return { id, ...summary(loaded, catalog), chapterList: status, styles, fixedStyles: Object.keys(fixed), catalog, scheme,
      exportImages: validateExportImages(loaded.project.exportImages),
      queue: generation.state(projectPath) };
  }
  // Whether a bound portrait still has a background, remembered per picture (the check decodes the PNG).
  /** @type {Map<string,boolean|null>} */
  const backgrounds = new Map();
  /** @param {any} loaded @param {string} imageId */
  async function backgroundOf(loaded, imageId) {
    if (!backgrounds.has(imageId)) {
      const stored = loaded.characterImages.images[imageId];
      backgrounds.set(imageId, stored?.blob ? hasBackground(new Uint8Array(await stored.blob.arrayBuffer())) : null);
    }
    return backgrounds.get(imageId);
  }
  const generation = createGeneration({ presets, load, serial, refresh: remember });
  /** The work's scheme, kept in its project file. @param {string} projectPath @param {unknown} value */
  async function saveScheme(projectPath, value) {
    const scheme = validateImageScheme(value, await presets());
    const project = JSON.parse(await readFile(projectPath, 'utf8')), temp = `${projectPath}.${process.pid}.tmp`;
    project.imageScheme = scheme;
    await writeFile(temp, JSON.stringify(project, null, 2) + '\n');await rename(temp, projectPath);
  }

  /** @param {IncomingMessage} req @param {ServerResponse} res @param {string} route the path after /works */
  async function handle(req, res, route) {
    const method = req.method ?? 'GET';
    if (method === 'GET' && route === '') { send(res, 200, await list()); return; }
    if (method === 'POST' && route === '/import') {
      const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'work.vn.zip'));
      if (!/\.vn\.zip$/i.test(name)) throw fail(400, '请选择 .vn.zip 作品包。');
      const id = await importPackage(worksDir, name, new Uint8Array(await readBody(req, PACKAGE_BODY)));
      send(res, 200, { id });
      return;
    }
    const match = /^\/([^/]+)(\/.*)?$/.exec(route);
    if (!match) throw fail(404, '不支持的操作。');
    const id = decodeURIComponent(match[1]), action = match[2] ?? '', found = await work(id);
    if (method === 'POST' && action === '/open') {
      if (!found.projectPath) await createDirectorProject(/** @type {string} */ (found.dir), /** @type {string} */ (found.input));
      send(res, 200, { id });
      return;
    }
    if (!found.projectPath) throw fail(409, '这部作品还没有导演清单，先打开它。');
    const projectPath = found.projectPath;
    if (method === 'GET' && action === '') { send(res, 200, await detail(projectPath, id)); return; }
    if (method === 'GET' && action === '/queue') { send(res, 200, { queue: generation.state(projectPath) }); return; }
    if (method === 'POST' && action === '/generate') {
      const body = JSON.parse((await readBody(req, JSON_BODY)).toString('utf8'));
      send(res, 200, { queue: await generation.start(projectPath, body.keys, { task: body.task, method: body.method }) });
      return;
    }
    const control = /^\/queue\/(pause|resume|retry|cancel|close)$/.exec(action);
    if (method === 'POST' && control) { send(res, 200, { queue: generation.control(projectPath, control[1]) }); return; }
    const image = /^\/images\/([a-f0-9]{64})$/.exec(action);
    if (method === 'GET' && image) {
      const { loaded } = await load(projectPath);
      const stored = loaded.backgrounds.images[image[1]] ?? loaded.characterImages.images[image[1]];
      if (!stored?.blob) throw fail(404, '没有这张图片。');
      const bytes = new Uint8Array(await stored.blob.arrayBuffer());
      res.writeHead(200, { 'Content-Type': stored.type, 'Content-Length': bytes.length, 'Cache-Control': 'private, max-age=31536000, immutable' }).end(bytes);
      return;
    }
    if (method !== 'POST') throw fail(404, '不支持的操作。');
    const payload = action === '/bind' ? await readBody(req, IMAGE_BODY) : await readBody(req, JSON_BODY);
    await serial(projectPath, () => change(req, res, id, projectPath, action, payload));
  }
  /** @param {IncomingMessage} req @param {ServerResponse} res @param {string} id @param {string} projectPath @param {string} action @param {Buffer|null} payload */
  async function change(req, res, id, projectPath, action, payload) {
    const json = () => JSON.parse(/** @type {Buffer} */ (payload).toString('utf8'));
    if (action === '/bind') {
      const target = JSON.parse(decodeURIComponent(String(req.headers['x-target'] ?? '')));
      await bindImage(projectPath, target, new Uint8Array(/** @type {Buffer} */ (payload)));
    } else if (action === '/remove') await removeImage(projectPath, json().target);
    else if (action === '/adjust') { const b = json(); await adjustPortrait(projectPath, b.target, b); }
    else if (action === '/description') { const b = json(); await editDescription(projectPath, b.edit, b.value); }
    else if (action === '/stature') { const b = json(); await editStature(projectPath, b.edit, b.value); }
    else if (action === '/prompt') { const b = json(); await setPromptOverride(projectPath, b.key, b.text ?? null); }
    else if (action === '/styles') await editStyles(projectPath, json());
    else if (action === '/book') await setBookInfo(projectPath, json());
    else if (action === '/scheme') await saveScheme(projectPath, json());
    else if (action === '/ratio') {
      // The queue draws at the size it was started with; the canvas changes only between runs.
      if (generation.state(projectPath)?.running) throw fail(409, '队列运行中，结束后再改出图比例。');
      await setImageRatio(projectPath, json().ratio);
    }
    else if (action === '/restore') { const b = json(); await generation.restore(projectPath, b.key, b.imageId); }
    else if (action === '/export') {
      // The image setting chosen beside the button is the work's from now on.
      await setExportImages(projectPath, json().images);cache.delete(projectPath);
      const { loaded } = await load(projectPath);
      const name = (loaded.story.book.title || id).replace(/[\\/:*?"<>|]+/g, '_');
      const { out, stats } = await exportWork(projectPath, path.join(path.dirname(path.dirname(projectPath)), 'export', `${name}.vn.zip`));
      // Portraits still on a solid colour are worth a reminder: the player shows them as rectangles.
      const solid = (await detail(projectPath, id)).catalog.filter(a => a.cat === 'character').flatMap(a => a.images).filter(i => i.bound?.background).length;
      send(res, 200, { file: path.relative(root, out).split(path.sep).join('/'), solid, images: stats, detail: await detail(projectPath, id) });
      return;
    } else throw fail(404, '不支持的操作。');
    cache.delete(projectPath);
    send(res, 200, await detail(projectPath, id));
  }
  return { handle };
}
