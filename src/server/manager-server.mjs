import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createManager } from './manager.mjs';

// The asset manager's page, built by Vite from src/manager (npm run manager:build); an exported kit carries the build.
const managerDir = fileURLToPath(new URL('../../dist-manager', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const LOOPBACK = /^127\.0\.0\.1:\d+$/;
// Pages are served from the loopback host only (no cross-site use, no DNS rebinding).
export const localOrigin = req => LOOPBACK.test(req.headers.host || '') ? `http://${req.headers.host}` : null;
// Vite names the bundled files by content, so they are cached for good; the page itself is checked on every load.
export async function sendManagerPage(req, res, name) {
  if (name === '/manager') { res.writeHead(301, { Location: '/manager/' }).end(); return; }
  const file = path.resolve(managerDir, '.' + (name.slice('/manager'.length) === '/' ? '/index.html' : name.slice('/manager'.length)));
  if (!file.startsWith(managerDir + path.sep) || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(403).end(); return; }
  const data = await readFile(file).catch(() => null);
  if (!data) { res.writeHead(404).end(name === '/manager/' ? '管理器尚未构建：先运行 npm run manager:build' : 'Not found'); return; }
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': cache });
  res.end(req.method === 'HEAD' ? undefined : data);
}
// The asset manager alone, for an exported production kit (no bookshelf or player).
// `production` is the folder holding presets.json and works/. Resolves with the listening server.
export function startManagerServer(port, { production, host = '127.0.0.1' }) {
  const manager = createManager(production);
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (name === '/') res.writeHead(302, { Location: '/manager/' }).end();
        else if (name === '/api/manager' || name.startsWith('/api/manager/')) await manager.handle(req, res, name, localOrigin(req));
        else if (name === '/manager' || name.startsWith('/manager/')) await sendManagerPage(req, res, name);
        else res.writeHead(404).end('Not found');
      } catch { if (!res.headersSent) res.writeHead(404).end('Not found'); }
    });
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
