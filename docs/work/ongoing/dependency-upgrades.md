# Dependency upgrades

Major-version upgrades that need code or config work. Do one stage per session, in order, and run the checks listed for each stage plus `npm run build`, `npm run lint`, `npm run format:check` and `npm run test:ci`. Delete this file when the last stage is done or dropped.

Already current: Node 24 (trixie), Python 3.14 (trixie), Nginx 1.30, Vite 8 with `@vitejs/plugin-react` 6, TypeScript 6.0, sharp 0.35, KaTeX 0.19, jsdom 31, in-range npm and Python packages. Postgres is tracked in [hosting launch](hosting-launch.md).

## Stages

1. **TypeScript 6.0 to 7.** Blocked: `typescript-eslint` 8.72.1 supports TypeScript below 6.1. Start once it supports 7. Check: `npm run typecheck`, lint, and `build:content-policy`. This stage also clears the moderate `minimatch` advisory if typescript-eslint has moved by then.
2. **MUI 7 to 9 (optional).** Two majors of breaking changes for no learner-facing gain. Do it only if a needed component or fix is in 9 or MUI 7 stops getting security fixes. Use MUI's codemods one major at a time (7 to 8, then 8 to 9). Check: both browser suites and a manual visual pass against [design system](../../design-system.md) in light and dark.

## Decisions

- Vite config imports use explicit `.ts` extensions so the config also loads under Vite's planned native config loader.
- `src/shared/ui/content/katex.css` is `katex/dist/katex.min.css` with each `@font-face` reduced to its woff2 source, rewritten to `../../../../node_modules/katex/dist/fonts/`. Regenerate it on every KaTeX upgrade.
- Both tsconfigs set `"types": ["node"]`, because TypeScript 6 no longer includes every `@types` package by default. Add a package there only when code needs its globals.
- `parse5` stays pinned exactly, because `markdownValidation.ts` uses it directly. Raise the pin when `hast-util-raw` or `rehype-raw` needs a newer one (9.2 needed 8.1).
