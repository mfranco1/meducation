import path from 'node:path';
import { createResolver, importProblem, moduleImports } from './boundaries.mjs';

const resolvers = new Map();
export default {
  rules: {
    boundaries: {
      meta: {
        type: 'problem',
        docs: { description: 'Enforce resolved repository ownership for static and dynamic imports.' },
        schema: [],
        messages: { boundary: '{{message}}' },
      },
      create(context) {
        const root = context.cwd;
        if (!resolvers.has(root)) resolvers.set(root, createResolver(root));
        const resolve = resolvers.get(root);
        const file = path.relative(root, context.filename).split(path.sep).join('/');
        return {
          Program() {
            for (const reference of moduleImports(context.sourceCode.text, file)) {
              const resolved =
                reference.specifier === undefined
                  ? { problem: 'Use literal module paths so dependency boundaries can be checked.' }
                  : resolve(file, reference.specifier);
              const message = resolved.problem ?? importProblem(file, resolved.target, reference.typeOnly);
              if (message)
                context.report({
                  loc: { line: reference.line, column: 0 },
                  messageId: 'boundary',
                  data: { message },
                });
            }
          },
        };
      },
    },
  },
};
