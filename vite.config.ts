import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { learner: resolve(__dirname, 'index.html'), admin: resolve(__dirname, 'admin.html') } } },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
});
