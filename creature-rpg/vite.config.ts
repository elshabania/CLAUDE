import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  // the High-only post stack is lazy-imported; pre-bundle it so dev never hits a mid-session optimizer reload
  optimizeDeps: { include: ['@react-three/postprocessing', 'postprocessing'] },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
} as any);
