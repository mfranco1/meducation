import { describe, expect, it } from 'vitest';
import { escapeBrandHtml, fontPreloadTag, transformBrandHtml } from './brandingPlugin';

describe('branding HTML and favicon', () => {
  it('fills both entry titles, theme color, and base-aware favicon URL', () => {
    const html =
      '<title>%BRAND_TITLE%</title><meta name="theme-color" content="%BRAND_THEME_COLOR%"><link href="%BRAND_FAVICON_URL%"><title>%BRAND_ADMIN_TITLE%</title>';
    expect(transformBrandHtml(html, '/study/')).toBe(
      '<title>Meducation</title><meta name="theme-color" content="#b9511b"><link href="/study/favicon.svg"><title>Meducation content admin</title>',
    );
  });

  it('escapes metadata values before inserting them into HTML', () => {
    expect(transformBrandHtml('%BRAND_TITLE% %BRAND_FAVICON_URL%', '/a&b/')).toBe('Meducation /a&amp;b/favicon.svg');
    expect(escapeBrandHtml(`<${'script'} attr="x">'&`)).toBe('&lt;script attr=&quot;x&quot;&gt;&#39;&amp;');
  });

  it('preloads only the Latin brand font and fails the build when it is missing', () => {
    const files = [
      'assets/inter-latin-opsz-italic-a1.woff2',
      'assets/inter-latin-opsz-normal-B2_c.woff2',
      'assets/index.js',
    ];
    expect(fontPreloadTag(files, '/study/').attrs).toEqual({
      rel: 'preload',
      href: '/study/assets/inter-latin-opsz-normal-B2_c.woff2',
      as: 'font',
      type: 'font/woff2',
      crossorigin: true,
    });
    expect(() => fontPreloadTag(['assets/index.js'])).toThrow();
  });
});
