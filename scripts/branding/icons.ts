import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SvgIcon } from '@mui/material';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { SaxesParser } from 'saxes';
import { iconsBySubjectId, SubjectIcon } from '../../src/shared/ui/catalog/icons/SubjectIcon';
import { icons as topicIcons } from '../../src/shared/ui/catalog/icons/TopicIcon';
import { brand } from '../../src/shared/brand';
import { theme } from '../../src/shared/theme';
import {
  assetPath,
  assertSource,
  normalizeSvg,
  rankCandidates,
  registerCandidate,
  validateRegistry,
  validateSvg,
  type IconRecord,
  type SearchCandidate,
} from './iconStudio';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cache = resolve(project, '.cache/icons');
const root = resolve(cache, 'workspace');
const registryFile = resolve(root, 'registry.json');
const escape = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const legacySvg = (markup: string) => {
  const svg = markup.slice(markup.indexOf('<svg'));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'))}</svg>`;
};

// These are the production glyphs, rendered by the same MUI wrapper, without new assignments.
export function existingCandidates(): SearchCandidate[] {
  return [
    ...Object.entries(iconsBySubjectId).map(([id, icon]) => ({
      id: `meducation:subject:${id}`,
      name: icon.name,
      tier: 0,
      keywords: [],
      svg: legacySvg(renderToStaticMarkup(createElement(SubjectIcon, { subjectId: id }))),
      note: 'Existing subject icon. Legacy source sets are listed in public/icon-licenses.txt; verify individual provenance before adapting.',
    })),
    ...Object.entries(topicIcons).map(([name, art]) => ({
      id: `meducation:topic:${name}`,
      name,
      tier: 0,
      keywords: [],
      svg: legacySvg(
        renderToStaticMarkup(
          createElement(
            SvgIcon,
            { viewBox: '0 0 24 24' },
            createElement(
              'g',
              {
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 1.5,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
              },
              art,
            ),
          ),
        ),
      ),
      note: 'Existing topic icon. Verify individual provenance before adapting.',
    })),
  ];
}

interface Collection {
  prefix: string;
  width?: number;
  height?: number;
  info?: { license?: { spdx?: string } };
  icons: Record<string, { body: string; width?: number; height?: number }>;
}

async function catalogCandidates(directory: string, bioicons?: string): Promise<SearchCandidate[]> {
  const candidates: SearchCandidate[] = [];
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return [];
  });
  for (const name of names.filter((name) => name.endsWith('.json'))) {
    const collection = JSON.parse(await readFile(resolve(directory, name), 'utf8')) as Collection;
    if (!collection.prefix || !collection.icons || typeof collection.icons !== 'object')
      throw new Error(`Invalid Iconify collection: ${name}`);
    for (const [key, icon] of Object.entries(collection.icons)) {
      if (typeof icon.body !== 'string') throw new Error(`Invalid icon body in ${name}.`);
      candidates.push({
        id: `${collection.prefix}:${key}`,
        name: key,
        keywords: [],
        tier: /health|medical|medic|bio/.test(collection.prefix) ? 1 : 2,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width ?? collection.width ?? 24} ${icon.height ?? collection.height ?? 24}">${icon.body}</svg>`,
        url: `https://icon-sets.iconify.design/${encodeURIComponent(collection.prefix)}/${encodeURIComponent(key)}/`,
        note: `Local ${name}; declared license ${collection.info?.license?.spdx ?? 'unknown'}. Verify against the exact upstream revision.`,
      });
    }
  }
  if (bioicons) {
    const revision = execFileSync('git', ['-C', bioicons, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const index = JSON.parse(await readFile(resolve(bioicons, 'static/icons/icons.json'), 'utf8')) as {
      name: string;
      license: string;
      category: string;
      author: string;
    }[];
    for (const icon of index) {
      const relative = `${icon.license}/${icon.category}/${icon.author}/${icon.name}.svg`;
      candidates.push({
        id: `bioicons:${relative}`,
        name: icon.name,
        keywords: [icon.category.replaceAll('_', ' ')],
        tier: 1,
        // Read only selected artwork when importing, rather than loading the entire checkout.
        svg: '',
        note: `Bioicons ${revision}; author ${icon.author}; declared license ${icon.license}. Verify individual license.`,
        url: `https://github.com/duerrsimon/bioicons/blob/${revision}/static/icons/${relative.split('/').map(encodeURIComponent).join('/')}`,
      });
    }
  }
  return candidates;
}

async function registeredCandidates(records: IconRecord[]): Promise<SearchCandidate[]> {
  const candidates: SearchCandidate[] = [];
  for (const record of records) {
    candidates.push({
      id: record.id,
      name: record.concept,
      keywords: record.keywords,
      tier: 1,
      svg: await readFile(await assetPath(root, record.file), 'utf8'),
      source: record.source,
      note: record.notes,
    });
    for (const [index, alternative] of record.alternatives.entries())
      candidates.push({
        id: `${record.id}:source:${index}`,
        name: alternative.source.asset,
        keywords: record.keywords,
        tier: 1,
        svg: await readFile(await assetPath(root, alternative.file), 'utf8'),
        source: alternative.source,
        note: alternative.assessment,
      });
  }
  return candidates;
}

function vector(svg: string, size: number): string {
  const box = validateSvg(svg).join(' ');
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
  const markup = renderToStaticMarkup(
    createElement(
      SvgIcon,
      {
        viewBox: box,
        'aria-hidden': true,
        focusable: false,
        style: { fontSize: size, width: size, height: size },
      },
      art,
    ),
  );
  return markup.slice(markup.indexOf('<svg'));
}

export async function gallery(records: IconRecord[], legacy: SearchCandidate[], assetRoot = root): Promise<string> {
  const panels = await Promise.all(
    records.map(async (record) => {
      const candidate = await readFile(await assetPath(assetRoot, record.file), 'utf8');
      const alternatives = await Promise.all(
        record.alternatives.map(async (alt) => ({
          label: `${alt.source.collection}: ${alt.source.asset}`,
          svg: await readFile(await assetPath(assetRoot, alt.file), 'utf8'),
          note: alt.assessment,
          source: alt.source,
        })),
      );
      const comparisons = rankCandidates(record.keywords.join(' '), legacy).slice(0, 1);
      const arts = [
        ...comparisons.map((art) => ({ label: 'Current Meducation', svg: art.svg, note: art.note, source: undefined })),
        ...alternatives,
        {
          label: `Meducation candidate: ${record.id}`,
          svg: candidate,
          note: record.notes,
          source: record.source,
        },
      ];
      const cards = arts
        .map(
          (art) => `<article><h3>${escape(art.label)}</h3>
      <div class="sizes">${[20, 24, 46, 64].map((size) => `<div>${vector(art.svg, size)}<small>${size}px</small></div>`).join('')}</div>
      <div class="contexts"><div class="badge card-badge">${vector(art.svg, 46)}</div><div class="badge header-badge">${vector(art.svg, 64)}</div></div>
      <p>${escape(art.note)}</p>${art.source ? `<p><a href="${escape(art.source.url)}">Source</a> · <a href="${escape(art.source.licenseUrl)}">${escape(art.source.license)}</a></p><small>${escape(art.source.attribution || `${art.source.author}, CC0`)}<br>Revision: ${escape(art.source.revision)}</small>` : ''}</article>`,
        )
        .join('');
      return `<section><h2>${escape(record.concept)} <small>candidate</small></h2><div class="comparison">${cards}</div></section>`;
    }),
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'">
    <title>Meducation Icon Studio</title><style>
    *{box-sizing:border-box}body{margin:0;font:15px/1.5 ${theme.typography.fontFamily};background:${theme.palette.background.default};color:${theme.palette.text.primary}}
    header{padding:32px}h1{margin:0}h2{font-size:22px}h3{font-size:15px;margin:0 0 24px}p{max-width:65ch}small{font-size:12px;overflow-wrap:anywhere}h2 small{text-transform:uppercase;margin-left:12px}
    .theme{padding:24px 32px}.light{--accent:${brand.accentColor};--badge:#f7eae1;background:${theme.palette.background.default};color:${theme.palette.text.primary}}
    .dark{--accent:${brand.palette.dark.left};--badge:#392a23;background:#201b18;color:#fff6ef}
    a{color:inherit}section{margin:32px 0 48px}.comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:16px}
    article{border:1px solid #8885;border-radius:14px;padding:20px;min-width:0}.sizes{display:flex;align-items:end;justify-content:space-between;gap:8px;color:var(--accent)}.sizes>div{display:flex;align-items:center;flex-direction:column;gap:12px}
    .sizes svg{flex:none}.contexts{display:flex;align-items:center;gap:20px;margin-top:24px}.badge{display:flex;align-items:center;justify-content:center;border-radius:12px;background:var(--badge);color:var(--accent)}.card-badge{width:80px;height:80px}.header-badge{width:88px;height:88px}
    @media print{article{break-inside:avoid}}@media(max-width:600px){header,.theme{padding:16px}}
    </style></head><body><header><h1>Meducation Icon Studio</h1><p>Compare anatomy, visual weight and spacing at actual sizes. Accepting a replacement approves its artwork and authorizes production adoption.</p><a href="#dark">Dark preview</a> · <a href="#light">Light preview</a></header>
    <main>${['light', 'dark'].map((mode) => `<div id="${mode}" class="theme ${mode}"><h2>${mode === 'light' ? 'Light' : 'Dark'} preview</h2>${panels.length ? panels.join('') : '<p>No icons registered. Create a candidate to review it here.</p>'}</div>`).join('')}</main></body></html>`;
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      from: { type: 'string' },
      metadata: { type: 'string' },
      id: { type: 'string' },
      catalogs: { type: 'string', default: resolve(cache, 'catalogs') },
      bioicons: { type: 'string' },
      output: { type: 'string', default: resolve(cache, 'gallery.html') },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
  });
  const [command, query] = positionals;
  if (!['search', 'propose', 'create', 'validate', 'preview'].includes(command))
    throw new Error(
      'Usage: npm run icons -- search|propose "concept" [--json] [--catalogs directory] [--bioicons checkout]\n' +
        '       npm run icons -- create "concept" --from candidate-id-or.svg --metadata metadata.json --id semantic-id\n' +
        '       npm run icons -- validate|preview [--output gallery.html]',
    );
  const registry = await readFile(registryFile, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return '[]';
  });
  const records = await validateRegistry(JSON.parse(registry), root);
  if (command === 'validate') {
    console.log(`Validated ${records.length} icons and their source assets.`);
    return;
  }
  if (command === 'preview') {
    if (!values.output!.endsWith('.html') || resolve(values.output!).startsWith(root + '/'))
      throw new Error('Preview output must be an HTML file outside the candidate workspace.');
    const html = await gallery(records, existingCandidates());
    await mkdir(dirname(resolve(values.output!)), { recursive: true });
    await writeFile(values.output!, html);
    console.log(resolve(values.output!));
    return;
  }
  if (!query?.trim()) throw new Error('Supply a medical concept to search, propose or create.');
  const all = [
    ...existingCandidates(),
    ...(await registeredCandidates(records)),
    ...(await catalogCandidates(values.catalogs!, values.bioicons)),
  ];
  if (command === 'search' || command === 'propose') {
    const matches = rankCandidates(query, all).slice(0, command === 'propose' ? 5 : 20);
    const output = matches.map((candidate, index) => ({
      id: candidate.id,
      name: candidate.name,
      tier: candidate.tier,
      matches: candidate.matches,
      score: candidate.score,
      source: candidate.source,
      url: candidate.url ?? candidate.source?.url,
      note: candidate.note,
      recommendation:
        command === 'propose' && index === 0
          ? 'Review this option first using source priority and semantic matching. Confirm anatomy, family fit and licensing before selection.'
          : undefined,
    }));
    if (values.json) console.log(JSON.stringify(output, null, 2));
    else {
      console.log(`Matches for ${query}. Order: reuse, medical libraries, general libraries; then keyword relevance.`);
      for (const item of output)
        console.log(
          `\n${item.id} · ${item.matches.join(', ')}\n${item.note}${item.url ? '\n' + item.url : ''}${item.recommendation ? '\n' + item.recommendation : ''}`,
        );
      console.log(
        '\nAssess medical accuracy, semantic relevance, small-size clarity, family consistency, and license evidence before selection.',
      );
      if (!matches.length)
        console.log(
          'No local matches. Download a medical catalog into .cache/icons/catalogs or supply --bioicons checkout.',
        );
    }
    return;
  }
  if (!values.id || !/^[a-z][a-z0-9-]*$/.test(values.id) || !values.from || !values.metadata)
    throw new Error('Create needs --id semantic-id, --from candidate-id-or.svg, and --metadata metadata.json.');
  if (records.some((record) => record.id === values.id))
    throw new Error('That icon ID already exists. Create a new candidate ID.');
  const metadata = JSON.parse(await readFile(values.metadata, 'utf8')) as Pick<
    IconRecord,
    'source' | 'keywords' | 'notes' | 'alternatives'
  >;
  assertSource(metadata.source);
  let svg: string;
  if (values.from.startsWith('bioicons:')) {
    if (!values.bioicons) throw new Error('Importing Bioicons requires --bioicons checkout.');
    svg = await readFile(
      await assetPath(resolve(values.bioicons, 'static/icons'), values.from.slice('bioicons:'.length)),
      'utf8',
    );
  } else {
    const selected = all.find((candidate) => candidate.id === values.from);
    svg = selected ? selected.svg : await readFile(values.from, 'utf8');
  }
  const normalized = normalizeSvg(svg);
  const record: IconRecord = {
    id: values.id,
    concept: query,
    keywords: metadata.keywords,
    notes: metadata.notes,
    source: metadata.source,
    alternatives: metadata.alternatives ?? [],
    file: `candidates/${values.id}.svg`,
  };
  await registerCandidate(root, records, record, normalized);
  console.log(`Created ${record.file}. Run preview; visual approval is required before adoption.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
