// Screenshots of a real shelf book under a theme, in a hidden Electron window with a throwaway shelf.
// Usage: npx electron scripts/browser/book-shots.mjs '<options JSON>'
//   {theme, book: library book folder (holding meta.json and package/), out, viewport: [w, h], steps: [unit counts]}
// The book folder is copied into a temporary shelf, so its own shelf and reading position are left alone.
// Used by scripts/theme-shots.mjs --book.
import {app, BrowserWindow} from 'electron';
import {cp, mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startServer} from '../../src/server/app.mjs';

const options = JSON.parse(process.argv[process.argv.findIndex(a => a.endsWith('book-shots.mjs')) + 1]);
const {theme, book, out, viewport: [width, height] = [1280, 800], steps = [0, 1, 2, 3, 4, 5]} = options;
const profile = await mkdtemp(path.join(tmpdir(), 'vn-book-shots-'));
app.setPath('userData', profile);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  try {
    const bookId = path.basename(path.resolve(book));
    await cp(book, path.join(profile, 'library', bookId), {recursive: true});
    await mkdir(out, {recursive: true});
    const server = await startServer(0, {dataDir: profile}), origin = `http://127.0.0.1:${server.address().port}`;
    const win = new BrowserWindow({show: false, width, height, useContentSize: true, webPreferences: {backgroundThrottling: false}});
    const js = code => win.webContents.executeJavaScript(code);
    const until = async (test, ms = 8000) => { for (let t = 0; t < ms && !await js(test); t += 100) await wait(100); };
    // A hidden window paints only when asked: the first capture brings the picture up to date, the second keeps it.
    const shot = async name => {
      await win.webContents.capturePage(); await wait(400);
      await writeFile(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
    };
    const press = key => js(`document.dispatchEvent(new KeyboardEvent('keydown', {key: ${JSON.stringify(key)}, bubbles: true}))`);
    await win.loadURL(origin + '/');
    await js(`localStorage.setItem('vn-appearance', JSON.stringify({theme: ${JSON.stringify(theme)}}))`);
    await win.loadURL(origin + '/');
    const opener = `document.querySelector('[data-key=${JSON.stringify(bookId)}] :is(.shelf-open, .shelf-row-open)')`;
    await until(`!!${opener}`);
    await js(`${opener}.click()`);
    await until(`!document.getElementById('title-screen').hidden`);
    await wait(2500); await shot('title');
    for (let i = 0; i < 10 && await js(`!document.getElementById('title-screen').hidden`); i++) {
      await js(`document.getElementById('title-screen').click()`); await wait(500);
    }
    // A step is shown once its text is complete (the continue mark appears) and transitions have settled.
    const settled = `getComputedStyle(document.getElementById('advance-hint')).visibility === 'visible'`;
    let at = 0;
    for (const step of steps) {
      for (; at < step; at++) { await press('ArrowRight'); await wait(250); await until(settled, 6000); }
      await until(settled, 6000); await wait(1500);
      await shot(`step-${String(step).padStart(3, '0')}`);
    }
    // The menu button toggles the toolbar (the menu shows while #reader is not .chrome-hidden).
    const menuOpen = open => js(`document.getElementById('reader').classList.contains('chrome-hidden') === ${open}
      && document.getElementById('reader-menu').click()`);
    await menuOpen(true); await wait(900); await shot('menu');
    await menuOpen(false); await wait(600);
    for (const [name, id] of [['cast', 'open-cast'], ['gallery', 'open-backgrounds'], ['settings', 'reader-settings'], ['history', 'history']]) {
      await js(`document.getElementById(${JSON.stringify(id)})?.click()`); await wait(2500); await shot(name);
      await js(`document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.getElementById('backlog-close')?.click()`);
      await wait(900);
    }
    console.log(JSON.stringify({ok: true, out}));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally { app.quit(); }
});
