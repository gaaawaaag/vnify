#!/usr/bin/env node
// @ts-check
// Voices for the agent (docs/dev/audio.md): lists a work's speaking roles and portraits, searches Gemini's official
// voice catalog (alongside the workspace voices.json favorites), and binds a voice directly to director/voices.json.
// node scripts/voices.mjs list <project.json>
// node scripts/voices.mjs search [--sources fish,elevenlabs,gemini] [--lang zh|zh-Hant|yue|en|ja|ko|all]
//                                [--gender male|female|neutral] [--pitch low|medium|high] [--query "..."]
//                                [--limit 50] [--page-token "..."] [--out hits.json]
// node scripts/voices.mjs bind <project.json> <role> <provider:ref|none> [label]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateVoices } from '../src/core/voices.js';
import { loadDirectorProject } from '../src/production/director-project.js';
import { setVoices } from '../src/production/director-edits.js';
import { getSecret } from '../src/production/secrets.js';
import { VOICE_PROVIDERS, validateVoiceLibrary, voiceRoles } from '../src/production/voices.js';
import * as geminiVoice from '../src/production/generators/gemini-voice.js';
import { flagsOf, sourcesOf } from './audio-cli.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const usage = 'node scripts/voices.mjs list <project.json>'
  + ' | search [--sources fish,elevenlabs,gemini] [--lang zh|zh-Hant|yue|en|ja|ko|all] [--gender male|female|neutral] [--pitch low|medium|high] [--query "..."] [--limit N] [--page-token T] [--out hits.json]'
  + ' | bind <project.json> <role> <provider:ref|none> [label]';

async function readWorkspaceLibrary() {
  let raw = null;
  try { raw = JSON.parse(await readFile(path.join(root, 'voices.json'), 'utf8')); }
  catch (/** @type {any} */ error) { if (error.code !== 'ENOENT') throw new Error(`voices.json 无法读取：${error.message}`); }
  return validateVoiceLibrary(raw);
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'list' && args.length === 1) {
    const { story } = await loadDirectorProject(args[0]);
    const record = story.voices;
    const roles = voiceRoles(story).map(role => {
      const assigned = role.key === 'narrator' ? record?.cast.narrator
        : role.key === 'other' ? record?.cast.other : record?.cast.characters[role.key];
      return {
        key: role.key, label: role.label, count: role.count,
        portrait: record?.portraits[role.key] ?? '',
        voice: assigned ?? null,
        voiceLabel: assigned ? record?.labels[assigned] ?? assigned : null,
      };
    });
    console.log(JSON.stringify({ lang: story.book.lang ?? 'zh', roles }, null, 2));
  } else if (command === 'search') {
    const flags = flagsOf(args, ['--sources', '--lang', '--gender', '--pitch', '--query', '--limit', '--page-token', '--out'], usage);
    const sources = sourcesOf(flags.get('--sources'), VOICE_PROVIDERS);
    const lang = flags.get('--lang');
    const gender = flags.get('--gender');
    const pitch = flags.get('--pitch');
    const query = flags.get('--query');
    const limit = Number(flags.get('--limit')) || 50;
    const pageToken = flags.get('--page-token');
    const library = await readWorkspaceLibrary();
    const byKey = new Map(library.voices.map(v => [`${v.provider}:${v.ref}`, v]));
    const order = new Map(sources.map((s, i) => [s, i]));
    const local = library.voices
      .filter(v => order.has(v.provider) && (!lang || lang === 'all' || !v.lang || v.lang === lang))
      .sort((a, b) => (order.get(a.provider) ?? 0) - (order.get(b.provider) ?? 0))
      .map(v => ({
        key: `${v.provider}:${v.ref}`, provider: v.provider, ref: v.ref, label: v.label, tags: v.tags,
        ...(v.lang ? { lang: v.lang } : {}), ...(v.note ? { note: v.note } : {}),
      }));
    /** @type {string[]} */
    const notes = [];
    /** @type {any[]} */
    let catalog = [];
    let nextPageToken = '';
    if (order.has('gemini')) {
      const key = await getSecret('gemini');
      if (!key) {
        notes.push('尚未配置 Gemini API key（~/.vnify/secrets.json 中的 gemini），仅列出本地 voices.json。');
      } else {
        const found = await geminiVoice.listVoices(key, { lang, gender, pitch, search: query, pageSize: limit, pageToken });
        nextPageToken = found.nextPageToken;
        if ((lang === 'zh' || lang === 'zh-Hant') && found.voices.length <= 4) {
          notes.push('Gemini 官方库中标记为中文的音色很少，但 Gemini 3.8 Flash TTS 的全部官方预置音色（如 30 个基础音色 achernar、kore、fenrir、puck 等，标为 en-US）均原生支持中文朗读，可不传 --lang 或用 --lang all 检索全部官方音色。');
        }
        catalog = found.voices.map(v => {
          const saved = byKey.get(`gemini:${v.ref}`);
          return {
            key: `gemini:${v.ref}`, ref: v.ref, title: saved?.label ?? v.title, gender: v.gender,
            ...(v.languages[0] ? { lang: v.languages[0] } : {}),
            ...(v.languageCode ? { languageCode: v.languageCode } : {}),
            tags: v.tags, ...(v.description ? { description: v.description } : {}),
            ...(saved ? { inLibrary: true, ...(saved.note ? { note: saved.note } : {}) } : {}),
          };
        });
      }
    }
    const output = { sources, notes, local, gemini: catalog, ...(nextPageToken ? { nextPageToken } : {}) };
    const out = flags.get('--out');
    if (out) await writeFile(path.resolve(out), JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify(output, null, 2));
  } else if (command === 'bind' && (args.length === 3 || args.length === 4)) {
    const [projectPath, role, voiceArg, labelArg] = args;
    const { story } = await loadDirectorProject(projectPath);
    const current = story.voices ?? { labels: {}, cast: { characters: {} }, portraits: {} };
    const next = structuredClone(current);
    const clearing = !voiceArg || voiceArg === 'none' || voiceArg === 'null';
    if (role === 'narrator' || role === 'other') {
      if (clearing) delete next.cast[role];
      else next.cast[role] = voiceArg;
    } else {
      if (clearing) delete next.cast.characters[role];
      else next.cast.characters[role] = voiceArg;
    }
    if (!clearing) {
      let label = labelArg?.trim() ?? '';
      if (!label) {
        const saved = (await readWorkspaceLibrary()).voices.find(v => `${v.provider}:${v.ref}` === voiceArg);
        label = saved?.label ?? current.labels[voiceArg] ?? voiceArg.replace(/^[^:]+:/, '');
      }
      next.labels[voiceArg] = label;
    }
    const checked = validateVoices(next, story);
    await setVoices(projectPath, checked);
    console.log(JSON.stringify({ ok: true, role, voice: clearing ? null : voiceArg, label: clearing ? null : checked.labels[voiceArg] }, null, 2));
  } else {
    throw new Error(usage);
  }
} catch (/** @type {any} */ error) {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
}
