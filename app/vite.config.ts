import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifestJson from './manifest.json';

// Cast to satisfy crxjs's strict ManifestV3 type
const manifest = {
  ...manifestJson,
  background: {
    ...manifestJson.background,
    type: 'module' as const,
  },
};

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest } as Parameters<typeof crx>[0]),
  ],
  build: {
    outDir: '../dist',
    sourcemap: false,
    minify: true,
    rollupOptions: {
      input: {
        // crxjs handles entry points from manifest
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
});
