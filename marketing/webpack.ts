import { resolve } from 'node:path';
import type { WebpackOverrideFn } from '@remotion/bundler';

/** Points `@ad` at one production directory (`ads/<id>`) and shares React with the app's brand components. */
export const adWebpack =
  (root: string, adDirectory: string): WebpackOverrideFn =>
  (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        '@ad': resolve(root, adDirectory),
        react: resolve(root, 'node_modules/react'),
        'react-dom': resolve(root, 'node_modules/react-dom'),
      },
    },
  });
