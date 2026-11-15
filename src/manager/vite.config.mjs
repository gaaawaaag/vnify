import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';

// The manager page is built into dist-manager/ and served by the local server under /manager/.
export default defineConfig({
  root:fileURLToPath(new URL('.',import.meta.url)),
  base:'/manager/',
  plugins:[react()],
  build:{outDir:fileURLToPath(new URL('../../dist-manager',import.meta.url)),emptyOutDir:true},
});
