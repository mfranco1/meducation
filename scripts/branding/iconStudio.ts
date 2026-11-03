import { readFile, realpath, mkdir, writeFile, unlink, rename } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { SaxesParser } from 'saxes';
import { optimize } from 'svgo';

export interface IconSource {
  collection: string;
  asset: string;
  url: string;
  revision: string;
  author: string;
  license: string;
  licenseUrl: string;
  attribution: string;
}

export interface IconRecord {
  id: string;
  concept: string;
  keywords: string[];
  file: string;
  source: IconSource;
  notes: string;
  alternatives: { file: string; source: IconSource; assessment: string }[];
}

const elements = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'title',
  'desc',
]);
const attributes = new Set([
  'xmlns',
  'viewBox',
  'width',
  'height',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'fill-rule',
  'clip-rule',
  'fill-opacity',
  'stroke-opacity',
  'opacity',
  'transform',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'points',
]);

/** A deliberately small static SVG subset. Parse before SVGO or browser rendering. */
export function validateSvg(svg: string, normalized = false): number[] {
  if (Buffer.byteLength(svg) > 200_000) throw new Error('SVG exceeds 200 KB. Simplify the artwork.');
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0;
  let shapes = 0;
  let viewBox: number[] = [];
  parser.on('doctype', () => {
    throw new Error('SVG DTDs are prohibited.');
  });
  parser.on('processinginstruction', () => {
    throw new Error('SVG processing instructions are prohibited.');
  });
  parser.on('opentag', (tag) => {
    if (!elements.has(tag.name) || tag.uri !== 'http://www.w3.org/2000/svg')
      throw new Error(`Unsupported SVG element: ${tag.name}`);
    if (depth++ === 0) {
      if (tag.name !== 'svg') throw new Error('The root must be svg.');
      viewBox = (tag.attributes.viewBox?.value ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0)
        throw new Error('SVG needs a finite, positive viewBox.');
      if (normalized && viewBox.join(' ') !== '0 0 24 24') throw new Error('Registered SVGs need viewBox="0 0 24 24".');
    } else if (tag.name === 'svg') throw new Error('Nested SVGs are unsupported.');
    for (const attr of Object.values(tag.attributes)) {
      if (!attributes.has(attr.name)) throw new Error(`Unsupported SVG attribute: ${attr.name}`);
      if (attr.name === 'xmlns' && attr.value !== 'http://www.w3.org/2000/svg')
        throw new Error('Invalid SVG namespace.');
      if (/url\s*\(|[<>]|javascript:|data:/i.test(attr.value)) throw new Error(`Unsafe SVG attribute: ${attr.name}`);
      if (['fill', 'stroke'].includes(attr.name)) {
        if (!/^(none|currentColor|black|white|#[\da-f]{3,8})$/i.test(attr.value))
          throw new Error('Unsupported SVG paint.');
        if (normalized && !['none', 'currentColor'].includes(attr.value))
          throw new Error('Registered paints must use currentColor or none.');
      }
      if (
        ['opacity', 'fill-opacity', 'stroke-opacity'].includes(attr.name) &&
        (!Number.isFinite(Number(attr.value)) || Number(attr.value) < 0 || Number(attr.value) > 1)
      )
        throw new Error('Invalid SVG opacity.');
    }
    if (!['svg', 'g', 'title', 'desc'].includes(tag.name)) shapes++;
  });
  parser.on('closetag', () => {
    depth--;
  });
  parser.write(svg).close();
  if (!shapes) throw new Error('SVG has no vector shapes.');
  return viewBox;
}

export function normalizeSvg(svg: string): string {
  const [x, y, width, height] = validateSvg(svg);
  // Deterministic fit, preserving aspect ratio. Artistic optical changes belong in the source.
  const scale = 24 / Math.max(width, height);
  const output = optimize(svg, {
    multipass: false,
    plugins: [
      { name: 'preset-default', params: { overrides: { removeDesc: false, convertColors: false } } },
      {
        name: 'meducation',
        fn: () => ({
          element: {
            enter(node, parent) {
              if (node.name === 'svg') {
                node.attributes.viewBox = '0 0 24 24';
                delete node.attributes.width;
                delete node.attributes.height;
                if (parent.type === 'root' && (x || y || width !== 24 || height !== 24)) {
                  const children = node.children;
                  node.children = [
                    {
                      type: 'element',
                      name: 'g',
                      attributes: {
                        transform: `translate(${(24 - width * scale) / 2} ${(24 - height * scale) / 2}) scale(${scale}) translate(${-x} ${-y})`,
                      },
                      children,
                    },
                  ];
                }
                node.attributes.fill ??= 'currentColor';
              }
              for (const paint of ['fill', 'stroke']) {
                if (node.attributes[paint] && node.attributes[paint] !== 'none')
                  node.attributes[paint] = 'currentColor';
              }
            },
          },
        }),
      },
    ],
  }).data;
  validateSvg(output, true);
  return output + '\n';
}

const textFields = (value: unknown, fields: string[]): value is Record<string, string> =>
  !!value &&
  typeof value === 'object' &&
  fields.every(
    (key) =>
      typeof (value as Record<string, unknown>)[key] === 'string' &&
      String((value as Record<string, unknown>)[key]).trim(),
  );

export function assertSource(value: unknown): asserts value is IconSource {
  if (
    !textFields(value, ['collection', 'asset', 'url', 'revision', 'author', 'license', 'licenseUrl']) ||
    typeof value.attribution !== 'string'
  )
    throw new Error('Source needs collection, asset, URL, revision, author, license, license URL, and attribution.');
  for (const key of ['url', 'licenseUrl']) {
    if (new URL(value[key]).protocol !== 'https:') throw new Error('Source and license evidence must use HTTPS.');
  }
  if (!['CC0-1.0', 'MIT', 'ISC', 'Apache-2.0', 'CC-BY-3.0', 'CC-BY-4.0'].includes(value.license))
    throw new Error(`Unverified or unsupported license: ${value.license}`);
  if (value.license !== 'CC0-1.0' && !value.attribution.trim())
    throw new Error('This license needs an attribution notice.');
}

/** Registry paths must stay inside its asset directory, including symlink targets. */
export async function assetPath(root: string, relative: string): Promise<string> {
  if (
    typeof relative !== 'string' ||
    !/^[a-zA-Z0-9_./-]+$/.test(relative) ||
    relative.startsWith('/') ||
    relative.split('/').includes('..')
  )
    throw new Error('Unsafe asset path.');
  const base = await realpath(root);
  const path = await realpath(resolve(root, relative));
  if (!path.startsWith(base + sep)) throw new Error('Asset path escapes the registry directory.');
  return path;
}

export async function validateRegistry(value: unknown, root: string): Promise<IconRecord[]> {
  if (!Array.isArray(value)) throw new Error('Icon registry must be an array.');
  const ids = new Set<string>();
  const files = new Set<string>();
  for (const item of value) {
    if (!textFields(item, ['id', 'concept', 'file', 'notes']) || !/^[a-z][a-z0-9-]*$/.test(item.id) || ids.has(item.id))
      throw new Error('Registry has an invalid or duplicate icon ID.');
    ids.add(item.id);
    const record = item as unknown as IconRecord;
    if (
      !Array.isArray(record.keywords) ||
      !record.keywords.length ||
      !record.keywords.every((word) => typeof word === 'string' && word.trim()) ||
      !Array.isArray(record.alternatives)
    )
      throw new Error(`Invalid metadata for ${record.id}.`);
    if (files.has(record.file)) throw new Error('Registry assets must have distinct paths.');
    files.add(record.file);
    for (const art of [record, ...record.alternatives]) {
      if (!textFields(art, ['file']) || (art !== record && !textFields(art, ['assessment'])))
        throw new Error('Invalid alternative metadata.');
      assertSource(art.source);
      const svg = await readFile(await assetPath(root, art.file), 'utf8');
      validateSvg(svg, art === record);
    }
  }
  return value as IconRecord[];
}

export async function registerCandidate(
  root: string,
  records: IconRecord[],
  record: IconRecord,
  svg: string,
): Promise<void> {
  if (!/^[a-z][a-z0-9-]*$/.test(record.id) || record.file !== `candidates/${record.id}.svg`)
    throw new Error('New icons must have a safe candidate ID and path.');
  if (records.some((existing) => existing.id === record.id))
    throw new Error('That icon ID already exists. Create a new candidate ID.');
  await mkdir(resolve(root, 'candidates'), { recursive: true });
  const directory = await assetPath(root, 'candidates');
  const file = resolve(directory, `${record.id}.svg`);
  // Exclusive creation preserves candidates already being reviewed.
  await writeFile(file, svg, { flag: 'wx' });
  const temporaryRegistry = resolve(root, `.registry-${process.pid}.tmp`);
  try {
    await validateRegistry([...records, record], root);
    await writeFile(temporaryRegistry, JSON.stringify([...records, record], null, 2) + '\n');
    await rename(temporaryRegistry, resolve(root, 'registry.json'));
  } catch (error) {
    await unlink(file);
    throw new Error(`Candidate was not registered: ${String(error)}`, { cause: error });
  } finally {
    await unlink(temporaryRegistry).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export interface SearchCandidate {
  id: string;
  name: string;
  tier: number;
  keywords: string[];
  svg: string;
  source?: IconSource;
  note: string;
  url?: string;
}

const synonyms = [
  ['cardiology', 'cardiac', 'heart'],
  ['renal', 'kidney', 'kidneys', 'nephrology'],
  ['hematology', 'erythrocyte', 'blood', 'red-cell'],
  ['pharmacology', 'capsule', 'pill', 'drug'],
  ['microbiology', 'bacteriophage', 'phage', 'bacteria', 'virus'],
];
export function rankCandidates(query: string, candidates: SearchCandidate[]) {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const expanded = new Set(terms);
  for (const group of synonyms)
    if (group.some((word) => terms.includes(word))) group.forEach((word) => expanded.add(word));
  return candidates
    .map((candidate) => {
      const words = `${candidate.name} ${candidate.keywords.join(' ')}`.toLowerCase();
      const matches = [...expanded].filter((word) => words.includes(word));
      return { ...candidate, matches, score: matches.length };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => a.tier - b.tier || b.score - a.score || a.id.localeCompare(b.id));
}
