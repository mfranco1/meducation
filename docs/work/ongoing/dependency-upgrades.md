# Dependency upgrades

Major-version upgrades that need code or config work. Do one stage per session, in order, and run the checks listed for each stage plus `npm run build`, `npm run lint`, `npm run format:check` and `npm run test:ci`. Delete this file when the last stage is done or dropped.

Already current: Node 24 (trixie), Python 3.14 (trixie), Nginx 1.30, sharp 0.35, KaTeX 0.19, jsdom 31, in-range npm and Python packages. Postgres is tracked in [hosting launch](hosting-launch.md).

## Stages

1. **Vite 7 to 8 with `@vitejs/plugin-react` 5 to 6.** Upgrade together (plugin 6 requires Vite 8; Vitest 5.1 already accepts Vite 8). Vite 8 bundles with Rolldown: review `vite.config.ts` for Rollup-only options, `--manifest` output used by `scripts/containers/check-*-artifacts.mjs`, and chunk names. Check: both builds (`build:learner`, `build:admin`), both images, the Nginx check and both browser suites. Compare `dist` size and build time.
2. **TypeScript 5.9 to 7.** Blocked: `typescript-eslint` 8.72 supports TypeScript below 6.1. Start once it supports 7, or stop at 6.0.x if that alone is worth it. Check: `npm run typecheck`, lint, and `build:content-policy`. This stage also clears the moderate `minimatch` advisory if typescript-eslint has moved by then.
3. **MUI 7 to 9 (optional).** Two majors of breaking changes for no learner-facing gain. Do it only if a needed component or fix is in 9 or MUI 7 stops getting security fixes. Use MUI's codemods one major at a time (7 to 8, then 8 to 9). Check: both browser suites and a manual visual pass against [design system](../../design-system.md) in light and dark.

## Decisions

- `src/shared/ui/content/katex.css` is `katex/dist/katex.min.css` with each `@font-face` reduced to its woff2 source, rewritten to `../../../../node_modules/katex/dist/fonts/`. Regenerate it on every KaTeX upgrade.
- `parse5` stays pinned exactly, because `markdownValidation.ts` uses it directly. Raise the pin when `hast-util-raw` or `rehype-raw` needs a newer one (9.2 needed 8.1).
