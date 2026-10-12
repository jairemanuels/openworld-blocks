import { defineConfig } from 'vite';

export default defineConfig({
  base: '/openworld-blocks/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
