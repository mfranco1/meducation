import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { brand } from '../../src/shared/brand';

type Variant = 'full-horizontal' | 'full-stacked' | 'icon' | 'wordmark';
type PaletteMode = 'full-color' | 'current-color' | 'black' | 'white';

const outputDirectory = resolve(process.cwd(), 'public/brand');

function iconArtwork(viewBox = brand.mark.viewBox) {
  const half = (page: string, side: 'left' | 'right', transform = '') =>
    `<g class="${side}"${transform ? ` transform="${transform}"` : ''}><path class="page" d="${page}"/><path class="rail" d="${brand.mark.rail}"/></g>`;
  return `<svg x="0" y="0" width="128" height="112" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${half(brand.mark.page, 'left')}${half(brand.mark.page, 'right', brand.mark.reflection)}</svg>`;
}

function wordmarkArtwork(x = 0, y = 0, width = 400, height = 88) {
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 400 88" preserveAspectRatio="xMidYMid meet"><text x="4" y="68" class="wordmark" font-size="72" font-weight="800" letter-spacing="-.04em"><tspan class="emphasis">${brand.wordmark.emphasis}</tspan><tspan class="remainder">${brand.wordmark.remainder}</tspan></text></svg>`;
}

function styles(mode: PaletteMode) {
  const common = `.page{stroke:none}.rail{fill:none;stroke-width:${brand.mark.railWidth};stroke-linecap:round}.wordmark{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:800;letter-spacing:-.04em}`;
  if (mode === 'current-color')
    return `${common}.left,.right,.emphasis,.remainder{fill:currentColor}.rail{stroke:currentColor}`;
  if (mode === 'black' || mode === 'white') {
    const color = mode === 'black' ? '#000000' : '#FFFFFF';
    return `${common}.left,.right,.emphasis,.remainder{fill:${color}}.rail{stroke:${color}}`;
  }
  return `${common}.left{fill:${brand.palette.light.left}}.right{fill:${brand.palette.light.right}}.left .rail{stroke:${brand.palette.light.left}}.right .rail{stroke:${brand.palette.light.right}}.emphasis{fill:${brand.palette.light.left}}.remainder{fill:${brand.palette.light.text}}@media(prefers-color-scheme:dark){.left{fill:${brand.palette.dark.left}}.right{fill:${brand.palette.dark.right}}.left .rail{stroke:${brand.palette.dark.left}}.right .rail{stroke:${brand.palette.dark.right}}.emphasis{fill:${brand.palette.dark.left}}.remainder{fill:${brand.palette.dark.text}}}`;
}

function body(variant: Variant) {
  if (variant === 'icon') {
    const half = (side: 'left' | 'right', transform = '') =>
      `<g class="${side}"${transform ? ` transform="${transform}"` : ''}><path class="page" d="${brand.mark.smallPage}"/><path class="rail" d="${brand.mark.rail}"/></g>`;
    return `<g transform="translate(0 8)">${half('left')}${half('right', brand.mark.reflection)}</g>`;
  }
  if (variant === 'wordmark') return wordmarkArtwork();
  if (variant === 'full-stacked')
    return `<svg x="104" y="0" width="192" height="168" viewBox="${brand.mark.viewBox}" preserveAspectRatio="xMidYMid meet">${iconArtwork().replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>${wordmarkArtwork(0, 172)}`;
  return `${iconArtwork()}${wordmarkArtwork(148, 12)}`;
}

function dimensions(variant: Variant) {
  if (variant === 'icon') return { viewBox: '0 0 128 128', width: 128, height: 128 };
  if (variant === 'wordmark') return { viewBox: '0 0 400 88', width: 400, height: 88 };
  if (variant === 'full-stacked') return { viewBox: '0 0 400 260', width: 400, height: 260 };
  return { viewBox: '0 0 548 112', width: 548, height: 112 };
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const variants: Variant[] = ['full-horizontal', 'full-stacked', 'icon', 'wordmark'];
  const modes: PaletteMode[] = ['full-color', 'current-color', 'black', 'white'];
  for (const variant of variants) {
    const { viewBox, width, height } = dimensions(variant);
    for (const mode of modes) {
      const name = `meducation-${variant}-${mode}.svg`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" role="img" aria-label="${brand.name}"><style>${styles(mode)}</style>${body(variant)}</svg>\n`;
      await writeFile(resolve(outputDirectory, name), svg);
    }
  }
}

void main();
