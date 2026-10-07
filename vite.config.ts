import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const input: Record<string, string> = { learner: resolve(__dirname, 'index.html') };
  if (env.VITE_BUILD_ADMIN === 'true') input.admin = resolve(__dirname, 'admin.html');

  return {
    plugins: [react()],
    server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
    preview: { proxy: { '/api': `http://127.0.0.1:${process.env.MEDUCATION_E2E_API_PORT ?? '8000'}` } },
    build: { rollupOptions: { input } },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      exclude: [...configDefaults.exclude, 'e2e/**', 'scripts/architecture/**'],
    },
  };
});
