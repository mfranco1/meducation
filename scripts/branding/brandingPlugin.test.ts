import { describe, expect, it } from 'vitest';
import { brand } from '../../src/shared/brand';
import { escapeBrandHtml, renderBrandFavicon, transformBrandHtml } from './brandingPlugin';

describe('branding HTML and favicon', () => {
  it('fills both entry titles, theme color, and base-aware favicon URL', () => {
    const html =
      '<title>%BRAND_TITLE%</title><meta name="theme-color" content="%BRAND_THEME_COLOR%"><link href="%BRAND_FAVICON_URL%"><title>%BRAND_ADMIN_TITLE%</title>';
    expect(transformBrandHtml(html, '/study/')).toBe(
      '<title>Meducation</title><meta name="theme-color" content="#b9511b"><link href="/study/favicon.svg"><title>Meducation content admin</title>',
    );
  });

  it('renders the same mark paths and accent used by the React logo', () => {
    const favicon = renderBrandFavicon();
    expect(favicon).toContain(`aria-label="${brand.name}"`);
    expect(favicon).toContain(`viewBox="${brand.mark.viewBox}"`);
    expect(favicon.match(/<path /g)).toHaveLength(brand.mark.paths.length);
    for (const path of brand.mark.paths) expect(favicon).toContain(`fill="${brand.accentColor}" d="${path}"`);
  });

  it('escapes metadata values before inserting them into HTML', () => {
    expect(transformBrandHtml('%BRAND_TITLE% %BRAND_FAVICON_URL%', '/a&b/')).toBe('Meducation /a&amp;b/favicon.svg');
    expect(escapeBrandHtml(`<${'script'} attr="x">'&`)).toBe('&lt;script attr=&quot;x&quot;&gt;&#39;&amp;');
  });
});
