// @ts-check
/* Gemini TTS official voice catalog and preview speech (docs/dev/audio.md): speaks a line via v1beta generateContent
 * (returning playable WAV bytes, wrapping raw PCM if needed) and browses or looks up official prebuilt voices via
 * GET /v1beta/voices. Shares the user's `gemini` key with Lyria. VNIFY_GEMINI_API points elsewhere for tests. */

const api = () => process.env.VNIFY_GEMINI_API || 'https://generativelanguage.googleapis.com';

/** Maps short work/library language tags to Gemini Voices API BCP-47 filter codes. @type {Record<string,string[]>} */
const LANG_FILTERS = {
  zh: ['zh-CN'],
  'zh-Hant': ['zh-TW', 'zh-CN'],
  yue: ['yue-HK'],
  en: ['en-US', 'en-GB'],
  ja: ['ja-JP'],
  ko: ['ko-KR'],
};
// Short-lived in-memory cache of the prebuilt catalog (keyed by API base URL) so lookup() finds any of the 2,000+
// official voices by ID even though GET /v1beta/voices/{id} only serves custom project voices.
const CATALOG_TTL_MS = 10 * 60 * 1000;
/** @type {Map<string, {at:number, voices:NonNullable<ReturnType<typeof normalizeVoice>>[]}>} */
const catalogCache = new Map();

/** Normalizes a Gemini BCP-47 code to the project's short voice library language tag. @param {unknown} code */
export function shortLang(code) {
  const value = typeof code === 'string' ? code.trim().replace('_', '-') : '';
  if (!value) return undefined;
  if (/^(?:cmn|zh)-(?:tw|hk|mo|hant)\b/i.test(value)) return 'zh-Hant';
  if (/^yue\b/i.test(value)) return 'yue';
  if (/^(?:cmn|zh)\b/i.test(value)) return 'zh';
  const head = value.split('-')[0].toLowerCase();
  return /^[a-z]{2,3}$/.test(head) ? head : undefined;
}

/** @param {string|undefined} lang @returns {string[]} */
export function filterLanguageCodes(lang) {
  const value = typeof lang === 'string' ? lang.trim() : '';
  if (!value || value === 'all') return [];
  if (Object.hasOwn(LANG_FILTERS, value)) return LANG_FILTERS[value];
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value) ? [value] : [];
}

/** @param {Response} response */
async function failure(response) {
  let message = '';
  try {
    const body = await response.json();
    message = typeof body?.error?.message === 'string' ? body.error.message : '';
  } catch {}
  return Object.assign(new Error(`Gemini TTS：${message || `HTTP ${response.status}`}`), {
    status: response.status >= 500 ? 502 : 400, upstream: response.status,
  });
}

/** @param {string} key @param {string} route @param {RequestInit} [init] */
async function call(key, route, init = {}) {
  if (!key) throw Object.assign(new Error('还没有填写 Gemini API key。'), { status: 400 });
  let response;
  try { response = await fetch(`${api()}${route}`, { ...init, headers: { 'x-goog-api-key': key, ...init.headers } }); }
  catch { throw Object.assign(new Error('无法连接 Gemini API。'), { status: 502 }); }
  if (!response.ok) throw await failure(response);
  return response;
}

/** Wraps raw 16-bit mono PCM bytes with a 44-byte RIFF WAV header. @param {Buffer} pcm @param {number} rate */
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

/**
 * Normalizes one entry from GET /v1beta/voices into the voice library metadata shape.
 * @param {any} raw
 * @returns {{ref:string,title:string,tags:string[],languages:string[],languageCode:string,gender:string,description:string,mine:boolean}|null}
 */
export function normalizeVoice(raw) {
  const ref = typeof raw?.id === 'string' ? raw.id.trim() : '';
  if (!ref || !/^[A-Za-z0-9_-]{1,128}$/.test(ref)) return null;
  const display = typeof (raw.displayName ?? raw.display_name) === 'string' ? String(raw.displayName ?? raw.display_name).trim() : '';
  const title = (display || ref).slice(0, 200);
  const languageCode = typeof (raw.languageCode ?? raw.language_code) === 'string' ? String(raw.languageCode ?? raw.language_code).trim() : '';
  const lang = shortLang(languageCode);
  const gender = typeof raw.gender === 'string' ? raw.gender.trim().toLowerCase() : '';
  const rawTags = [gender, raw.pitch, raw.accent, raw.persona, raw.context, ...(Array.isArray(raw.tags) ? raw.tags : [])];
  const tags = [...new Set(rawTags.filter(v => typeof v === 'string' && v.trim() && v.trim().length <= 40).map(v => v.trim()))].slice(0, 12);
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 500) : '';
  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : 'prebuilt';
  return { ref, title, tags, languages: lang ? [lang] : [], languageCode, gender, description, mine: type === 'prompted' || type === 'replicated' };
}

/**
 * Speaks a line with an official Gemini TTS voice, returning playable WAV bytes.
 * @param {string} key @param {{ref:string,text:string,model:string,style?:string}} line
 */
export async function speak(key, { ref, text, model, style }) {
  const part = { text, ...(style?.trim() ? { speechMetadata: { style: style.trim() } } : {}) };
  const response = await call(key, `/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [part] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ref } } },
      },
    }),
  });
  const body = await response.json().catch(() => null);
  const parts = body?.candidates?.[0]?.content?.parts;
  const found = (Array.isArray(parts) ? parts : []).find(item => typeof (item?.inlineData?.data ?? item?.inline_data?.data) === 'string');
  const inline = found?.inlineData ?? found?.inline_data;
  if (!inline?.data) throw Object.assign(new Error('Gemini TTS 没有返回音频。'), { status: 502 });
  const raw = Buffer.from(inline.data, 'base64');
  const mime = String(inline.mimeType ?? inline.mime_type ?? 'audio/wav');
  const isRiff = raw.length >= 4 && raw.subarray(0, 4).toString('ascii') === 'RIFF';
  if (!isRiff && /^audio\/(?:l16|pcm)/i.test(mime)) {
    const rate = Number(/rate=(\d+)/i.exec(mime)?.[1]) || 24000;
    return wrapPcmWav(raw, rate);
  }
  return raw;
}

/**
 * Lists official Gemini TTS prebuilt/curated voices with optional filters.
 * @param {string} key
 * @param {{lang?:string,gender?:string,pitch?:string,search?:string,pageSize?:number,pageToken?:string}} [options]
 */
export async function listVoices(key, options = {}) {
  const params = new URLSearchParams();
  params.append('type', 'prebuilt');
  for (const code of filterLanguageCodes(options.lang)) params.append('language_code', code);
  if (options.gender && /^(?:male|female|neutral)$/i.test(options.gender)) params.append('gender', options.gender.toLowerCase());
  if (options.pitch && /^(?:low|medium|high)$/i.test(options.pitch)) params.append('pitch', options.pitch.toLowerCase());
  if (options.search?.trim()) params.append('search', options.search.trim().slice(0, 200));
  const size = Math.max(1, Math.min(1000, Math.floor(Number(options.pageSize) || 50)));
  params.set('page_size', String(size));
  if (options.pageToken?.trim()) params.set('page_token', options.pageToken.trim());
  const body = await (await call(key, `/v1beta/voices?${params}`)).json();
  const list = Array.isArray(body?.voices) ? body.voices.map(normalizeVoice).filter(Boolean) : [];
  const nextPageToken = typeof (body?.nextPageToken ?? body?.next_page_token) === 'string'
    ? String(body.nextPageToken ?? body.next_page_token) : '';
  return { voices: /** @type {NonNullable<ReturnType<typeof normalizeVoice>>[]} */ (list), nextPageToken };
}

/**
 * Fetches all official prebuilt voices (cached briefly per API base) for reliable exact-ID lookup.
 * @param {string} key
 */
async function allPrebuilt(key) {
  const base = api();
  const cached = catalogCache.get(base);
  if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.voices;
  /** @type {NonNullable<ReturnType<typeof normalizeVoice>>[]} */
  const all = [];
  let pageToken = '';
  for (let i = 0; i < 10; i++) {
    const page = await listVoices(key, { pageSize: 1000, ...(pageToken ? { pageToken } : {}) });
    all.push(...page.voices);
    if (!page.nextPageToken || page.nextPageToken === pageToken) break;
    pageToken = page.nextPageToken;
  }
  catalogCache.set(base, { at: Date.now(), voices: all });
  return all;
}

/**
 * Looks up one official Gemini voice by ID (case-insensitive), or returns null when not found.
 * GET /v1beta/voices/{id} only serves custom stored voices, so prebuilt IDs fall back to the prebuilt catalog.
 * @param {string} key @param {string} ref
 */
export async function lookup(key, ref) {
  try {
    const body = await (await call(key, `/v1beta/voices/${encodeURIComponent(ref)}`)).json();
    const found = normalizeVoice(body);
    if (found) return found;
  } catch (/** @type {any} */ error) {
    if (error.upstream !== 404 && error.upstream !== 400) throw error;
  }
  const needle = ref.toLowerCase();
  const voices = await allPrebuilt(key);
  return voices.find(v => v.ref === ref || v.ref.toLowerCase() === needle) ?? null;
}
