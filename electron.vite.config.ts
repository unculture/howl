import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};

// In dev the model files are served by Vite. In the packaged app the howl:// protocol serves them.
function serveModels(): Plugin {
  const root = resolve('resources/models');
  return {
    name: 'howl-serve-models',
    configureServer(server) {
      server.middlewares.use('/models', (req, res, next) => {
        const file = join(root, normalize(decodeURIComponent((req.url ?? '').split('?')[0])));
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Length', statSync(file).size);
        createReadStream(file).pipe(res);
      });
    }
  };
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { output: { format: 'cjs' } } } },
  renderer: {
    plugins: [react(), serveModels()],
    server: { headers: isolationHeaders },
    worker: { format: 'es' },
    build: { target: 'esnext', chunkSizeWarningLimit: 5000 }
  }
});
