import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';
import { startServer } from '../server/app.mjs';
// Experimental desktop shell: the page keeps talking to the same local service.
// A fixed port keeps the page origin, and with it IndexedDB, stable between launches.
const PORT = Number(process.env.VN_DESKTOP_PORT || 4174);
// VN_DESKTOP_DATA points a test run at a separate data folder.
app.setPath('userData', process.env.VN_DESKTOP_DATA || path.join(app.getPath('appData'), 'vnify'));
if (!app.requestSingleInstanceLock()) app.quit();
let win;
async function open() {
  let server;
  try { server = await startServer(PORT, { dataDir: app.getPath('userData'), production: null }); } catch (error) {
    dialog.showErrorBox('vnify.', `本地端口 ${PORT} 无法使用：${error.code || error.message}`);
    app.quit();
    return;
  }
  const origin = `http://127.0.0.1:${server.address().port}`;
  win = new BrowserWindow({ width: 1280, height: 800, minWidth: 360, minHeight: 480, backgroundColor: '#0b0b0d', autoHideMenuBar: true });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url) && !url.startsWith(origin)) shell.openExternal(url);
    return { action: url.startsWith(origin) ? 'allow' : 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(origin)) event.preventDefault(); });
  win.loadURL(origin + '/');
}
// A page's beforeunload guard (unsaved workbench project, running task, shelf upload) silently blocks closing in Electron;
// ask like a browser would, in every window (the standalone workbench too). preventDefault lets it close anyway.
app.on('web-contents-created', (_, contents) => {
  contents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(BrowserWindow.fromWebContents(contents), {
      type: 'question', buttons: ['关闭', '取消'], defaultId: 1, cancelId: 1, noLink: true,
      title: 'vnify.', message: '有未保存的内容或进行中的任务，关闭后会丢失。仍要关闭吗？',
    });
    if (choice === 0) event.preventDefault();
  });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(open);
app.on('window-all-closed', () => app.quit());
