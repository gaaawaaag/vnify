// Runs an in-page browser check in a hidden Electron window (no timer throttling, fresh profile).
// Usage: npx electron scripts/browser/electron-run.mjs <script.js> <out.json> ['<options JSON>']
// The script file evaluates to an async function taking the options object, or to a promise (e.g. smoke.js).
import {app, BrowserWindow} from 'electron';
import {readFile, writeFile, mkdtemp, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startServer} from '../../src/server/app.mjs';

const [script, out, options = '{}'] = process.argv.slice(process.argv.findIndex(a => a.endsWith('electron-run.mjs')) + 1);
const profile = await mkdtemp(path.join(tmpdir(), 'vn-electron-check-'));
app.setPath('userData', profile);
app.whenReady().then(async () => {
  try {
    const server = await startServer(0, {dataDir: profile}), origin = `http://127.0.0.1:${server.address().port}`;
    // options.viewport: [width, height] of the page; defaults to 1280×800.
    const [width, height] = JSON.parse(options).viewport ?? [1280, 800];
    const win = new BrowserWindow({show: false, width, height, useContentSize: true, webPreferences: {backgroundThrottling: false}});
    await win.loadURL(origin + '/');
    const settings = JSON.parse(options);
    // options.theme presets the global theme; options.shotsDir saves the screenshots a script requests.
    if (settings.theme) {
      await win.webContents.executeJavaScript(`localStorage.setItem('vn-appearance', JSON.stringify({theme: ${JSON.stringify(settings.theme)}}))`);
      await win.loadURL(origin + '/');
    }
    const source = await readFile(script, 'utf8');
    let done = false;
    const running = win.webContents.executeJavaScript(`(check => typeof check === 'function' ? check(${options}) : check)((0, eval)(${JSON.stringify(source)}))`).finally(() => { done = true; });
    if (settings.shotsDir) {
      await mkdir(settings.shotsDir, {recursive: true});
      while (!done) {
        const name = await win.webContents.executeJavaScript('window.__vnShotRequest !== window.__vnShotDone ? window.__vnShotRequest : null');
        if (name) {
          // A hidden window paints only when asked: the first capture brings the picture up to date.
          await win.webContents.capturePage(); await new Promise(resolve => setTimeout(resolve, 300));
          const image = await win.webContents.capturePage();
          await writeFile(path.join(settings.shotsDir, name.replace(/[^\w.-]+/g, '_') + '.png'), image.toPNG());
          await win.webContents.executeJavaScript(`window.__vnShotDone = ${JSON.stringify(name)}`);
        } else await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    const result = await running;
    await writeFile(out, JSON.stringify(result));
    console.log(JSON.stringify(result.summary ?? result).slice(0, 2000));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally { app.quit(); }
});
