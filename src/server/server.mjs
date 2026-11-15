import { startServer } from './app.mjs';
import { cloudConfig } from './cloud.mjs';
let cloud;
try { cloud = cloudConfig(process.env); } catch (error) { console.error(error.message); process.exit(1); }
const options = { cloud, host: process.env.VN_LISTEN || '127.0.0.1', ...(process.env.VN_DATA_DIR ? { dataDir: process.env.VN_DATA_DIR } : {}),
  // The production folder (presets.json, works/) the asset manager uses; the repository by default.
  ...(process.env.VN_PRODUCTION_DIR ? { production: process.env.VN_PRODUCTION_DIR } : {}) };
const server = await startServer(Number(process.env.PORT || 4173), options);
const { address, port } = server.address();
console.log(cloud ? `vnify. cloud: ${cloud.origin} (listening on ${address}:${port})` : `VN player: http://127.0.0.1:${port}  ·  manager: http://127.0.0.1:${port}/manager/`);
