// Renders the placeholder app icon (gold "v." on the app's near-black) to build/icon.png.
// Usage: npx electron scripts/make-icon.mjs
import {app, BrowserWindow} from 'electron';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const SIZE = 512;
const out = fileURLToPath(new URL('../build/icon.png', import.meta.url));
const draw = `(() => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = ${SIZE};
  const g = canvas.getContext('2d'), r = ${SIZE} * .2;
  g.fillStyle = '#0b0b0d'; g.beginPath(); g.roundRect(0, 0, ${SIZE}, ${SIZE}, r); g.fill();
  g.strokeStyle = '#d6b57a55'; g.lineWidth = ${SIZE} * .012; g.beginPath(); g.roundRect(${SIZE} * .03, ${SIZE} * .03, ${SIZE} * .94, ${SIZE} * .94, r * .9); g.stroke();
  g.fillStyle = '#d6b57a'; g.font = '${Math.round(SIZE * .62)}px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText('v.', ${SIZE} * .53, ${SIZE} * .7);
  return canvas.toDataURL('image/png');
})()`;
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({show: false});
    await win.loadURL('about:blank');
    const url = await win.webContents.executeJavaScript(draw);
    await mkdir(new URL('../build/', import.meta.url), {recursive: true});
    await writeFile(out, Buffer.from(url.split(',')[1], 'base64'));
    console.log(out);
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { app.quit(); }
});
