import { describe, expect, it } from 'vitest';
import { normalizeSvg, rankCandidates, validateSvg } from './iconStudio';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>';

describe('SVG subset', () => {
  it.each([
    '<script>alert(1)</script>',
    '<foreignObject/>',
    '<image href="https://example.com/x"/>',
    '<g onload="alert(1)"/>',
    '<style>path{fill:red}</style>',
    '<animate attributeName="x"/>',
    '<path fill="url(#x)"/>',
    '<use href="#x"/>',
  ])('rejects markup outside the family subset: %s', (payload) => {
    expect(() => validateSvg(svg.replace('<circle cx="12" cy="12" r="8"/>', payload))).toThrow();
  });

  it('rejects malformed XML and invalid bounds', () => {
    expect(() => validateSvg(svg.replace('</svg>', ''))).toThrow();
    expect(() => validateSvg(svg.replace('0 0 24 24', '0 0 0 24'))).toThrow();
  });
});

describe('normalizeSvg', () => {
  it('keeps descriptive text and the tint layer and paints with currentColor', () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24"><desc>Example source credit</desc><circle cx="24" cy="12" r="8" fill="#000" fill-opacity=".16"/></svg>';
    const { svg: output } = normalizeSvg(source);
    expect(validateSvg(output)).toEqual([0, 0, 24, 24]);
    expect(output).toContain('Example source credit');
    expect(output).toContain('currentColor');
    expect(output).not.toContain('#000');
    expect(output).toMatch(/(?:\.16|0.16)/);
  });

  it('fits other grids into the live area with the 24-grid stroke width, and keeps 24-grid art as drawn', () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="#000"><path d="M8 24h32" stroke-width="3"/></svg>';
    const { svg: output, warnings } = normalizeSvg(source);
    const [tx, ty, scale] = output
      .match(/transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/)!
      .slice(1)
      .map(Number);
    // The 48-unit box lands in 2..22, and a stroke of 3 on that grid renders as 1.5 on the 24 grid.
    expect([tx, ty, 48 * scale + tx]).toEqual([2, 2, 22]);
    expect(Number(output.match(/stroke-width="([\d.]+)"/)![1]) * scale).toBeCloseTo(1.5, 2);
    expect(warnings).toEqual([]);
    expect(normalizeSvg(svg).svg).not.toContain('transform');
  });

  it('warns about strokes outside the family range and rejects white or colored paint', () => {
    const thin =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 12h16" stroke-width="1"/></svg>';
    expect(normalizeSvg(thin).warnings).toHaveLength(1);
    expect(() => normalizeSvg(svg.replace('currentColor', 'white'))).toThrow(/Unsupported paint white/);
    expect(() => normalizeSvg(svg.replace('currentColor', '#b9511b'))).toThrow(/Unsupported paint/);
  });
});

it('ranks by match score first, then by source tier', () => {
  const candidate = (id: string, name: string, tier: number) => ({ id, name, keywords: [], tier, svg, note: '' });
  const ranked = rankCandidates('red cell', [
    candidate('a', 'red', 1),
    candidate('b', 'red cell', 2),
    candidate('c', 'red', 0),
  ]);
  expect(ranked.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  expect(rankCandidates('unrelated', [candidate('a', 'red', 1)])).toEqual([]);
});
