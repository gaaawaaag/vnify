// @ts-check
/** @import {IncomingMessage,ServerResponse} from 'node:http' */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { allowed, fail, readBody, send } from './http.mjs';

/* Speech for the reader (docs/dev/audio.md). Some providers refuse calls from a web page (no CORS on their speech
 * endpoint), so the shelf passes them on: one fixed route per provider, only to that provider's speech endpoint. The
 * key comes from the reader's browser with every request (X-TTS-Key); it is never stored or logged here. The body is
 * rebuilt from the fields the reader uses, and a few requests at a time are let through.
 * VNIFY_FISH_API points elsewhere for tests. */
const fishApi = () => process.env.VNIFY_FISH_API || 'https://api.fish.audio';
const elevenApi = () => process.env.VNIFY_ELEVENLABS_API || 'https://api.elevenlabs.io';
const geminiApi = () => process.env.VNIFY_GEMINI_API || 'https://generativelanguage.googleapis.com';
export const FISH_MODELS = ['s2.1-pro-free', 's2.1-pro', 's2-pro', 'drama-3'];
export const ELEVENLABS_MODELS = ['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_v3'];
export const GEMINI_TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];
const TEXT_LIMIT = 2000, STYLE_LIMIT = 200, CONCURRENT = 4;
const LANGUAGE = /^[A-Za-z0-9_-]{1,35}$/, VOICE = /^[A-Za-z0-9_-]{1,128}$/;

/** The request Fish Audio receives, from what the reader sent. @param {any} value */
export function fishRequest(value) {
  const { text, voice, speed, language } = value ?? {};
  if (typeof text !== 'string' || !text.trim() || text.length > TEXT_LIMIT) throw fail(400, `朗读文字须为 1–${TEXT_LIMIT} 字。`);
  if (voice !== null && (typeof voice !== 'string' || !VOICE.test(voice))) throw fail(400, '音色 ID 无效。');
  if (typeof speed !== 'number' || !(speed >= 0.5 && speed <= 2)) throw fail(400, '语速须在 0.5–2 之间。');
  if (language !== undefined && (typeof language !== 'string' || !LANGUAGE.test(language))) throw fail(400, '语言标记无效。');
  return {
    text, reference_id: voice, format: 'mp3', mp3_bitrate: 128, latency: 'normal', prosody: { speed },
    ...(language ? { language } : {}),
  };
}

/** The request ElevenLabs receives: its speed range is narrower (0.7–1.2). @param {any} value @param {string} model */
export function elevenRequest(value, model) {
  const { text, reference_id: voice, prosody } = fishRequest(value);
  if (!voice) throw fail(400, '音色 ID 无效。');
  return { voice, body: { text, model_id: model, voice_settings: { speed: Math.min(1.2, Math.max(0.7, prosody.speed)) } } };
}

/** The request Gemini TTS receives: verbatim text with optional part-level delivery style, using a prebuilt voice.
 * @param {any} value */
export function geminiRequest(value) {
  const { text, reference_id: voice } = fishRequest(value);
  if (!voice) throw fail(400, '音色 ID 无效。');
  const style = value?.style;
  if (style !== undefined && (typeof style !== 'string' || style.length > STYLE_LIMIT)) throw fail(400, '朗读风格无效。');
  const part = { text, ...(style?.trim() ? { speechMetadata: { style: style.trim() } } : {}) };
  return {
    contents: [{ role: 'user', parts: [part] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
}

/** Wraps raw 16-bit mono PCM bytes with a 44-byte RIFF WAV header when Gemini returns L16 instead of WAV.
 * @param {Buffer} pcm @param {number} rate */
function wrapPcmWav(pcm, rate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Extracts playable WAV bytes from a Gemini generateContent JSON response. @param {any} body */
export function geminiAudio(body) {
  const parts = body?.candidates?.[0]?.content?.parts;
  const found = (Array.isArray(parts) ? parts : []).find(part => typeof (part?.inlineData?.data ?? part?.inline_data?.data) === 'string');
  const inline = found?.inlineData ?? found?.inline_data;
  if (!inline?.data) throw fail(502, 'Gemini TTS 没有返回音频。');
  const raw = Buffer.from(inline.data, 'base64');
  const mime = String(inline.mimeType ?? inline.mime_type ?? 'audio/wav');
  const isRiff = raw.length >= 4 && raw.subarray(0, 4).toString('ascii') === 'RIFF';
  if (!isRiff && /^audio\/(?:l16|pcm)/i.test(mime)) {
    const rate = Number(/rate=(\d+)/i.exec(mime)?.[1]) || 24000;
    return { bytes: wrapPcmWav(raw, rate), type: 'audio/wav' };
  }
  return { bytes: raw, type: /^audio\//i.test(mime) ? mime.split(';')[0] : 'audio/wav' };
}

/* Each service: its models, and where and how a checked line is sent. */
const SERVICES = {
  fish: { name: 'Fish Audio', models: FISH_MODELS, send: (/** @type {any} */ value, /** @type {string} */ key, /** @type {string} */ model) => ({
    url: `${fishApi()}/v1/tts`, body: fishRequest(value), headers: { Authorization: `Bearer ${key}`, model } }) },
  elevenlabs: { name: 'ElevenLabs', models: ELEVENLABS_MODELS, send: (/** @type {any} */ value, /** @type {string} */ key, /** @type {string} */ model) => {
    const { voice, body } = elevenRequest(value, model);
    return { url: `${elevenApi()}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, body, headers: { 'xi-api-key': key } };
  } },
  gemini: { name: 'Gemini TTS', models: GEMINI_TTS_MODELS, jsonAudio: true, send: (/** @type {any} */ value, /** @type {string} */ key, /** @type {string} */ model) => ({
    url: `${geminiApi()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, body: geminiRequest(value), headers: { 'x-goog-api-key': key } }) },
};

export function createSpeech({ request = globalThis.fetch } = {}) {
  let running = 0;
  /** @param {IncomingMessage} req @param {ServerResponse} res @param {string} pathname @param {string|null} origin */
  async function handle(req, res, pathname, origin) {
    try {
      const service = /** @type {any} */ (SERVICES)[pathname.slice('/api/tts/'.length)];
      if (!pathname.startsWith('/api/tts/') || !service || req.method !== 'POST') throw fail(404, '没有这个接口。');
      if (!allowed(req, origin)) throw fail(403, '请求来源不允许。');
      const key = req.headers['x-tts-key'], model = req.headers['x-tts-model'];
      if (typeof key !== 'string' || !key.trim() || key.length > 512) throw fail(400, `缺少 ${service.name} key。`);
      if (typeof model !== 'string' || !service.models.includes(model)) throw fail(400, `不支持的 ${service.name} 模型。`);
      let call;
      try { call = service.send(JSON.parse((await readBody(req, 64 * 1024)).toString('utf8')), key.trim(), model); }
      catch (/** @type {any} */ error) { throw error.status ? error : fail(400, '朗读请求无效。'); }
      if (running >= CONCURRENT) throw fail(429, '朗读请求过多，请稍后。');
      running++;
      try {
        const upstream = await request(call.url, {
          method: 'POST', body: JSON.stringify(call.body), headers: { ...call.headers, 'Content-Type': 'application/json' },
        }).catch(() => { throw fail(502, `无法连接 ${service.name}。`); });
        if (!upstream.ok || !upstream.body) {
          // Fish Audio answers errors as {status, message}, ElevenLabs as {detail: {message} | string}, Gemini as {error: {message}}.
          let message = '';
          try {
            const body = await upstream.json();
            message = body.error?.message ?? body.message ?? body.detail?.message ?? (typeof body.detail === 'string' ? body.detail : '');
          } catch {}
          send(res, upstream.status >= 400 ? upstream.status : 502, { error: `${service.name}：${message || `HTTP ${upstream.status}`}` });
          return;
        }
        if (service.jsonAudio) {
          const { bytes, type } = geminiAudio(await upstream.json().catch(() => null));
          res.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }).end(bytes);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
        await pipeline(Readable.fromWeb(/** @type {any} */ (upstream.body)), res);
      } finally { running--; }
    } catch (/** @type {any} */ error) {
      if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : '朗读转发失败。' });
      else res.destroy();
    }
  }
  return { handle };
}
