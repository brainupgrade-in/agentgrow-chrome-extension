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

const devPort = Number(process.env.VITE_PORT ?? 5173);

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
  // VITE_PORT lets parallel worktrees run `pnpm dev` side by side (default 5173).
  server: {
    port: devPort,
    strictPort: true,
    hmr: {
      port: devPort,
    },
  },
});
