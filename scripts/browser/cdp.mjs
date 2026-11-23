// Minimal zero-dependency Chrome DevTools Protocol runner over a locally installed Chrome / Edge / Chromium.
// Used by scripts/browser/browser-run.mjs and scripts/browser/book-shots.mjs (replaces Electron).
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

const CANDIDATES = process.platform === 'win32'
  ? [
      process.env.CHROME_PATH,
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
    ]
  : process.platform === 'darwin'
    ? [
        process.env.CHROME_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
    : [
        process.env.CHROME_PATH,
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/microsoft-edge',
      ];

async function findBrowser() {
  for (const candidate of CANDIDATES) {
    if (!candidate) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error('未找到可用的 Chrome / Edge / Chromium，请安装浏览器或通过环境变量 CHROME_PATH 指定可执行文件路径。');
}

function waitForDebugPort(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`启动无头浏览器超时：\n${stderr}`)), timeoutMs);
    const onData = chunk => {
      stderr += chunk.toString('utf8');
      const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(stderr);
      if (match) {
        clearTimeout(timer);
        child.stderr.off('data', onData);
        resolve(Number(match[1]));
      }
    };
    child.stderr.on('data', onData);
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`无头浏览器提前退出（code=${code}）：\n${stderr}`));
    });
  });
}

async function openSocket(url) {
  if (typeof globalThis.WebSocket !== 'function') {
    throw new Error('当前 Node.js 不支持全局 WebSocket，请升级至 Node.js 22+ 以运行无头浏览器脚本。');
  }
  const ws = new globalThis.WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`连接 DevTools 失败：${url}`)), { once: true });
  });
  return ws;
}

export async function launchBrowser({ profile, width = 1280, height = 800 }) {
  const executable = await findBrowser();
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    'about:blank',
  ];
  const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const port = await waitForDebugPort(child);
    let target = null;
    for (let i = 0; i < 40 && !target; i++) {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (!target) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!target) throw new Error('未能获取无头浏览器页面调试地址。');
    const ws = await openSocket(target.webSocketDebuggerUrl);
    let nextId = 1;
    const pending = new Map();
    const listeners = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
        else resolve(message.result);
      } else if (message.method && listeners.has(message.method)) {
        for (const fn of [...listeners.get(message.method)]) fn(message.params);
      }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
    const onceEvent = (method, timeoutMs = 15000) => new Promise((resolve, reject) => {
      const set = listeners.get(method) || new Set();
      listeners.set(method, set);
      const timer = setTimeout(() => {
        set.delete(handler);
        reject(new Error(`等待浏览器事件超时：${method}`));
      }, timeoutMs);
      const handler = params => {
        clearTimeout(timer);
        set.delete(handler);
        resolve(params);
      };
      set.add(handler);
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const navigate = async url => {
      const loaded = onceEvent('Page.loadEventFired', 30000);
      await send('Page.navigate', { url });
      await loaded;
    };
    const evalJs = async expression => {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
        throw new Error(`页面脚本执行失败：${detail}`);
      }
      return result.result?.value;
    };
    const screenshot = async () => {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(data, 'base64');
    };
    const close = async () => {
      try { await send('Browser.close'); } catch {}
      try { ws.close(); } catch {}
      if (child.exitCode === null) child.kill();
    };
    return { navigate, evalJs, screenshot, close };
  } catch (error) {
    if (child.exitCode === null) child.kill();
    throw error;
  }
}
