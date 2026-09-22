import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// STEAM-AI frontend. Served by the FastAPI app from `dist/` at `/`.
// VITE_BASE lets the mock demo be hosted under a sub-path (see build:demo).
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl') || id.includes('node_modules/@deck.gl') || id.includes('node_modules/@luma.gl') || id.includes('node_modules/@math.gl') || id.includes('node_modules/@loaders.gl')) {
            return 'map-vendor';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-vendor')) {
            return 'chart-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
