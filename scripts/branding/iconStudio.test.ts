import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { gallery } from './icons';
import {
  normalizeSvg,
  rankCandidates,
  registerCandidate,
  validateRegistry,
  validateSvg,
  type IconRecord,
} from './iconStudio';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>';
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'meducation-icons-'));
  directories.push(root);
  await mkdir(resolve(root, 'candidates'));
  await writeFile(resolve(root, 'candidates/cell.svg'), svg);
  const record: IconRecord = {
    id: 'cell',
    concept: 'Cell',
    keywords: ['biology'],
    file: 'candidates/cell.svg',
    notes: 'Synthetic fixture.',
    alternatives: [],
    source: {
      collection: 'Synthetic',
      asset: 'cell',
      author: 'Test',
      revision: 'abc123',
      license: 'CC0-1.0',
      url: 'https://example.com/cell',
      licenseUrl: 'https://example.com/license',
      attribution: '',
    },
  };
  return { root, record };
}

describe('SVG boundary', () => {
  it.each([
    '<script>alert(1)</script>',
    '<foreignObject/>',
    '<image href="https://example.com/x"/>',
    '<g onload="alert(1)"/>',
    '<style>path{fill:red}</style>',
    '<animate attributeName="x"/>',
    '<path fill="url(https://example.com/x)"/>',
    '<use href="#x"/>',
  ])('rejects active or unsupported markup: %s', (payload) => {
    expect(() => validateSvg(svg.replace('<circle cx="12" cy="12" r="8"/>', payload))).toThrow();
  });
  it('rejects DTDs, malformed XML, invalid bounds, and fixed colors in registered assets', () => {
    expect(() => validateSvg('<!DOCTYPE svg [<!ENTITY x "test">]>' + svg)).toThrow();
    expect(() => validateSvg(svg.replace('</svg>', ''))).toThrow();
    expect(() => validateSvg(svg.replace('0 0 24 24', '0 0 0 24'))).toThrow();
    expect(() => validateSvg(svg.replace('currentColor', '#b9511b'), true)).toThrow();
  });
  it('normalizes deterministically without stretching geometry or deleting descriptive text', () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24"><desc>Example source credit</desc><circle cx="24" cy="12" r="8" fill="#000" fill-opacity=".16"/></svg>';
    const output = normalizeSvg(source);
    expect(output).toBe(normalizeSvg(source));
    expect(validateSvg(output, true)).toEqual([0, 0, 24, 24]);
    expect(output).toContain('Example source credit');
    expect(output).toContain('currentColor');
    expect(output).toMatch(/(?:\.16|0.16)/);
    // The 48x24 artboard fits uniformly: the original circle remains circular with radius 4.
    expect(output).toMatch(/scale\(\.5\)|scale\(0.5\)|r="4"/);
  });
});

describe('registry integrity', () => {
  it('accepts complete metadata and rejects duplicate IDs and missing assets', async () => {
    const { root, record } = await fixture();
    await expect(validateRegistry([record], root)).resolves.toHaveLength(1);
    await expect(validateRegistry([record, record], root)).rejects.toThrow(/duplicate/);
    await expect(validateRegistry([{ ...record, file: 'missing.svg' }], root)).rejects.toThrow();
  });
  it('rejects incomplete or unsupported licensing and omitted required attribution', async () => {
    const { root, record } = await fixture();
    for (const source of [
      { ...record.source, revision: '' },
      { ...record.source, license: 'unknown' },
      { ...record.source, license: 'CC-BY-3.0', attribution: '' },
    ])
      await expect(validateRegistry([{ ...record, source }], root)).rejects.toThrow();
  });
  it('rejects traversal and symlink escapes', async () => {
    const { root, record } = await fixture();
    await expect(validateRegistry([{ ...record, file: '../outside.svg' }], root)).rejects.toThrow(/Unsafe/);
    const outside = await fixture();
    await symlink(outside.root, resolve(root, 'escape'));
    await expect(validateRegistry([{ ...record, file: 'escape/candidates/cell.svg' }], root)).rejects.toThrow(
      /escapes/,
    );
  });
  it('registers new candidates and refuses to overwrite an existing file or candidate ID', async () => {
    const { root, record } = await fixture();
    await expect(registerCandidate(root, [], record, svg.replace('r="8"', 'r="7"'))).rejects.toThrow(/EEXIST/);
    expect(await readFile(resolve(root, record.file), 'utf8')).toBe(svg);
    await expect(registerCandidate(root, [record], record, svg)).rejects.toThrow(/already exists/);
    const next = { ...record, id: 'next-cell', file: 'candidates/next-cell.svg' };
    await registerCandidate(root, [record], next, normalizeSvg(svg));
    const saved = JSON.parse(await readFile(resolve(root, 'registry.json'), 'utf8'));
    await expect(validateRegistry(saved, root)).resolves.toHaveLength(2);
    const invalid = {
      ...next,
      id: 'invalid-cell',
      file: 'candidates/invalid-cell.svg',
      source: { ...record.source, license: 'unknown' },
    };
    await expect(registerCandidate(root, saved, invalid, svg)).rejects.toThrow(/unsupported license/);
    await expect(readFile(resolve(root, invalid.file))).rejects.toThrow(/ENOENT/);
  });
  it('accepts an empty registry', async () => {
    const { root } = await fixture();
    await expect(validateRegistry([], root)).resolves.toEqual([]);
  });
});

it('ranks reuse before medical and general sources, with stable semantic matches', () => {
  const candidates = [2, 0, 1].map((tier) => ({ id: String(tier), name: 'heart', keywords: [], tier, svg, note: '' }));
  expect(rankCandidates('cardiology', candidates).map((candidate) => candidate.id)).toEqual(['0', '1', '2']);
  expect(rankCandidates('unrelated', candidates)).toEqual([]);
});

it('produces an offline, escaped gallery with both themes, actual sizes, provenance and comparison artwork', async () => {
  const { root, record } = await fixture();
  await mkdir(resolve(root, 'sources'));
  await writeFile(resolve(root, 'sources/reference.svg'), svg);
  record.concept = '<script>bad()</script>';
  record.source.attribution = 'Synthetic artist <test>';
  record.alternatives = [{ file: 'sources/reference.svg', source: record.source, assessment: 'Synthetic reference.' }];
  const legacy = [{ id: 'legacy-cell', name: 'Cell', keywords: ['biology'], tier: 0, svg, note: 'Existing fixture.' }];
  const html = await gallery([record], legacy, root);
  expect(html).not.toMatch(/<script|\ssrc=/);
  expect(html.match(/class="theme /g)).toHaveLength(2);
  expect(html.match(/<article>/g)).toHaveLength(6);
  expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
  expect(html).toContain('Current Meducation');
  expect(html).toContain('20px');
  expect(html).toContain('64px');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('https://example.com/license');
  expect(html).toContain('Synthetic artist &lt;test&gt;');
});

it('shows an empty gallery without requiring assets', async () => {
  const html = await gallery([], []);
  expect(html).toContain('No icons registered. Create a candidate to review it here.');
  expect(html).not.toContain('<article>');
  expect(html.match(/class="theme /g)).toHaveLength(2);
});
