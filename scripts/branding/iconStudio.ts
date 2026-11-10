import { SaxesParser } from 'saxes';
import { optimize } from 'svgo';

// The static SVG subset the family uses: no CSS, scripts, references, images, animation, clips, masks or filters.
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

/** Checks the SVG uses only the family's static subset and returns its viewBox. */
export function validateSvg(svg: string): number[] {
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0;
  let shapes = 0;
  let viewBox: number[] = [];
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
    } else if (tag.name === 'svg') throw new Error('Nested SVGs are unsupported.');
    for (const attr of Object.values(tag.attributes)) {
      if (!attributes.has(attr.name)) throw new Error(`Unsupported SVG attribute: ${attr.name}`);
      if (
        ['fill', 'stroke'].includes(attr.name) &&
        !/^(none|currentColor|black|white|#[\da-f]{3,8})$/i.test(attr.value)
      )
        throw new Error(`Unsupported SVG paint: ${attr.value}`);
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

const round = (value: number) => Number(value.toFixed(3));
const blacks = ['currentcolor', 'black', '#000', '#000000'];

/**
 * Puts art on the 24 grid. A 0 0 24 24 viewBox is kept as drawn; any other is fitted, preserving aspect ratio,
 * into the 20-unit live area. Black paint becomes currentColor and strokes keep their 24-grid width.
 */
export function normalizeSvg(svg: string): { svg: string; warnings: string[] } {
  const [x, y, width, height] = validateSvg(svg);
  const onGrid = [x, y, width, height].join(' ') === '0 0 24 24';
  const scale = onGrid ? 1 : 20 / Math.max(width, height);
  const tx = round((24 - width * scale) / 2);
  const ty = round((24 - height * scale) / 2);
  // A stroke drawn on the source grid keeps its 24-grid equivalent after scaling.
  const gridStroke = 24 / Math.max(width, height);
  const warnings: string[] = [];
  const output = optimize(svg, {
    multipass: false,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            removeDesc: false,
            convertColors: false,
            convertTransform: { floatPrecision: 6 },
            // A default stroke-width of 1 still needs scaling and a range check.
            removeUnknownsAndDefaults: { defaultAttrs: false },
          },
        },
      },
      {
        name: 'meducation',
        fn: () => ({
          element: {
            enter(node, parent) {
              if (node.name === 'svg') {
                node.attributes.viewBox = '0 0 24 24';
                delete node.attributes.width;
                delete node.attributes.height;
                if (parent.type === 'root' && !onGrid) {
                  node.children = [
                    {
                      type: 'element',
                      name: 'g',
                      attributes: { transform: `translate(${tx} ${ty}) scale(${scale}) translate(${-x} ${-y})` },
                      children: node.children,
                    },
                  ];
                }
                node.attributes.fill ??= 'currentColor';
              }
              for (const paint of ['fill', 'stroke']) {
                const value = node.attributes[paint];
                if (!value || value === 'none') continue;
                if (!blacks.includes(value.toLowerCase()))
                  throw new Error(
                    `Unsupported paint ${value}: use currentColor, or cut knockouts out with fill-rule evenodd or fill none.`,
                  );
                node.attributes[paint] = 'currentColor';
              }
              const stroke = Number(node.attributes['stroke-width']);
              if (node.attributes['stroke-width'] && Number.isFinite(stroke)) {
                const attribute = round((stroke * gridStroke) / scale);
                node.attributes['stroke-width'] = String(attribute);
                const rendered = round(attribute * scale);
                if (rendered < 1.25 || rendered > 1.75)
                  warnings.push(`Stroke width ${rendered} on <${node.name}> is outside 1.25–1.75; adjust the source.`);
              }
            },
          },
        }),
      },
    ],
  }).data;
  return { svg: output + '\n', warnings };
}

export interface SearchCandidate {
  id: string;
  name: string;
  tier: number;
  keywords: string[];
  svg: string;
  note: string;
  url?: string;
}

export function rankCandidates(query: string, candidates: SearchCandidate[]) {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return candidates
    .map((candidate) => {
      const words = `${candidate.name} ${candidate.keywords.join(' ')}`.toLowerCase();
      const matches = terms.filter((word) => words.includes(word));
      return { ...candidate, matches, score: matches.length };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.tier - b.tier || a.id.localeCompare(b.id));
}
