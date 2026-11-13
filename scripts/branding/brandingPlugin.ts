import type { HtmlTagDescriptor, Plugin, ResolvedConfig } from 'vite';
import { brand } from '../../src/shared/brand.ts';

const learnerTitle = brand.name;
const adminTitle = `${brand.name} content admin`;
export const escapeBrandHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function renderBrandFavicon() {
  const half = (page: string, side: 'left' | 'right', transform = '') =>
    `<g class="${side}"${transform ? ` transform="${transform}"` : ''}><path class="page" d="${page}"/><path class="rail" d="${brand.mark.rail}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${escapeBrandHtml(brand.name)}"><style>.left{fill:${brand.palette.light.left}}.right{fill:${brand.palette.light.right}}.rail{fill:none;stroke-width:${brand.mark.smallRailWidth};stroke-linecap:round}.left .rail{stroke:${brand.palette.light.left}}.right .rail{stroke:${brand.palette.light.right}}@media(prefers-color-scheme:dark){.left{fill:${brand.palette.dark.left}}.right{fill:${brand.palette.dark.right}}.left .rail{stroke:${brand.palette.dark.left}}.right .rail{stroke:${brand.palette.dark.right}}}</style><g transform="translate(0 8)">${half(brand.mark.smallPage, 'left')}${half(brand.mark.smallPage, 'right', brand.mark.reflection)}</g></svg>`;
}

export function transformBrandHtml(html: string, base = '/') {
  const faviconUrl = `${base.endsWith('/') ? base : `${base}/`}${brand.faviconUrl.replace(/^\//, '')}`;
  return html
    .replaceAll('%BRAND_TITLE%', escapeBrandHtml(learnerTitle))
    .replaceAll('%BRAND_ADMIN_TITLE%', escapeBrandHtml(adminTitle))
    .replaceAll('%BRAND_THEME_COLOR%', escapeBrandHtml(brand.accentColor))
    .replaceAll('%BRAND_FAVICON_URL%', escapeBrandHtml(faviconUrl));
}

export function brandingPlugin(): Plugin {
  let config: ResolvedConfig;
  const favicon = renderBrandFavicon();
  const faviconPath = brand.faviconUrl.replace(/^\//, '');
  const serveFavicon = (
    req: { url?: string },
    res: { statusCode: number; setHeader(name: string, value: string): void; end(body: string): void },
    next: () => void,
  ) => {
    if (req.url?.split('?')[0] !== `${config.base}${faviconPath}`) return next();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(favicon);
  };

  return {
    name: 'meducation-branding',
    configResolved(resolved) {
      config = resolved;
    },
    transformIndexHtml: { order: 'pre', handler: (html) => transformBrandHtml(html, config.base) },
    configureServer(server) {
      server.middlewares.use(serveFavicon);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveFavicon);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: faviconPath, source: favicon });
    },
  };
}

const preloadedFont = /(^|\/)dm-sans-latin-opsz-normal-[\w-]+\.woff2$/;

/** Preload tag for the Latin brand font among the built files. Throws so a renamed font fails the build. */
export function fontPreloadTag(fileNames: string[], base = '/'): HtmlTagDescriptor {
  const fileName = fileNames.find((name) => preloadedFont.test(name));
  if (!fileName) throw new Error('Brand font file not found in the build; update the preload pattern.');
  return {
    tag: 'link',
    attrs: { rel: 'preload', href: `${base}${fileName}`, as: 'font', type: 'font/woff2', crossorigin: true },
    injectTo: 'head',
  };
}

/** Starts the brand font download alongside the scripts so the first render uses it. */
export function fontPreloadPlugin(): Plugin {
  let base = '/';
  return {
    name: 'meducation-font-preload',
    apply: 'build',
    configResolved(resolved) {
      base = resolved.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler: (html, { bundle }) => (bundle ? [fontPreloadTag(Object.keys(bundle), base)] : html),
    },
  };
}
