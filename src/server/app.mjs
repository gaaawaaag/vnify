import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createLibrary } from './library.mjs';
import { createCloudAccess } from './cloud.mjs';
import { createManager } from './manager.mjs';
import { createSpeech } from './tts.mjs';
import { sendManagerPage, localOrigin } from './manager-server.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
// Default library folder for `npm start`; override with `dataDir` / `VN_DATA_DIR`.
export const defaultDataDir = path.join(root, 'data');
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};
const FONT = /\.(ttf|woff2)$/;
// index.html links scripts and styles under v/<build>/, and the modules and stylesheets they pull in stay under it,
// so a deploy changes every page-file URL and no browser or proxy cache can hand back an old copy.
const BUILD_PREFIX = /^\/v\/[\w-]+(?=\/)/;
const BUILD_DIRS = ['src', 'styles', 'assets'];
// Sizes and modification times of the page files; any edit or deploy gives a new id.
async function buildId() {
  const hash = createHash('sha1');
  for (const dir of BUILD_DIRS) {
    for (const entry of (await readdir(path.join(root, dir), { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())) {
      const file = path.join(entry.parentPath, entry.name), info = await stat(file);
      hash.update(`${path.relative(root, file)}:${info.size}:${info.mtimeMs};`);
    }
  }
  return hash.digest('base64url').slice(0, 12);
}
const linkBuild = (html, id) => html.replace(/\b(src|href)="(?=(?:src|styles)\/)/g, `$1="v/${id}/`);
async function handle(req, res, library, cloud, manager, speech) {
  try {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (cloud && await cloud.gate(req, res, requested)) return;
    const name = requested.replace(BUILD_PREFIX, ''), versioned = name !== requested;
    // Fonts keep one URL across deploys so the 12 MB title font is not downloaded again.
    if (versioned && FONT.test(name)) { res.writeHead(301, { Location: name }).end(); return; }
    if (name === '/api/library' || name.startsWith('/api/library/')) {
      await library.handle(req, res, name, cloud ? cloud.pageOrigin(req) : localOrigin(req));
      return;
    }
    // Speech passed on to providers that refuse calls from a web page; local and cloud alike, behind the cloud sign-in.
    if (name.startsWith('/api/tts/')) { await speech.handle(req, res, name, cloud ? cloud.pageOrigin(req) : localOrigin(req)); return; }
    if (manager && (name === '/api/manager' || name.startsWith('/api/manager/'))) { await manager.handle(req, res, name, localOrigin(req)); return; }
    if (manager && (name === '/manager' || name.startsWith('/manager/'))) { await sendManagerPage(req, res, name); return; }
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    const relative = path.relative(root, file).split(path.sep).join('/');
    const hidden = file.startsWith(defaultDataDir) || (cloud && !cloud.isPublicFile(relative));
    if (!file.startsWith(root) || hidden || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(403).end(); return; }
    let data = await readFile(file);
    if (relative === 'index.html') data = Buffer.from(linkBuild(data.toString('utf8'), await buildId()));
    if (cloud && relative === 'index.html') data = cloud.markPage(data);
    // Build-versioned files never change under their URL; fonts are large and rarely change;
    // everything else (index.html, examples) is checked on every load and sent again only when it changed.
    const cache = versioned ? 'max-age=31536000, immutable' : FONT.test(file) ? 'max-age=604800' : 'no-cache';
    const etag = `"${createHash('sha1').update(data).digest('base64url')}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': cache }).end(); return; }
    res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': cache, ETag: etag });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { if (!res.headersSent) res.writeHead(404).end('Not found'); }
}
// Resolves with the listening server; rejects when the port is taken.
// `cloud` (from cloudConfig) serves only the bookshelf and player, behind the owner's passphrase.
// The asset manager (`production`: the folder holding presets.json and works/) is local only; pass `production: null` to disable it.
export function startServer(port, { dataDir = defaultDataDir, cloud = null, host = '127.0.0.1', production = root } = {}) {
  const library = createLibrary(path.join(dataDir, 'library'));
  const access = cloud ? createCloudAccess(cloud) : null;
  const manager = !cloud && production ? createManager(production) : null;
  const speech = createSpeech();
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => handle(req, res, library, access, manager, speech));
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
