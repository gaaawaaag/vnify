// @ts-check
/** @import {IncomingMessage,ServerResponse} from 'node:http' */
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { validatePresetFile } from '../production/presets.js';
import { allowed, fail, readBody, send } from './http.mjs';
import { createWorks } from './works.mjs';
import { validateImagePresets } from '../production/image-presets.js';
import { secretStatus, setSecret, getSecret } from '../production/secrets.js';
import { probe as probeNovelai } from '../production/generators/novelai.js';
import { probe as probeComfy } from '../production/generators/comfyui.js';
import { probe as probeApi, listModels } from '../production/generators/openai.js';
import { apiSecret } from '../production/image-presets.js';
import { headerOf } from '../production/image-generation.js';
import { installSharp, sharpAvailable } from '../production/webp.js';

/* The asset manager's local routes (never mounted in cloud mode). Presets live in presets.json at the production
 * environment's root, where the agent reads them too; a missing file means the built-in presets. */
/** @param {string} root the production environment (the repository or an exported kit) */
export function createManager(root) {
  const file = path.join(root, 'presets.json'), imageFile = path.join(root, 'image-presets.json');
  // Image service presets (image-presets.json beside presets.json); keys stay in the user's secrets file.
  async function readImagePresets() {
    let raw = null;
    try { raw = JSON.parse(await readFile(imageFile, 'utf8')); }
    catch (/** @type {any} */ error) { if (error.code !== 'ENOENT') throw fail(500, 'image-presets.json 无法读取，请检查文件内容。'); }
    return validateImagePresets(raw);
  }
  /** @param {unknown} value */
  async function writeImagePresets(value) {
    let presets;
    try { presets = validateImagePresets(value); } catch (/** @type {any} */ error) { throw fail(400, error.message); }
    const temp = `${imageFile}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(presets, null, 2) + '\n');await rename(temp, imageFile);
    return presets;
  }
  const works = createWorks(root, async () => (await readImagePresets()).presets);
  async function readPresets() {
    let raw = null;
    try { raw = JSON.parse(await readFile(file, 'utf8')); }
    catch (/** @type {any} */ error) { if (error.code !== 'ENOENT') throw fail(500, 'presets.json 无法读取，请检查文件内容。'); }
    return validatePresetFile(raw);
  }
  /** @param {unknown} value */
  async function writePresets(value) {
    let presets;
    try { presets = validatePresetFile(value); } catch (/** @type {any} */ error) { throw fail(400, error.message); }
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(presets, null, 2) + '\n');
    await rename(temp, file);
    return presets;
  }
  /** @param {IncomingMessage} req @param {ServerResponse} res @param {string} pathname @param {string|null} origin */
  async function handle(req, res, pathname, origin) {
    try {
      if (!allowed(req, origin)) { send(res, 403, { error: '请求来源不允许。' }); return; }
      const route = `${req.method} ${pathname.slice('/api/manager'.length)}`;
      if (route === 'GET /presets') { send(res, 200, await readPresets()); return; }
      if (route === 'PUT /presets') {
        send(res, 200, await writePresets(JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8'))));
        return;
      }
      if (route === 'GET /image-presets') { send(res, 200, { ...await readImagePresets(), secrets: await secretStatus() }); return; }
      if (route === 'PUT /image-presets') {
        const saved = await writeImagePresets(JSON.parse((await readBody(req, 8 * 1024 * 1024)).toString('utf8')));
        send(res, 200, { ...saved, secrets: await secretStatus() });
        return;
      }
      // The key's name comes in the body: an API's key is named by its address.
      if (route === 'PUT /secrets') {
        const { name, value } = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8'));
        try { send(res, 200, { secrets: await setSecret(String(name), value) }); } catch (/** @type {any} */ error) { throw fail(400, error.message); }
        return;
      }
      // Checks a connection without drawing: the NovelAI key, a ComfyUI address, or an API's address and key.
      if (route === 'POST /probe') {
        const { source, url } = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8'));
        if (source === 'novelai') {
          const key = await getSecret('novelai');
          if (!key) throw fail(400, '还没有填写 NovelAI 密钥。');
          send(res, 200, await probeNovelai(key));
        } else if (source === 'comfyui') send(res, 200, await probeComfy(String(url ?? '').replace(/\/+$/, ''), headerOf(await getSecret('comfyui'))));
        else if (source === 'openai') send(res, 200, await probeApi(String(url ?? ''), await getSecret(apiSecret(url))));
        else throw fail(400, '不支持的来源。');
        return;
      }
      // The models an API offers, for choosing one in a preset.
      if (route === 'POST /models') {
        const { url } = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8'));
        try { new URL(String(url)); } catch { throw fail(400, '接口地址无效。'); }
        send(res, 200, await listModels(String(url), await getSecret(apiSecret(url))));
        return;
      }
      // sharp turns exported images into WebP; an exported kit comes without it and can install it here.
      if (route === 'GET /sharp') { send(res, 200, { available: await sharpAvailable() }); return; }
      if (route === 'POST /sharp') {
        try { await installSharp(root); } catch (/** @type {any} */ error) { throw fail(500, error.message); }
        send(res, 200, { available: true });
        return;
      }
      const sub = pathname.slice('/api/manager'.length);
      if (sub === '/works' || sub.startsWith('/works/')) { await works.handle(req, res, sub.slice('/works'.length)); return; }
      throw fail(404, '不支持的操作。');
    } catch (/** @type {any} */ error) {
      // Production checks (an invalid draft, a wrong image) explain themselves; anything else is reported plainly.
      send(res, error.status || 400, { error: error.message || '管理器操作失败。' });
    }
  }
  return { handle };
}
