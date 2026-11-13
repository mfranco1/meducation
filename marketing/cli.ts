import { bundle } from '@remotion/bundler';
import { chromium } from '@playwright/test';
import { renderMedia, renderStill, selectComposition, type BrowserLog } from '@remotion/renderer';
import { appendFileSync } from 'node:fs';
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { capture } from './capture';
import { fetchAssets, generateAudio, setupAudio, validateAudio } from './audio';
import { ffmpeg, probe } from './media';
import { FPS, formatId, formats, specSchema, type AdSpec, type Format } from './spec';
import { adWebpack } from './webpack';

const root = dirname(fileURLToPath(import.meta.url));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    spec: { type: 'string' },
    format: { type: 'string' },
    'base-url': { type: 'string', default: 'http://127.0.0.1:5175' },
    force: { type: 'boolean', default: false },
    frames: { type: 'string' },
    video: { type: 'string' },
    id: { type: 'string' },
  },
});
const command = positionals[0];
const log = (name: string) => join(root, '.cache/logs', `${name}.log`);

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) =>
        entry.isDirectory() ? files(join(directory, entry.name)) : Promise.resolve([join(directory, entry.name)]),
      ),
  );
  return nested.flat();
}

/** Public assets an ad uses: literal `staticFile('…')` paths in its code plus its mastered soundtrack. */
export async function adAssets(spec: AdSpec, adDir: string) {
  const paths = new Set(spec.soundtrack ? [`audio/${spec.id}/mix.wav`] : []);
  for (const file of await files(adDir))
    if (/\.tsx?$/.test(file))
      for (const match of (await readFile(file, 'utf8')).matchAll(/staticFile\(\s*['"`]([^'"`$]+)['"`]\s*\)/g))
        paths.add(match[1]);
  return [...paths].sort();
}

export async function validateAssets(spec: AdSpec, adDir: string, publicDir: string) {
  for (const path of await adAssets(spec, adDir)) {
    try {
      await access(join(publicDir, path));
    } catch {
      throw new Error(`Missing asset: ${path}. Run capture or supply the local file.`);
    }
    if (/\.(mp4|mov|webm|wav|mp3|m4a|aac|flac|ogg)$/i.test(path))
      await ffmpeg(['-v', 'error', '-xerror', '-i', join(publicDir, path), '-f', 'null', '-'], log('assets'));
  }
}

async function validateVideo(spec: AdSpec, format: Format, path: string) {
  const { width, height } = formats[format];
  const info = await probe(path, log('validate-probe'));
  const video = info.streams.find((stream) => stream.codec_type === 'video');
  const audio = info.streams.some((stream) => stream.codec_type === 'audio');
  if (
    !video ||
    video.width !== width ||
    video.height !== height ||
    video.codec_name !== 'h264' ||
    video.pix_fmt !== 'yuv420p'
  )
    throw new Error(`Expected ${width}×${height} H.264/yuv420p video`);
  const [numerator, denominator] = video.avg_frame_rate.split('/').map(Number);
  if (
    numerator / denominator !== FPS ||
    Math.abs(Number(video.duration ?? info.format.duration) - spec.frames / FPS) > 1 / FPS + 0.001
  )
    throw new Error('Video frame rate or duration does not match the specification');
  const expectsAudio = spec.soundtrack !== undefined;
  if (audio !== expectsAudio) throw new Error('Video audio does not match the specification');
  await ffmpeg(['-v', 'error', '-xerror', '-i', path, '-f', 'null', '-'], log('decode'));
  await ffmpeg(
    ['-i', path, '-vf', 'blackdetect=d=0.3:pix_th=0.02:pic_th=0.98', '-an', '-f', 'null', '-'],
    log('blackdetect'),
  );
  const black = (await readFile(log('blackdetect'), 'utf8')).match(/black_start:[^\n]+/g);
  if (black) console.warn(`Review dark intervals: ${black.join('; ')}. See ${log('blackdetect')}`);
  console.log(
    `Validated ${format}: ${width}×${height}, ${FPS} fps, ${Number(info.format.duration).toFixed(2)}s, H.264${audio ? ', audio' : ', silent'}`,
  );
}

/** Reads ad.json. A string `soundtrack` names a TypeScript module in the ad directory whose default export is the soundtrack. */
export async function loadSpec(specPath: string) {
  const raw = JSON.parse(await readFile(specPath, 'utf8'));
  if (typeof raw.soundtrack === 'string') {
    if (!/^[\w.-]+\.ts$/.test(raw.soundtrack))
      throw new Error('soundtrack must be a TypeScript file name in the ad directory, for example soundtrack.ts');
    raw.soundtrack = (await import(pathToFileURL(join(dirname(specPath), raw.soundtrack)).href)).default;
  }
  return specSchema.parse(raw);
}

async function bundleAd(adDir: string) {
  await mkdir(dirname(log('browser')), { recursive: true });
  await writeFile(log('browser'), '');
  return bundle({
    entryPoint: join(root, 'src/index.tsx'),
    publicDir: join(root, 'public'),
    webpackOverride: adWebpack(root, adDir),
  });
}
/**
 * Playwright's headless shell. Full Chromium intermittently captures frames with only the top band
 * painted and repeated. Playwright exposes the shell's path only through a launched server.
 */
async function headlessShell() {
  const server = await chromium.launchServer().catch((cause) => {
    throw new Error(
      'Chromium for this Playwright version is not installed. Run: cd marketing && npx playwright install chromium',
      {
        cause,
      },
    );
  });
  try {
    return server.process().spawnfile;
  } finally {
    await server.close();
  }
}
async function renderer(serveUrl: string, format: Format) {
  const options = {
    serveUrl,
    inputProps: {},
    logLevel: 'error' as const,
    onBrowserLog: (entry: BrowserLog) => appendFileSync(log('browser'), `${entry.type}: ${entry.text}\n`),
    browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE ?? (await headlessShell()),
  };
  const composition = await selectComposition({ ...options, id: formatId(format) });
  return { ...options, composition };
}

async function renderKey(spec: AdSpec, adDir: string, format: Format) {
  const hash = createHash('sha256').update(JSON.stringify({ spec, format }));
  const inputs = [
    ...(await files(join(root, 'src'))),
    ...(await files(adDir)),
    ...['spec.ts', 'cli.ts', 'webpack.ts', 'package-lock.json', '../package-lock.json'].map((file) => join(root, file)),
    join(root, '../src/shared/brand.ts'),
    ...(await files(join(root, '../src/shared/ui/brand'))),
    join(root, 'public/fonts/PlusJakartaSansVariable.woff2'),
    ...(await adAssets(spec, adDir)).map((path) => join(root, 'public', path)),
  ];
  for (const file of inputs) hash.update(file).update(await readFile(file));
  return hash.digest('hex');
}

async function render(
  spec: AdSpec,
  serveUrl: string,
  format: Format,
  path: string,
  preview: boolean,
  range?: [number, number],
) {
  const temporary = path.replace('.mp4', '.partial.mp4');
  console.log(`Rendering ${format} ${preview ? 'preview' : 'final'}${range ? ` frames ${range.join('-')}` : ''}…`);
  const started = Date.now();
  await renderMedia({
    ...(await renderer(serveUrl, format)),
    outputLocation: temporary,
    codec: 'h264',
    pixelFormat: 'yuv420p',
    crf: preview ? 23 : 18,
    scale: preview ? 0.5 : 1,
    frameRange: range,
    concurrency: 2,
    imageFormat: preview ? 'jpeg' : 'png',
    colorSpace: 'bt709',
    x264Preset: preview ? 'fast' : 'slow',
  });
  await rename(temporary, path);
  console.log(`Rendered in ${((Date.now() - started) / 1000).toFixed(1)}s: ${path}`);
  if (!preview) await validateVideo(spec, format, path);
}

async function main() {
  if (command === 'audio-setup') {
    await setupAudio(root);
    return;
  }
  if (command === 'assets-fetch') {
    if (values.id) await fetchAssets(root, { id: values.id });
    else if (values.spec)
      await fetchAssets(root, {
        spec: await loadSpec(resolve(root, values.spec)),
      });
    else throw new Error('Use --id <asset-id> or --spec ads/<id>/ad.json.');
    return;
  }
  if (
    ![
      'capture',
      'preview',
      'render',
      'validate',
      'contact-sheet',
      'produce',
      'audio-generate',
      'audio-validate',
    ].includes(command)
  )
    throw new Error('See marketing/README.md for video and audio commands.');
  if (!values.spec) throw new Error('Choose a production with --spec ads/<id>/ad.json. See marketing/README.md.');
  const specPath = resolve(root, values.spec);
  const adDir = dirname(specPath);
  const spec = await loadSpec(specPath);
  await access(join(adDir, 'Ad.tsx')).catch(() => {
    throw new Error(`Missing ${join(adDir, 'Ad.tsx')}. Each production needs ad.json and Ad.tsx.`);
  });
  if (values.format && !spec.formats.includes(values.format as Format))
    throw new Error(`Format ${values.format} is not listed in this ad: ${spec.formats.join(', ')}`);
  const selected = values.format ? [values.format as Format] : spec.formats;
  const output = (format: Format) => join(root, 'output', spec.id, formatId(format));
  if (['audio-generate', 'audio-validate'].includes(command) && !spec.soundtrack)
    throw new Error('This ad has no soundtrack.');
  if (command === 'audio-validate') {
    await validateAudio(
      root,
      values.video ? resolve(root, values.video) : join(root, 'public/audio', spec.id, 'mix.wav'),
      spec.frames,
      spec.soundtrack!.lufs,
    );
    return;
  }
  if (['audio-generate', 'preview', 'render', 'produce'].includes(command) && spec.soundtrack)
    await generateAudio(root, spec, values.force!);
  if (command === 'audio-generate') return;
  if (command === 'capture' || command === 'produce') {
    if (spec.recipe) await capture(root, spec.recipe, values['base-url']!, values.force!);
    else if (command === 'capture') throw new Error('This ad has no capture recipe.');
    if (command === 'capture') return;
  }
  await validateAssets(spec, adDir, join(root, 'public'));
  for (const format of selected) await mkdir(output(format), { recursive: true });
  if (command === 'validate') {
    for (const format of selected)
      await validateVideo(spec, format, values.video ? resolve(root, values.video) : join(output(format), 'final.mp4'));
    return;
  }
  const chosen = command === 'contact-sheet' && values.frames ? chosenFrames(values.frames, spec) : sheetFrames(spec);
  if (command === 'contact-sheet' && values.video) {
    if (selected.length !== 1) throw new Error('Choose the video format with --format.');
    await sheet(selected[0], output(selected[0]), resolve(root, values.video), chosen);
    return;
  }
  let serveUrl: string | undefined;
  const serve = async () => (serveUrl ??= await bundleAd(adDir));
  if (command === 'preview') {
    let range: [number, number] | undefined;
    if (values.frames) {
      if (!/^\d+-\d+$/.test(values.frames)) throw new Error('Use --frames START-END');
      range = values.frames.split('-').map(Number) as [number, number];
      if (range[0] > range[1] || range[1] >= spec.frames)
        throw new Error('Preview frame range is outside the timeline');
    }
    const format = selected[0];
    await render(
      spec,
      await serve(),
      format,
      join(output(format), `preview${range ? `-${range.join('-')}` : ''}.mp4`),
      true,
      range,
    );
    return;
  }
  if (values.frames && command !== 'contact-sheet')
    throw new Error('--frames is supported for previews (START-END) and contact sheets (12,48,96) only');
  if (command === 'contact-sheet') {
    const format = selected[0];
    const frameDir = join(output(format), 'frames');
    await rm(frameDir, { recursive: true, force: true });
    await mkdir(frameDir, { recursive: true });
    const options = await renderer(await serve(), format);
    for (const [index, frame] of chosen.entries())
      await renderStill({
        ...options,
        frame,
        output: join(frameDir, `${String(index).padStart(3, '0')}.png`),
        imageFormat: 'png',
      });
    await tile(format, frameDir, chosen, output(format));
    return;
  }
  for (const format of selected) {
    const final = join(output(format), 'final.mp4');
    const keyFile = join(output(format), 'final.key');
    const key = await renderKey(spec, adDir, format);
    const saved = await readFile(keyFile, 'utf8').catch(() => '');
    if (command === 'produce' && !values.force && saved === key) {
      await validateVideo(spec, format, final);
      console.log(`Final reused: ${final}`);
    } else {
      await render(spec, await serve(), format, final, false);
      await writeFile(keyFile, key);
    }
    if (command === 'produce') await sheet(format, output(format), final, sheetFrames(spec));
  }
}

/** Every half second through the 2-second hook, then every second, plus the last frame. */
export function sheetFrames(spec: AdSpec) {
  const frames = new Set([0, 15, 30, 45, 60]);
  for (let frame = 90; frame < spec.frames; frame += FPS) frames.add(frame);
  frames.add(spec.frames - 1);
  return [...frames].filter((frame) => frame < spec.frames).sort((a, b) => a - b);
}
/** `--frames 12,48,96`: whole frame numbers inside the ad, shown in the order given. */
function chosenFrames(value: string, spec: AdSpec) {
  const frames = value.split(',').map((frame) => (/^\d+$/.test(frame) ? Number(frame) : NaN));
  if (frames.some((frame) => !(frame < spec.frames)))
    throw new Error(
      `Use --frames with comma-separated frame numbers from 0 to ${spec.frames - 1}, for example 12,48,96`,
    );
  return frames;
}
async function sheet(format: Format, output: string, video: string, frames: number[]) {
  const directory = join(output, 'frames');
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  for (const [index, frame] of frames.entries())
    await ffmpeg(
      [
        '-ss',
        String(frame / FPS),
        '-i',
        video,
        '-frames:v',
        '1',
        join(directory, `${String(index).padStart(3, '0')}.png`),
      ],
      log('extract-frame'),
    );
  await tile(format, directory, frames, output);
}
/** Platform interface overlaps vertical video at the top, bottom and right edge; shade those areas on the sheet. */
const safeZone: Partial<Record<Format, string>> = {
  '9:16':
    'drawbox=y=0:w=iw:h=ih*0.15:color=red@0.22:t=fill,drawbox=y=ih*0.8:w=iw:h=ih*0.2:color=red@0.22:t=fill,drawbox=x=iw*0.89:y=ih*0.15:w=iw*0.11:h=ih*0.65:color=red@0.22:t=fill',
  '4:5': 'drawbox=y=ih*0.9:w=iw:h=ih*0.1:color=red@0.22:t=fill',
};
async function tile(format: Format, directory: string, frames: number[], output: string) {
  const { width, height } = formats[format];
  const tileWidth = width > height ? 480 : 270;
  const columns = width > height ? 3 : 5;
  const overlay = safeZone[format] ? `${safeZone[format]},` : '';
  await ffmpeg(
    [
      '-framerate',
      '1',
      '-i',
      join(directory, '%03d.png'),
      '-frames:v',
      '1',
      '-vf',
      `${overlay}scale=${tileWidth}:-2,tile=${columns}x${Math.ceil(frames.length / columns)}:nb_frames=${frames.length}:padding=8:margin=8:color=0xede5da`,
      join(output, 'contact-sheet.jpg'),
    ],
    log('contact-sheet'),
  );
  await writeFile(
    join(directory, 'index.txt'),
    frames
      .map((frame, index) => `${String(index).padStart(3, '0')}.png  frame ${frame}  ${(frame / FPS).toFixed(2)}s`)
      .join('\n') + '\n',
  );
  console.log(
    `Contact sheet: ${join(output, 'contact-sheet.jpg')} (${frames.length} full-size frames in ${directory})`,
  );
}

// Importable validation functions are also used by the small boundary tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
