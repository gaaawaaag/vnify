import { spawn } from 'node:child_process';
import { startServer } from './app.mjs';
import { cloudConfig } from './cloud.mjs';

let cloud;
try {
  cloud = cloudConfig(process.env);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const requestedPort = Number(process.env.PORT || 4173);
const options = {
  cloud,
  host: process.env.VN_LISTEN || '127.0.0.1',
  ...(process.env.VN_DATA_DIR ? { dataDir: process.env.VN_DATA_DIR } : {}),
  // The production folder (presets.json, works/) the asset manager uses; the workspace root by default.
  ...(process.env.VN_PRODUCTION_DIR ? { production: process.env.VN_PRODUCTION_DIR } : {}),
};
try {
  const server = await startServer(requestedPort, options);
  const { address, port } = server.address();
  if (cloud) {
    console.log(`vnify. cloud: ${cloud.origin} (listening on ${address}:${port})`);
  } else {
    const readerUrl = `http://127.0.0.1:${port}`;
    console.log(`vnify. 书架与阅读器：${readerUrl}`);
    console.log(`vnify. 资产管理器：  ${readerUrl}/manager/`);
    console.log('（关闭此窗口或按 Ctrl+C 停止服务）');
    if (process.argv.includes('--open')) {
      const [command, ...args] = process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', readerUrl]
        : process.platform === 'darwin'
          ? ['open', readerUrl]
          : ['xdg-open', readerUrl];
      spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    }
  }
} catch (error) {
  console.error(
    error.code === 'EADDRINUSE'
      ? `端口 ${requestedPort} 已被占用：关掉已打开的 vnify. 服务，或设置环境变量 PORT 换一个端口。`
      : error.message
  );
  process.exitCode = 1;
}
