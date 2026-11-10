import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SvgIcon } from '@mui/material';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { SaxesParser } from 'saxes';
import sharp from 'sharp';
import { iconsBySubjectId, strokeWrapper, SubjectIcon } from '../../src/shared/ui/catalog/icons/SubjectIcon';
import { icons as topicIcons } from '../../src/shared/ui/catalog/icons/TopicIcon';
import { brand } from '../../src/shared/brand';
import { theme } from '../../src/shared/theme';
import { normalizeSvg, rankCandidates, setGlyph, type SearchCandidate } from './iconStudio';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cache = resolve(project, '.cache/icons');
const workspace = resolve(cache, 'workspace');
const topicFile = resolve(project, 'src/shared/ui/catalog/icons/TopicIcon.tsx');
const escape = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const productionSvg = (markup: string) => {
  const svg = markup.slice(markup.indexOf('<svg'));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'))}</svg>`;
};

// The production glyphs, rendered by the same MUI wrapper.
function productionCandidates(): SearchCandidate[] {
  return [
    ...Object.entries(iconsBySubjectId).map(([id, icon]) => ({
      id: `meducation:subject:${id}`,
      name: icon.name,
      tier: 0,
      keywords: [],
      svg: productionSvg(renderToStaticMarkup(createElement(SubjectIcon, { subjectId: id }))),
      note: 'Production subject icon.',
    })),
    ...Object.entries(topicIcons).map(([name, art]) => ({
      id: `meducation:topic:${name}`,
      name,
      tier: 0,
      keywords: [],
      svg: productionSvg(
        renderToStaticMarkup(createElement(SvgIcon, { viewBox: '0 0 24 24' }, createElement('g', strokeWrapper, art))),
      ),
      note: 'Production topic icon.',
    })),
  ];
}

interface Collection {
  prefix: string;
  width?: number;
  height?: number;
  info?: { license?: { spdx?: string } };
  icons: Record<string, { body: string; width?: number; height?: number }>;
  aliases?: Record<string, { parent: string }>;
  categories?: Record<string, string[]>;
}

async function catalogCandidates(directory: string): Promise<SearchCandidate[]> {
  const candidates: SearchCandidate[] = [];
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return [];
  });
  for (const name of names.filter((name) => name.endsWith('.json'))) {
    const collection = JSON.parse(await readFile(resolve(directory, name), 'utf8')) as Collection;
    const keywords = new Map<string, string[]>();
    for (const [category, keys] of Object.entries(collection.categories ?? {}))
      for (const key of keys) keywords.set(key, [...(keywords.get(key) ?? []), category.toLowerCase()]);
    const add = (key: string, parent: string) => {
      const icon = collection.icons[parent];
      candidates.push({
        id: `${collection.prefix}:${key}`,
        name: key,
        keywords: keywords.get(parent) ?? [],
        tier: /health|medical|medic/.test(collection.prefix) ? 1 : 2,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width ?? collection.width ?? 24} ${icon.height ?? collection.height ?? 24}">${icon.body}</svg>`,
        url: `https://icon-sets.iconify.design/${encodeURIComponent(collection.prefix)}/${encodeURIComponent(key)}/`,
        note: `Declared license ${collection.info?.license?.spdx ?? 'unknown'}.`,
      });
    };
    for (const key of Object.keys(collection.icons)) add(key, key);
    for (const [alias, { parent }] of Object.entries(collection.aliases ?? {}))
      if (collection.icons[parent]) add(alias, parent);
  }
  return candidates;
}

// Production glyphs that candidates sit beside: filled, stroked and duotone styles.
const familyIds = [
  'meducation:topic:heart',
  'meducation:topic:brain',
  'meducation:topic:kidney',
  'meducation:topic:red-cell',
  'meducation:topic:thermometer',
  'meducation:topic:rx-bottle',
  'meducation:subject:s4',
  'meducation:subject:s9',
];

/** Parses normalized artwork into the production stroke wrapper, so it renders like a topic icon. */
function artwork(svg: string): ReactNode {
  const stack: { name: string; props: Record<string, string>; children: ReactNode[] }[] = [];
  let art: ReactNode;
  const parser = new SaxesParser();
  parser.on('opentag', (tag) => {
    const props = Object.fromEntries(
      Object.entries(tag.attributes)
        .filter(([name]) => tag.name !== 'svg' || !['xmlns', 'viewBox', 'width', 'height'].includes(name))
        .map(([name, value]) => [name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]),
    );
    stack.push({ name: tag.name === 'svg' ? 'g' : tag.name, props, children: [] });
  });
  parser.on('text', (text) => {
    stack.at(-1)?.children.push(text);
  });
  parser.on('closetag', () => {
    const node = stack.pop()!;
    const element = createElement(node.name, node.props, ...node.children);
    if (stack.length) stack.at(-1)!.children.push(element);
    else art = element;
  });
  parser.write(svg).close();
  return createElement('g', strokeWrapper, art);
}

const modes = [
  {
    background: theme.palette.background.default,
    text: theme.palette.text.primary,
    accent: brand.accentColor,
    badge: '#f7eae1',
  },
  { background: '#201b18', text: '#fff6ef', accent: brand.palette.dark.left, badge: '#392a23' },
];

/**
 * One row per candidate, then the current production glyph it replaces (a reserved, labeled column, blank if none),
 * then the production family. Each is a 24px glyph and a 64px glyph in an 88px badge, in light and dark.
 */
async function sheet(candidates: { name: string; svg: string; current?: string }[], output: string) {
  const cellWidth = 136;
  const rowHeight = 104;
  const label = 240;
  const production = productionCandidates();
  const family = familyIds.map((id) => production.find((candidate) => candidate.id === id)!.svg);
  const blockHeight = Math.max(candidates.length, 1) * rowHeight + 8;
  let body = '';
  for (const [index, mode] of modes.entries()) {
    const top = index * blockHeight;
    body += `<g color="${mode.accent}"><rect y="${top}" width="100%" height="${blockHeight}" fill="${mode.background}"/>`;
    for (const [row, candidate] of candidates.entries()) {
      const y = top + row * rowHeight + 8;
      body += `<text x="8" y="${y + 48}" font-family="sans-serif" font-size="13" fill="${mode.text}">${escape(candidate.name)}</text>`;
      for (const [column, svg] of [candidate.svg, candidate.current, ...family].entries()) {
        if (!svg) continue;
        const art = renderToStaticMarkup(artwork(svg));
        const x = label + column * cellWidth;
        const glyph = (px: number, gx: number, gy: number) =>
          `<svg x="${gx}" y="${gy}" width="${px}" height="${px}" viewBox="0 0 24 24">${art}</svg>`;
        body += glyph(24, x, y + 32);
        if (column === 1)
          body += `<text x="${x + 36}" y="${y + 100}" font-family="sans-serif" font-size="10" fill="${mode.text}">current</text>`;
        body += `<rect x="${x + 36}" y="${y}" width="88" height="88" rx="14" fill="${mode.badge}"/>${glyph(64, x + 48, y + 12)}`;
      }
    }
    body += '</g>';
  }
  const width = label + (family.length + 2) * cellWidth;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${blockHeight * modes.length}">${body}</svg>`;
  await mkdir(dirname(output), { recursive: true });
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(output);
}

/** A JSX fragment to paste as a TopicIcon `icons` value. Attributes the stroke wrapper already supplies are dropped. */
function jsx(svg: string): string {
  const defaults: Record<string, string> = Object.fromEntries(
    Object.entries(strokeWrapper).map(([name, value]) => [name, String(value)]),
  );
  const lines: string[] = [];
  const parser = new SaxesParser();
  const stack: { name: string; open: string; opened: boolean }[] = [];
  const flush = () => {
    const parent = stack.at(-1);
    if (parent && !parent.opened) {
      lines.push(`${'  '.repeat(stack.length - 1)}${parent.open}>`);
      parent.opened = true;
    }
  };
  parser.on('opentag', (tag) => {
    flush();
    const name = tag.name === 'svg' ? 'g' : tag.name;
    const attributes = Object.entries(tag.attributes)
      .filter(([attribute]) => tag.name !== 'svg' || !['xmlns', 'viewBox', 'width', 'height'].includes(attribute))
      .map(([attribute, value]) => [attribute.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), value])
      .filter(([attribute, value]) => defaults[attribute] !== value)
      .map(([attribute, value]) => ` ${attribute}="${value}"`);
    stack.push({ name, open: `<${name}${attributes.join('')}`, opened: false });
  });
  parser.on('text', (text) => {
    if (!text.trim()) return;
    flush();
    lines.push(`${'  '.repeat(stack.length)}${text.trim().replace(/[{}<>]/g, (char) => `{'${char}'}`)}`);
  });
  parser.on('closetag', () => {
    const node = stack.pop()!;
    if (node.opened) lines.push(`${'  '.repeat(stack.length)}</${node.name}>`);
    else lines.push(`${'  '.repeat(stack.length)}${node.open} />`);
  });
  parser.write(svg).close();
  return `<>\n${lines.map((line) => `  ${line}`).join('\n')}\n</>`;
}

/** Normalizes a workspace candidate (by name) or an SVG file (by path), printing any warnings. */
async function candidate(nameOrFile: string): Promise<{ name: string; svg: string }> {
  const file = nameOrFile.endsWith('.svg') ? resolve(nameOrFile) : resolve(workspace, `${nameOrFile}.svg`);
  const name = basename(file, '.svg');
  try {
    const { svg, warnings } = normalizeSvg(await readFile(file, 'utf8'));
    for (const warning of warnings) console.warn(`${name}: ${warning}`);
    return { name, svg };
  } catch (error) {
    throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

const usage =
  'Usage: npm run icons -- search "concept" ["concept" ...] [--json] [--catalogs directory]\n' +
  '       npm run icons -- get search-id [name]\n' +
  '       npm run icons -- sheet [--output sheet.png]\n' +
  '       npm run icons -- integrate key=candidate [key=candidate ...] [--source "credit"]\n' +
  '       npm run icons -- jsx name-or-file.svg';

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      catalogs: { type: 'string', default: resolve(cache, 'catalogs') },
      output: { type: 'string', default: resolve(cache, 'sheet.png') },
      json: { type: 'boolean' },
      source: { type: 'string' },
    },
    allowPositionals: true,
  });
  const [command, argument, extra] = positionals;
  if (command === 'sheet') {
    const names = (await readdir(workspace).catch(() => [])).filter((name) => name.endsWith('.svg')).sort();
    const production = productionCandidates();
    const candidates = await Promise.all(
      names.map(async (name) => {
        const { name: base, svg } = await candidate(resolve(workspace, name));
        const key = Object.keys(topicIcons)
          .filter((key) => base === key || base.startsWith(`${key}-`))
          .sort((a, b) => b.length - a.length)[0];
        return { name: base, svg, current: production.find((item) => item.id === `meducation:topic:${key}`)?.svg };
      }),
    );
    await sheet(candidates, resolve(values.output));
    console.log(resolve(values.output));
    return;
  }
  if (!argument?.trim()) throw new Error(usage);
  if (command === 'integrate') {
    if (values.source && positionals.length > 2) throw new Error('--source applies to a single key=candidate pair.');
    const pairs = positionals.slice(1).map((pair) => pair.split('='));
    if (pairs.some((pair) => pair.length !== 2 || !pair[0] || !pair[1])) throw new Error(usage);
    let source = await readFile(topicFile, 'utf8');
    const integrated: string[] = [];
    for (const [key, name] of pairs) {
      source = setGlyph(source, key, jsx((await candidate(name)).svg), values.source);
      if (!name.endsWith('.svg')) integrated.push(resolve(workspace, `${name}.svg`));
    }
    const options = { ...(await resolveConfig(topicFile)), filepath: topicFile };
    await writeFile(topicFile, await format(source, options));
    await Promise.all(integrated.map((file) => rm(file)));
    console.log(`Integrated ${pairs.map(([key]) => key).join(', ')}.`);
    return;
  }
  if (command === 'jsx') {
    console.log(jsx((await candidate(argument)).svg));
    return;
  }
  const all = [...productionCandidates(), ...(await catalogCandidates(values.catalogs))];
  if (command === 'get') {
    const found = all.find((item) => item.id === argument);
    if (!found) throw new Error(`Unknown search ID: ${argument}`);
    const name = extra ?? found.id.split(':').at(-1)!;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name))
      throw new Error('Name candidates with lowercase letters, digits and hyphens.');
    const file = resolve(workspace, `${name}.svg`);
    await mkdir(workspace, { recursive: true });
    await writeFile(file, found.svg + '\n', { flag: 'wx' });
    console.log(file);
    return;
  }
  if (command !== 'search') throw new Error(usage);
  const results = positionals.slice(1).map((query) => ({ query, matches: rankCandidates(query, all).slice(0, 20) }));
  if (values.json) {
    console.log(
      JSON.stringify(
        Object.fromEntries(
          results.map(({ query, matches }) => [
            query,
            matches.map(({ id, name, matches, note, url }) => ({ id, name, matches, note, url })),
          ]),
        ),
        null,
        2,
      ),
    );
    return;
  }
  for (const { query, matches } of results) {
    console.log(`\n== ${query} ==`);
    for (const item of matches)
      console.log(`\n${item.id} · ${item.matches.join(', ')}\n${item.note}${item.url ? '\n' + item.url : ''}`);
    if (!matches.length) console.log('No local matches. Download a catalog into .cache/icons/catalogs.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
