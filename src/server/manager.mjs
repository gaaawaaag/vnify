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
import { validateVoiceLibrary, validateLibraryVoice, fishRef, voiceLang } from '../production/voices.js';
import * as elevenVoice from '../production/generators/elevenlabs-voice.js';
import * as geminiVoice from '../production/generators/gemini-voice.js';
import * as fish from '../production/generators/fish.js';
import { createSoundLibrary } from '../production/sound-library.js';
import { validateMusicPresets } from '../production/music-presets.js';
import { searchImages } from '../production/image-library.js';
import { IMAGE_SEARCH_SOURCES } from '../production/image-search.js';

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
  // The voice library (voices.json): voices every work can choose from, and the speech services' settings.
  const voiceFile = path.join(root, 'voices.json');
  async function readVoices() {
    let raw = null;
    try { raw = JSON.parse(await readFile(voiceFile, 'utf8')); }
    catch (/** @type {any} */ error) { if (error.code !== 'ENOENT') throw fail(500, 'voices.json 无法读取，请检查文件内容。'); }
    return validateVoiceLibrary(raw);
  }
  /** @param {unknown} value */
  async function writeVoices(value) {
    let library;
    try { library = validateVoiceLibrary(value); } catch (/** @type {any} */ error) { throw fail(400, error.message); }
    const temp = `${voiceFile}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(library, null, 2) + '\n');await rename(temp, voiceFile);
    return library;
  }
  const voicesWithStatus = async (/** @type {any} */ library) => ({
    ...library, secrets: { fish: !!await getSecret('fish'), elevenlabs: !!await getSecret('elevenlabs'), gemini: !!await getSecret('gemini') },
  });
  /* Gemini TTS for the voice pages: preview a line, look up an official voice, or browse the official catalog.
   * Shares the `gemini` key with Lyria music generation. */
  /** @param {string} action @param {IncomingMessage} req @param {ServerResponse} res */
  async function geminiAction(action, req, res) {
    const key = await getSecret('gemini');
    if (action === 'speak') {
      const { ref, text } = await json(req);
      if (typeof text !== 'string' || !text.trim() || text.length > 500) throw fail(400, '试听文字须为 1–500 字。');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(ref ?? ''))) throw fail(400, '音色 ID 无效。');
      send(res, 200, await geminiVoice.speak(key, { ref: String(ref), text, model: (await readVoices()).gemini.model }), 'audio/wav');
      return;
    }
    if (action === 'lookup') {
      const id = String((await json(req)).ref ?? '').trim();
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw fail(400, '音色 ID 无效。');
      const voice = await geminiVoice.lookup(key, id);
      if (!voice) throw fail(404, 'Gemini TTS 官方库里没有这个音色。');
      send(res, 200, { ...voice, lang: voiceLang(voice.languages[0]) });
      return;
    }
    if (action === 'list') {
      const { lang, gender, pitch, search, pageSize, pageToken } = await json(req);
      const found = await geminiVoice.listVoices(key, {
        lang: typeof lang === 'string' ? lang : undefined,
        gender: typeof gender === 'string' ? gender : undefined,
        pitch: typeof pitch === 'string' ? pitch : undefined,
        search: typeof search === 'string' ? search : undefined,
        pageSize: Number(pageSize) || 50,
        pageToken: typeof pageToken === 'string' ? pageToken : undefined,
      });
      send(res, 200, {
        voices: found.voices.map(v => ({ ...v, lang: voiceLang(v.languages[0]) })),
        nextPageToken: found.nextPageToken,
      });
      return;
    }
    throw fail(404, '不支持的操作。');
  }
  /* ElevenLabs for the voice pages: preview a line, look a voice up. Its key is the one music generation uses. */
  /** @param {string} action @param {IncomingMessage} req @param {ServerResponse} res */
  async function elevenAction(action, req, res) {
    const key = await getSecret('elevenlabs');
    if (action === 'speak') {
      const { ref, text } = await json(req);
      if (typeof text !== 'string' || !text.trim() || text.length > 500) throw fail(400, '试听文字须为 1–500 字。');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(ref ?? ''))) throw fail(400, '音色 ID 无效。');
      send(res, 200, await elevenVoice.speak(key, { ref: String(ref), text, model: (await readVoices()).elevenlabs.model }), 'audio/mpeg');
      return;
    }
    if (action === 'lookup') {
      const id = String((await json(req)).ref ?? '').trim();
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw fail(400, '音色 ID 无效。');
      const voice = await elevenVoice.lookup(key, id);
      if (!voice) throw fail(404, 'ElevenLabs 上没有这个音色（My Voices 与 Voice Library 里都没找到）。');
      const { shared, ...found } = voice;
      // A Voice Library voice is used once it is in the account's voices; a key without write access cannot add it.
      let ref = id;
      if (shared) {
        try { ref = await elevenVoice.addShared(key, shared.owner, id, found.title); }
        catch (/** @type {any} */ error) {
          if (error.upstream !== 401 && error.upstream !== 403) throw error;
          throw fail(400, `“${found.title}”在 Voice Library 里，还没加入你的 My Voices：在 elevenlabs.io 打开它点 Add to my voices 后再添加；`
            + '或给 API key 开 Voices 的写权限，这里会自动加入。');
        }
      }
      send(res, 200, { ref, ...found, lang: voiceLang(found.languages[0]) });
      return;
    }
    throw fail(404, '不支持的操作。');
  }
  const json = async (/** @type {IncomingMessage} */ req, limit = 64 * 1024) => JSON.parse((await readBody(req, limit)).toString('utf8'));
  /* Fish Audio for the voice pages: preview a line, design candidates, keep one as a voice, look a voice up, read the
   * balance. The key never leaves this machine. */
  /** @param {string} action @param {IncomingMessage} req @param {ServerResponse} res */
  async function fishAction(action, req, res) {
    const key = await getSecret('fish');
    if (action === 'balance') { send(res, 200, await fish.balance(key)); return; }
    if (action === 'speak') {
      const { ref, text, speed, language } = await json(req);
      if (typeof text !== 'string' || !text.trim() || text.length > 500) throw fail(400, '试听文字须为 1–500 字。');
      if (!fishRef(String(ref ?? ''))) throw fail(400, '音色 ID 无效。');
      const audio = await fish.speak(key, { ref: String(ref), text, model: (await readVoices()).fish.model, speed: Number(speed) || 1,
        ...(typeof language === 'string' ? { language } : {}) });
      send(res, 200, audio, 'audio/mpeg');
      return;
    }
    if (action === 'design') {
      const { instruction, text, language } = await json(req);
      if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > 2000) throw fail(400, '音色描述须为 1–2000 字。');
      if (text !== undefined && (typeof text !== 'string' || text.length > 150)) throw fail(400, '试读句最多 150 字。');
      const candidates = await fish.design(key, { instruction: instruction.trim(), text: text?.trim() || undefined,
        language: typeof language === 'string' ? language : undefined, n: 3 });
      send(res, 200, { candidates: candidates.map(audio => audio.toString('base64')) });
      return;
    }
    if (action === 'create') {
      const { label, audio, text, tags, lang, note } = await json(req, 16 * 1024 * 1024);
      if (typeof audio !== 'string' || !audio) throw fail(400, '没有选中的候选音色。');
      const voice = validateLibraryVoice({ provider: 'fish', ref: 'pending', label, tags, origin: 'designed', lang, note });
      const created = await fish.createVoice(key, { title: voice.label, audio: Buffer.from(audio, 'base64'), text: typeof text === 'string' ? text : '', tags: voice.tags });
      const library = await readVoices(), entry = { ...voice, ref: created.ref };
      send(res, 200, { voice: entry, library: await voicesWithStatus(await writeVoices({ ...library, voices: [...library.voices, entry] })) });
      return;
    }
    if (action === 'lookup') {
      const { ref } = await json(req), id = fishRef(String(ref ?? ''));
      if (!id) throw fail(400, '音色 ID 无效。');
      const found = await fish.lookup(key, id);
      if (!found) throw fail(404, 'Fish Audio 上没有这个音色。');
      send(res, 200, { ref: id, ...found, lang: voiceLang(found.languages[0]) });
      return;
    }
    throw fail(404, '不支持的操作。');
  }
  // Sound effect libraries (sound-services.json, src/production/sound-library.js), shared with the command line.
  const sounds = createSoundLibrary(root);
  // Audio generation presets for music and effects (music-presets.json); their keys stay in the user's folder.
  const musicFile = path.join(root, 'music-presets.json');
  async function readMusicPresets() {
    let raw = null;
    try { raw = JSON.parse(await readFile(musicFile, 'utf8')); }
    catch (/** @type {any} */ error) { if (error.code !== 'ENOENT') throw fail(500, 'music-presets.json 无法读取，请检查文件内容。'); }
    return validateMusicPresets(raw);
  }
  /** @param {unknown} value */
  async function writeMusicPresets(value) {
    let presets;
    try { presets = validateMusicPresets(value); } catch (/** @type {any} */ error) { throw fail(400, error.message); }
    const temp = `${musicFile}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(presets, null, 2) + '\n');await rename(temp, musicFile);
    return presets;
  }
  const musicWithStatus = async (/** @type {any} */ file) => ({ ...file, secrets: { elevenlabs: !!await getSecret('elevenlabs'), comfyui: !!await getSecret('comfyui'),
    gemini: !!await getSecret('gemini') } });
  const works = createWorks(root, async () => (await readImagePresets()).presets, sounds.take, async () => (await readMusicPresets()).presets);
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
      if (route === 'GET /music-presets') { send(res, 200, await musicWithStatus(await readMusicPresets())); return; }
      if (route === 'PUT /music-presets') { send(res, 200, await musicWithStatus(await writeMusicPresets(await json(req, 4 * 1024 * 1024)))); return; }
      if (route === 'GET /sound-services') { send(res, 200, await sounds.status(await sounds.read())); return; }
      if (route === 'PUT /sound-services') { send(res, 200, await sounds.status(await sounds.write(await json(req)))); return; }
      if (route === 'POST /sounds/search') {
        const { query, maxDuration, kind } = await json(req), music = kind === 'music';
        if (typeof query !== 'string' || !query.trim() || query.length > 200) throw fail(400, '搜索词须为 1–200 字。');
        send(res, 200, await sounds.search(query.trim(), { kind: music ? 'music' : 'sounds', maxDuration: Math.min(600, Math.max(1, Number(maxDuration) || (music ? 600 : 60))),
          localPreview: (file, library) => `/api/manager/sounds/local?path=${encodeURIComponent(file)}${library === 'music' ? '&library=music' : ''}` }));
        return;
      }
      // Photo libraries for backgrounds: Pexels and Pixabay, in the book's orientation.
      if (route === 'POST /images/search') {
        const { query, orientation, sources } = await json(req);
        const chosen = Array.isArray(sources) ? IMAGE_SEARCH_SOURCES.filter(s => sources.includes(s)) : IMAGE_SEARCH_SOURCES;
        send(res, 200, await searchImages(String(query ?? ''), { sources: chosen, orientation: orientation === 'portrait' ? 'portrait' : 'landscape' }));
        return;
      }
      if (req.method === 'GET' && pathname === '/api/manager/sounds/local') {
        const query = new URL(req.url ?? '', 'http://localhost').searchParams;
        const file = await sounds.localFile(query.get('path') ?? '', query.get('library') === 'music' ? 'music' : 'sounds');
        if (!file) throw fail(404, '没有这个本地音效。');
        const bytes = await readFile(file).catch(() => { throw fail(404, '没有这个本地音效。'); });
        const type = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg' }[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }).end(bytes);
        return;
      }
      if (route === 'GET /voices') { send(res, 200, await voicesWithStatus(await readVoices())); return; }
      if (route === 'PUT /voices') { send(res, 200, await voicesWithStatus(await writeVoices(await json(req, 1024 * 1024)))); return; }
      if (route.startsWith('POST /voices/fish/')) { await fishAction(route.slice('POST /voices/fish/'.length), req, res); return; }
      if (route.startsWith('POST /voices/elevenlabs/')) { await elevenAction(route.slice('POST /voices/elevenlabs/'.length), req, res); return; }
      if (route.startsWith('POST /voices/gemini/')) { await geminiAction(route.slice('POST /voices/gemini/'.length), req, res); return; }
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
