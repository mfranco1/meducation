import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { brandingPlugin, fontPreloadPlugin } from './scripts/branding/brandingPlugin.ts';

const exclude = [...configDefaults.exclude, 'e2e/**'];
const domTests = [
  'src/admin/useRecordEditor.test.ts',
  'src/app/progressBackupFiles.test.ts',
  'src/features/flashcards/session/*.test.ts',
  'src/features/quizzes/components/**/*.test.ts',
  'src/persistence/*.test.ts',
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const input: Record<string, string> = { learner: resolve(import.meta.dirname, 'index.html') };
  if (env.VITE_BUILD_ADMIN === 'true') input.admin = resolve(import.meta.dirname, 'admin.html');
  const apiTarget = `http://127.0.0.1:${process.env.MEDUCATION_API_PORT ?? '8000'}`;
  const proxy = {
    '/api': { target: apiTarget, changeOrigin: false },
    ...(process.env.MEDUCATION_TEST_FIXTURE_PROXY === 'true'
      ? { '/fixture': { target: apiTarget, changeOrigin: false } }
      : {}),
  };

  return {
    plugins: [brandingPlugin(), fontPreloadPlugin(), react()],
    server: { proxy },
    preview: { proxy },
    build: { rolldownOptions: { input } },
    test: {
      maxWorkers: 2,
      exclude,
      // Pure-logic tests skip jsdom setup; components, hooks and DOM-backed modules keep it.
      projects: [
        { extends: true, test: { name: 'node', include: ['**/*.test.ts'], exclude: [...exclude, ...domTests] } },
        {
          extends: true,
          test: {
            name: 'dom',
            include: ['**/*.test.tsx', ...domTests],
            environment: 'jsdom',
            setupFiles: './src/test/setup.ts',
          },
        },
      ],
    },
  };
});
