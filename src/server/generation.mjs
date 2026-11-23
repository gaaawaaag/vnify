// @ts-check
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { drawImage, planDrawing, cutoutPortrait } from '../production/image-generation.js';
import { presetName } from '../production/image-presets.js';
import { imageUse, validateImageScheme } from '../production/image-presets.js';
import { bindImage, adjustPortrait } from '../production/director-edits.js';
import { imageSize as imageSizeOf } from '../production/image-size.js';
import { readGenerated, appendGenerated } from '../production/generation-log.js';
import { getSecrets } from '../production/secrets.js';
import { fail } from './http.mjs';

/* The generation queue of each work, run in the local server one picture at a time. Each picture is drawn with its
 * own preset (the work's scheme, or the image's override), bound as soon as it is done and logged in generated.json.
 * A failure is recorded and the queue goes on; the page polls the state. Each picture's stages are timed in the server log.
 * refresh keeps the project a binding just loaded, so the next picture does not read the whole work again.
 * scripts/draw-images.mjs runs the same queue, so the agent draws with the workbench's settings exactly as the page does. */
/**
 * @param {{presets:()=>Promise<any[]>,load:(projectPath:string)=>Promise<{loaded:any,catalog:any[]}>,
 *   serial:<T>(key:string,task:()=>Promise<T>)=>Promise<T>,refresh:(projectPath:string,loaded:any)=>Promise<unknown>}} deps
 */
export function createGeneration({ presets, load, serial, refresh }) {
  /** @type {Map<string,any>} */
  const queues = new Map();
  const view = (/** @type {any} */ q) => q && {
    running: q.running, paused: q.paused,
    items: q.items.map((/** @type {any} */ i) => ({ key: i.key, name: i.name, preset: i.presetName, size: i.size, note: i.note, state: i.state, error: i.error })),
  };
  /* A CG's cast in the director's order, each with the bound portrait to send when the scheme sends them as references:
   * the portrait for the variant worn at the CG's start, or the default one. */
  /** @param {any[]} catalog @param {any} scheme @param {any} asset @returns {{name:string,look:string,imageId:string|null}[]} */
  function castOf(catalog, scheme, asset) {
    if (asset.cat !== 'cg') return [];
    return (asset.cast ?? []).map((/** @type {any} */ c) => {
      const images = catalog.find(a => a.key === `character:${c.id}`)?.images ?? [];
      const bound = (c.variantId && images.find((/** @type {any} */ i) => i.variantId === c.variantId)?.bound) || images[0]?.bound;
      return { name: c.label, look: c.look, imageId: scheme.cgReferences && bound ? bound.imageId : null };
    });
  }
  /** Where an image is, and the preset that draws it. @param {any[]} catalog @param {any} scheme @param {any[]} all @param {string} key */
  function locate(catalog, scheme, all, key) {
    for (const asset of catalog) for (const image of asset.images) if (image.key === key) {
      const id = scheme.overrides[key] ?? scheme.uses[imageUse(asset, image)];
      return { asset, image, preset: all.find(p => p.id === id) ?? null };
    }
    return null;
  }
  /* task 'draw' draws each image; 'cutout' removes the background of bound portraits (method: 'program' or a
   * background-removal preset's ID). */
  /** @param {string} projectPath @param {string[]} keys @param {{task?:'draw'|'cutout',method?:string}} [options] */
  async function start(projectPath, keys, { task = 'draw', method = 'program' } = {}) {
    if (queues.get(projectPath)?.running) throw fail(409, '这部作品的队列还在运行。');
    if (!Array.isArray(keys) || !keys.length || keys.some(k => typeof k !== 'string')) throw fail(400, '没有要生成的图片。');
    const all = await presets(), { loaded, catalog } = await load(projectPath);
    const scheme = validateImageScheme(loaded.project.imageScheme, all);
    if (task === 'cutout') {
      const remover = method === 'program' ? 'program' : all.find(p => p.id === method && p.uses.includes('cutout'));
      if (!remover) throw fail(400, '没有这个去背预设。');
      const label = remover === 'program' ? '程序去背' : presetName(remover);
      const items = keys.map(key => {
        const image = catalog.flatMap(a => a.images.map((/** @type {any} */ i) => ({ asset: a, image: i }))).find(x => x.image.key === key);
        if (!image || image.asset.cat !== 'character' || !image.image.bound) throw fail(400, `${key}：只有已绑定的立绘可以去背。`);
        return { key, task, method, name: image.asset.name + (image.image.variantId ? ` · ${image.image.name}` : ''), presetName: label,
          size: `${image.image.bound.width}×${image.image.bound.height}`, note: '去背', state: 'waiting', error: '' };
      });
      const queue = { running: true, paused: false, items, controller: new AbortController() };
      queues.set(projectPath, queue);
      queue.done = run(projectPath, queue);
      return view(queue);
    }
    const items = keys.map(key => {
      const found = locate(catalog, scheme, all, key);
      if (!found) throw fail(400, `没有这张图：${key}`);
      if (!found.preset) throw fail(400, `${found.asset.name}：生图方案里没有对应的预设。`);
      const cast = castOf(catalog, scheme, found.asset).map(c => ({ name: c.name, look: c.look, picture: !!c.imageId }));
      const plan = (() => { try { return planDrawing({ preset: found.preset, asset: found.asset, image: found.image, cast }); } catch (/** @type {any} */ e) { throw fail(400, `${found.asset.name}：${e.message}`); } })();
      return { key, name: found.asset.name + (found.image.variantId ? ` · ${found.image.name}` : ''), presetName: plan.presetName,
        size: found.preset.source === 'openai' && found.preset.openai.protocol === 'chat' ? plan.ratio : `${plan.width}×${plan.height}`,
        note: found.image.variantId ? '以默认图为底（编辑不可用时重新生成）' : plan.references.length ? `参考：${plan.references.join('、')}` : '', state: 'waiting', error: '' };
    });
    const queue = { running: true, paused: false, items, controller: new AbortController() };
    queues.set(projectPath, queue);
    queue.done = run(projectPath, queue);
    return view(queue);
  }
  /** @param {string} projectPath @param {any} queue */
  async function run(projectPath, queue) {
    const keys = await getSecrets();
    for (;;) {
      if (queue.paused || queue.controller.signal.aborted) break;
      const item = queue.items.find((/** @type {any} */ i) => i.state === 'waiting');
      if (!item) break;
      item.state = 'running';
      const watch = stopwatch();
      try { await draw(projectPath, item, keys, queue.controller.signal, watch.mark); item.state = 'done'; }
      catch (/** @type {any} */ error) {
        if (error.name === 'AbortError') { item.state = 'waiting'; break; }
        item.state = error.skip ? 'skipped' : 'failed'; item.error = error.message;
      }
      finally { console.log(`[生图] ${item.name}${item.state === 'done' ? '' : `（${item.state}）`}：${watch.report()}`); }
    }
    queue.running = false;
  }
  /** @param {string} projectPath @param {any} item @param {any} keys @param {AbortSignal} signal @param {(stage:string)=>void} mark */
  async function draw(projectPath, item, keys, signal, mark) {
    if (item.task === 'cutout') return removeBackground(projectPath, item, keys, signal, mark);
    const all = await presets(), { loaded, catalog } = await load(projectPath);
    const scheme = validateImageScheme(loaded.project.imageScheme, all), found = locate(catalog, scheme, all, item.key);
    if (!found?.preset) throw new Error('生图方案里已没有对应的预设。');
    const { asset, image, preset } = found;
    // A variant is drawn from its default picture, with the seed that picture was made with.
    /** @type {{bytes:Uint8Array,seed:number|null}|null} */
    let base = null;
    if (image.variantId) {
      const bound = asset.images[0].bound;
      if (!bound) throw Object.assign(new Error('默认图还没有'), { skip: true });
      const stored = loaded.backgrounds.images[bound.imageId] ?? loaded.characterImages.images[bound.imageId];
      const log = await readGenerated(projectPath);
      base = { bytes: new Uint8Array(await stored.blob.arrayBuffer()), seed: log.findLast(e => e.imageId === bound.imageId)?.seed ?? null };
    }
    const cast = await Promise.all(castOf(catalog, scheme, asset).map(async c => ({ name: c.name, look: c.look,
      bytes: c.imageId ? new Uint8Array(await loaded.characterImages.images[c.imageId].blob.arrayBuffer()) : null })));
    const cutout = ['program', 'none'].includes(scheme.cutout) ? scheme.cutout : all.find(p => p.id === scheme.cutout) ?? 'program';
    mark('载入作品');
    const result = await drawImage({ preset, cutout, asset, image, base, cast, keys, signal, mark });
    const imageId = createHash('sha256').update(result.bytes).digest('hex');
    await serial(projectPath, async () => {
      const { file, ...bound } = await bindImage(projectPath, image.target, result.bytes,
        { mode: result.mode, sentPrompt: result.prompt, seed: result.seed, preset: result.presetName });
      await appendGenerated(projectPath, { key: image.key, imageId, file, preset: result.presetName, model: result.presetModel, mode: result.mode, seed: result.seed,
        prompt: result.prompt, negative: result.negative, width: result.width, height: result.height, cutout: result.cutoutWith,
        ...(result.references.length ? { references: result.references } : {}), time: new Date().toISOString() });
      await refresh(projectPath, bound);
    });
    mark('写入作品');
  }
  // Removes the background of a bound portrait; the solid one stays in the history.
  /** @param {string} projectPath @param {any} item @param {any} keys @param {AbortSignal} signal @param {(stage:string)=>void} mark */
  async function removeBackground(projectPath, item, keys, signal, mark) {
    const all = await presets(), { loaded, catalog } = await load(projectPath);
    const image = catalog.flatMap(a => a.images).find(i => i.key === item.key), bound = image?.bound;
    if (!bound) throw Object.assign(new Error('这张立绘已没有图片'), { skip: true });
    const stored = loaded.characterImages.images[bound.imageId];
    const remover = item.method === 'program' ? 'program' : all.find(p => p.id === item.method);
    mark('载入作品');
    const bytes = await cutoutPortrait(remover, new Uint8Array(await stored.blob.arrayBuffer()), keys, signal);
    mark('去背');
    const imageId = createHash('sha256').update(bytes).digest('hex'), log = await readGenerated(projectPath);
    const before = log.findLast(e => e.imageId === bound.imageId);
    await serial(projectPath, async () => {
      // A portrait keeps the facing it had; the avatar square is worked out again.
      const { file, ...done } = await bindImage(projectPath, image.target, bytes, { mode: 'cutout', ...(before ? { seed: before.seed, preset: before.preset } : {}) });
      const latest = bound.flip ? await adjustAfter(projectPath, image.target, bound) : done;
      const size = imageSizeOf(bytes);
      await appendGenerated(projectPath, { key: image.key, imageId, file, preset: before?.preset ?? '', ...(before?.model ? { model: before.model } : {}), mode: 'cutout', seed: before?.seed ?? null,
        prompt: before?.prompt ?? '', negative: before?.negative ?? '', ...size, cutout: item.method === 'program' ? 'program' : item.presetName,
        time: new Date().toISOString() });
      await refresh(projectPath, latest);
    });
    mark('写入作品');
  }
  /** @param {string} projectPath @param {string} action */
  function control(projectPath, action) {
    const queue = queues.get(projectPath);
    if (!queue) throw fail(404, '没有队列。');
    if (action === 'pause') queue.paused = true;
    else if (action === 'resume' || action === 'retry') {
      if (action === 'retry') for (const item of queue.items) if (item.state === 'failed') { item.state = 'waiting'; item.error = ''; }
      queue.paused = false;
      if (!queue.running) { queue.running = true; queue.controller = new AbortController(); queue.done = run(projectPath, queue); }
    } else if (action === 'cancel') { queue.controller.abort(); queue.paused = true; }
    else if (action === 'close') { if (queue.running) throw fail(409, '队列还在运行，先暂停或取消。'); queues.delete(projectPath); }
    else throw fail(404, '不支持的操作。');
    return view(queues.get(projectPath));
  }
  /** Puts an earlier generated picture back. @param {string} projectPath @param {string} key @param {string} imageId */
  async function restore(projectPath, key, imageId) {
    const entry = (await readGenerated(projectPath)).findLast(e => e.key === key && e.imageId === imageId);
    if (!entry) throw fail(404, '生成记录里没有这张图。');
    const { catalog } = await load(projectPath), image = catalog.flatMap(a => a.images).find(i => i.key === key);
    if (!image) throw fail(404, '没有这张图。');
    const bytes = new Uint8Array(await readFile(path.resolve(path.dirname(projectPath), entry.file)));
    const { file, ...loaded } = await bindImage(projectPath, image.target, bytes, { mode: entry.mode, sentPrompt: entry.prompt, seed: entry.seed, preset: entry.preset });
    await refresh(projectPath, loaded);
  }
  // How long each stage of one picture took, for the server log; stages under 50 ms are left out.
  function stopwatch() {
    const start = performance.now(), parts = /** @type {[string,number][]} */ ([]);
    let last = start;
    const seconds = (/** @type {number} */ ms) => `${(ms / 1000).toFixed(1)}s`;
    return {
      mark: (/** @type {string} */ stage) => { const now = performance.now(); parts.push([stage, now - last]); last = now; },
      report: () => [...parts.filter(([, ms]) => ms >= 50).map(([stage, ms]) => `${stage} ${seconds(ms)}`), `合计 ${seconds(performance.now() - start)}`].join(' · '),
    };
  }
  /** @param {string} projectPath @param {any} target @param {any} bound */
  const adjustAfter = (projectPath, target, bound) => adjustPortrait(projectPath, target, { flip: bound.flip });
  // Resolves when the queue stops (done, paused or cancelled), for a command-line run.
  const wait = async (/** @type {string} */ projectPath) => { await queues.get(projectPath)?.done; return view(queues.get(projectPath)) ?? null; };
  return { start, control, restore, wait, state: (/** @type {string} */ projectPath) => view(queues.get(projectPath)) ?? null };
}
