import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Cloud mode: one owner reaches the bookshelf and player over HTTPS; a passphrase from the environment replaces accounts.
const COOKIE = 'vn_session';
const MAX_AGE = 30 * 24 * 3600;
const FAILURE_WINDOW = 60000;
const MAX_FAILURES = 5;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
// Files the cloud serves: the reader page and what it loads. Tests, docs and the rest of the repository stay private.
const PUBLIC_FILE = /^(index\.html|src\/(core|reader|ui|prompts)\/.+|styles\/.+|assets\/.+|examples\/.+)$/;

// Returns null when cloud mode is off (no VN_CLOUD_ORIGIN); throws when it is on but misconfigured.
export function cloudConfig(env) {
  if (!env.VN_CLOUD_ORIGIN) return null;
  let url;
  try { url = new URL(env.VN_CLOUD_ORIGIN); } catch { throw new Error('VN_CLOUD_ORIGIN 须为完整地址，如 https://vn.example.com。'); }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('VN_CLOUD_ORIGIN 只写协议与域名（可带端口）。');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) throw new Error('VN_CLOUD_ORIGIN 须为 https 地址。');
  const token = env.VN_ACCESS_TOKEN || '';
  if (token.length < 16) throw new Error('云端模式需要 VN_ACCESS_TOKEN，至少 16 个字符。');
  return { origin: url.origin, token };
}

const digest = value => createHash('sha256').update(value).digest();
const sameSecret = (a, b) => timingSafeEqual(digest(a), digest(b));
function cookies(req) {
  const result = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) result[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return result;
}
async function readForm(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
const escape = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function loginPage(message) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>vnify.</title><style>
:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0d;color:#e8e6e1;font:16px/1.5 system-ui,sans-serif}
form{display:grid;gap:12px;width:min(320px,calc(100vw - 32px))}h1{margin:0 0 8px;font-size:28px;font-weight:600}
input,button{font:inherit;padding:10px 12px;border-radius:6px;border:1px solid #3a3a40;background:#16161a;color:inherit}
button{background:#e8e6e1;color:#0b0b0d;border:0;cursor:pointer}p{margin:0;color:#e88}
</style></head><body><form method="post" action="/api/login"><h1>vnify.</h1>
<label for="token">访问口令</label><input id="token" name="token" type="password" autocomplete="current-password" required autofocus>
${message ? `<p role="alert">${escape(message)}</p>` : ''}<button>进入</button></form></body></html>`;
}

export function createCloudAccess({ origin, token }) {
  const session = createHmac('sha256', token).update('vnify-cloud-session-1').digest('hex');
  const secure = origin.startsWith('https:') ? '; Secure' : '';
  let failures = [];
  const signedIn = req => {
    const value = cookies(req)[COOKIE];
    return Boolean(value) && sameSecret(value, session);
  };
  const html = (res, status, body) => res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
  const redirect = (res, location, headers = {}) => res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', ...headers }).end();
  async function login(req, res) {
    if (req.method !== 'POST' || req.headers.origin !== origin) { res.writeHead(403).end(); return; }
    const now = Date.now();
    failures = failures.filter(time => now - time < FAILURE_WINDOW);
    if (failures.length >= MAX_FAILURES) { redirect(res, '/login?error=wait'); return; }
    const form = await readForm(req);
    if (!form || !sameSecret(form.get('token') || '', token)) {
      failures.push(now);
      redirect(res, '/login?error=token');
      return;
    }
    redirect(res, '/', { 'Set-Cookie': `${COOKIE}=${session}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure}` });
  }
  return {
    origin,
    // Proxies differ in the Host they forward (1Panel, nginx `$proxy_host`), so requests are not matched by Host;
    // every route needs the session cookie, and library writes must come from the public origin.
    pageOrigin: () => origin,
    isPublicFile: relative => relative === '' || PUBLIC_FILE.test(relative),
    // Handles sign-in routes and turns away signed-out requests; returns true when the response was sent.
    async gate(req, res, pathname) {
      if (pathname === '/api/login') { await login(req, res); return true; }
      if (pathname === '/login') {
        const error = new URL(req.url, origin).searchParams.get('error');
        html(res, 200, loginPage(error === 'wait' ? '尝试次数过多，请一分钟后再试。' : error ? '口令不正确。' : ''));
        return true;
      }
      if (signedIn(req)) return false;
      if (req.method === 'GET' && !pathname.startsWith('/api/')) redirect(res, '/login');
      else res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: '请先登录。' }));
      return true;
    },
    // Marks the reader page so production entries stay hidden.
    markPage: data => Buffer.from(data.toString('utf8').replace(/<html\b/, '<html data-deploy="cloud"')),
  };
}
