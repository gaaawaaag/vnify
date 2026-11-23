// Runs an in-page browser check in a headless Chrome/Edge window (no timer throttling, fresh profile).
// Usage: node scripts/browser/browser-run.mjs <script.js> <out.json> ['<options JSON>']
// The script file evaluates to an async function taking the options object, or to a promise (e.g. smoke.js).
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../../src/server/app.mjs';
import { launchBrowser } from './cdp.mjs';

const [script, out, options = '{}'] = process.argv.slice(2);
if (!script || !out) {
  console.error('用法：node scripts/browser/browser-run.mjs <script.js> <out.json> [\'{...}\']');
  process.exit(1);
}
const settings = JSON.parse(options);
const [width, height] = settings.viewport ?? [1280, 800];
const profile = await mkdtemp(path.join(tmpdir(), 'vn-browser-check-'));
const server = await startServer(0, { dataDir: profile, production: null });
let browser = null;
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await launchBrowser({ profile: path.join(profile, 'browser'), width, height });
  await browser.navigate(origin + '/');
  if (settings.theme) {
    await browser.evalJs(`localStorage.setItem('vn-appearance', JSON.stringify({theme: ${JSON.stringify(settings.theme)}}))`);
    await browser.navigate(origin + '/');
  }
  const source = await readFile(script, 'utf8');
  let done = false;
  const running = browser.evalJs(
    `(check => typeof check === 'function' ? check(${options}) : check)((0, eval)(${JSON.stringify(source)}))`
  ).finally(() => { done = true; });
  if (settings.shotsDir) {
    await mkdir(settings.shotsDir, { recursive: true });
    while (!done) {
      const name = await browser.evalJs('window.__vnShotRequest !== window.__vnShotDone ? window.__vnShotRequest : null');
      if (name) {
        await new Promise(resolve => setTimeout(resolve, 250));
        const png = await browser.screenshot();
        await writeFile(path.join(settings.shotsDir, name.replace(/[^\w.-]+/g, '_') + '.png'), png);
        await browser.evalJs(`window.__vnShotDone = ${JSON.stringify(name)}`);
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  const result = await running;
  await writeFile(out, JSON.stringify(result));
  console.log(JSON.stringify(result.summary ?? result).slice(0, 2000));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
