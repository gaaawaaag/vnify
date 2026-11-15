// @ts-check
/** @import {IncomingMessage,ServerResponse} from 'node:http' */
// Small helpers shared by the shelf and the manager's routes.

/** @param {ServerResponse} res @param {number} status @param {unknown} body @param {string} [type] */
export function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body);
  // An explicit length lets the page show download progress for a book package.
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(data) }).end(data);
}
/** @param {IncomingMessage} req @param {number} limit @returns {Promise<Buffer>} */
export async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('请求内容过大。'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
/** @param {number} status @param {string} message */
export function fail(status, message) { return Object.assign(new Error(message), { status }); }
// Only same-origin pages may use these routes: `origin` is the page origin the host serves (null for any other host).
/** @param {IncomingMessage} req @param {string|null} origin */
export function allowed(req, origin) {
  if (!origin) return false;
  const site = /** @type {string|undefined} */ (req.headers['sec-fetch-site']);
  if (['GET', 'HEAD'].includes(req.method ?? '')) return !['cross-site', 'same-site'].includes(site ?? '');
  return req.headers.origin === origin;
}
