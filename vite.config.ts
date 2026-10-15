import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { brandingPlugin } from './scripts/branding/brandingPlugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (env.VITE_CONTENT_SOURCE)
    throw new Error(
      'Offline content mode has been retired. Remove VITE_CONTENT_SOURCE and run the PostgreSQL-backed API.',
    );
  if (env.VITE_ADMIN_SOURCE || env.VITE_JSON_FIXTURE_AUTHORING)
    throw new Error(
      'JSON authoring has been retired. Remove VITE_ADMIN_SOURCE and VITE_JSON_FIXTURE_AUTHORING; the editor uses PostgreSQL.',
    );
  const input: Record<string, string> = { learner: resolve(__dirname, 'index.html') };
  if (env.VITE_BUILD_ADMIN === 'true') input.admin = resolve(__dirname, 'admin.html');

  return {
    plugins: [brandingPlugin(), react()],
    server: {
      proxy: {
        '/api': { target: `http://127.0.0.1:${process.env.MEDUCATION_API_PORT ?? '8000'}`, changeOrigin: false },
        ...(process.env.MEDUCATION_TEST_FIXTURE_PROXY === 'true'
          ? {
              '/fixture': {
                target: `http://127.0.0.1:${process.env.MEDUCATION_API_PORT ?? '8000'}`,
                changeOrigin: false,
              },
            }
          : {}),
      },
    },
    preview: {
      proxy: {
        '/api': { target: `http://127.0.0.1:${process.env.MEDUCATION_E2E_API_PORT ?? '8000'}`, changeOrigin: false },
      },
    },
    build: { rollupOptions: { input } },
    test: {
      maxWorkers: 2,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      exclude: [...configDefaults.exclude, 'e2e/**', 'scripts/architecture/**', 'scripts/containers/*.test.mjs'],
    },
  };
});
