import { bundle } from '@remotion/bundler';
import { chromium } from '@playwright/test';
import { renderMedia, renderStill, selectComposition, type BrowserLog } from '@remotion/renderer';
import { appendFileSync } from 'node:fs';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { capture } from './capture';
import { generateAudio, setupAudio, validateAudio } from './audio';
import { ffmpeg, probe } from './media';
import { audioRecipeSchema, duration, FPS, HEIGHT, specSchema, WIDTH, type AdSpec } from './spec';

const root = dirname(fileURLToPath(import.meta.url));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    spec: { type: 'string' },
    'base-url': { type: 'string', default: 'http://127.0.0.1:5175' },
    force: { type: 'boolean', default: false },
    frames: { type: 'string' },
    video: { type: 'string' },
  },
});
const command = positionals[0];
const log = (name: string) => join(root, '.cache/logs', `${name}.log`);

export async function validateAssets(spec: AdSpec, publicDir: string) {
  const assets = [
    ...new Set(
      spec.scenes
        .flatMap((scene) => [scene.footage, scene.poster])
        .concat(spec.audio.map((audio) => audio.src))
        .filter((path): path is string => Boolean(path)),
    ),
  ];
  for (const path of assets) {
    try {
      await access(join(publicDir, path));
    } catch {
      throw new Error(`Missing asset: ${path}. Run capture or supply the local file.`);
    }
  }
  for (const scene of spec.scenes) {
    if (!scene.footage) continue;
    const info = await probe(join(publicDir, scene.footage), log('assets'));
    const stream = info.streams.find((stream) => stream.codec_type === 'video');
    if (!stream || Math.round(Number(info.format.duration) * FPS) < scene.trim + scene.frames)
      throw new Error(`Footage is too short: ${scene.footage}`);
    if (stream.width !== 960 || stream.height !== 1800)
      throw new Error(`Expected 960×1800 source footage: ${scene.footage}`);
    if (
      scene.crop &&
      (scene.crop.x + scene.crop.width > stream.width || scene.crop.y + scene.crop.height > stream.height)
    )
      throw new Error(`Crop exceeds footage dimensions: ${scene.footage}`);
  }
  for (const audio of spec.audio) {
    const info = await probe(join(publicDir, audio.src), log('audio'));
    if (
      !info.streams.some((stream) => stream.codec_type === 'audio') ||
      Number(info.format.duration) * FPS + 1 < audio.trim + audio.frames
    )
      throw new Error(`Audio is missing or too short: ${audio.src}`);
  }
}

async function validateVideo(spec: AdSpec, path: string) {
  const info = await probe(path, log('validate-probe'));
  const video = info.streams.find((stream) => stream.codec_type === 'video');
  const audio = info.streams.some((stream) => stream.codec_type === 'audio');
  if (
    !video ||
    video.width !== WIDTH ||
    video.height !== HEIGHT ||
    video.codec_name !== 'h264' ||
    video.pix_fmt !== 'yuv420p'
  )
    throw new Error('Expected 1080×1920 H.264/yuv420p video');
  const [numerator, denominator] = video.avg_frame_rate.split('/').map(Number);
  if (
    numerator / denominator !== FPS ||
    Math.abs(Number(video.duration ?? info.format.duration) - duration(spec) / FPS) > 1 / FPS + 0.001
  )
    throw new Error('Video frame rate or duration does not match the specification');
  if (audio !== spec.audio.length > 0) throw new Error('Video audio does not match the specification');
  await ffmpeg(['-v', 'error', '-xerror', '-i', path, '-f', 'null', '-'], log('decode'));
  await ffmpeg(
    ['-i', path, '-vf', 'blackdetect=d=0.3:pix_th=0.02:pic_th=0.98', '-an', '-f', 'null', '-'],
    log('blackdetect'),
  );
  const black = (await readFile(log('blackdetect'), 'utf8')).match(/black_start:[^\n]+/g);
  if (black) console.warn(`Review dark intervals: ${black.join('; ')}. See ${log('blackdetect')}`);
  console.log(
    `Validated: ${video.width}×${video.height}, ${FPS} fps, ${Number(info.format.duration).toFixed(2)}s, H.264${audio ? ', audio' : ', silent'}`,
  );
}

async function renderer(spec: AdSpec) {
  await mkdir(dirname(log('browser')), { recursive: true });
  await writeFile(log('browser'), '');
  const serveUrl = await bundle({
    entryPoint: join(root, 'src/index.tsx'),
    publicDir: join(root, 'public'),
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          react: join(root, 'node_modules/react'),
          'react-dom': join(root, 'node_modules/react-dom'),
        },
      },
    }),
  });
  const inputProps = { spec };
  const options = {
    serveUrl,
    inputProps,
    logLevel: 'error' as const,
    onBrowserLog: (entry: BrowserLog) => appendFileSync(log('browser'), `${entry.type}: ${entry.text}\n`),
    browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE ?? chromium.executablePath(),
  };
  const composition = await selectComposition({ ...options, id: 'Meducation' });
  return { ...options, composition };
}

async function renderKey(spec: AdSpec) {
  const hash = createHash('sha256').update(JSON.stringify(spec));
  const files = [
    ...(await readdir(join(root, 'src'))).sort().map((name) => `src/${name}`),
    'spec.ts',
    'cli.ts',
    'package-lock.json',
    '../package-lock.json',
    '../src/shared/brand.ts',
    '../src/shared/ui/brand/BrandGraphic.tsx',
    'public/fonts/InterVariable.woff2',
    ...spec.scenes
      .flatMap((scene) => [scene.footage, scene.poster])
      .concat(spec.audio.map((audio) => audio.src))
      .filter((path): path is string => Boolean(path))
      .map((path) => `public/${path}`),
  ];
  for (const file of files) hash.update(file).update(await readFile(join(root, file)));
  return hash.digest('hex');
}

async function main() {
  if (command === 'audio-setup') {
    await setupAudio(root);
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
  if (!values.spec) throw new Error('Choose an ad specification with --spec ads/<name>.json. See marketing/README.md.');
  const spec = specSchema.parse(JSON.parse(await readFile(resolve(root, values.spec), 'utf8')));
  const output = join(root, 'output', spec.id);
  await mkdir(output, { recursive: true });
  const final = join(output, 'final.mp4');
  if (command === 'audio-validate') {
    if (!spec.audioRecipe) throw new Error('This ad has no audioRecipe.');
    const recipe = audioRecipeSchema.parse(JSON.parse(await readFile(resolve(root, spec.audioRecipe), 'utf8')));
    if (recipe.frames !== duration(spec)) throw new Error('Audio recipe and advertisement durations differ.');
    await validateAudio(
      root,
      values.video ? resolve(root, values.video) : join(root, 'public/audio', recipe.id, 'mix.wav'),
      recipe.frames,
      recipe.lufs,
    );
    return;
  }
  if (['audio-generate', 'preview', 'render', 'produce'].includes(command) && spec.audioRecipe) {
    const recipe = await generateAudio(root, spec.audioRecipe, values.force!);
    if (recipe.frames !== duration(spec)) throw new Error('Audio recipe and advertisement durations differ.');
  }
  if (command === 'audio-generate') {
    if (!spec.audioRecipe) throw new Error('This ad has no audioRecipe.');
    return;
  }
  if (command === 'capture' || command === 'produce') {
    await capture(root, spec.recipe, values['base-url']!, values.force!);
    if (command === 'capture') return;
  }
  await validateAssets(spec, join(root, 'public'));
  if (command === 'validate') {
    await validateVideo(spec, values.video ? resolve(root, values.video) : final);
    return;
  }
  if (command === 'contact-sheet' && values.video) {
    await sheet(spec, output, resolve(root, values.video));
    return;
  }
  const key = ['render', 'produce'].includes(command) ? await renderKey(spec) : '';
  const keyFile = join(output, 'final.key');
  if (command === 'produce' && !values.force) {
    let saved = '';
    try {
      saved = await readFile(keyFile, 'utf8');
    } catch {
      /* No previous final. */
    }
    if (saved === key) {
      await validateVideo(spec, final);
      console.log(`Final reused: ${final}`);
      await sheet(spec, output, final);
      return;
    }
  }
  const options = await renderer(spec);
  if (['preview', 'render', 'produce'].includes(command)) {
    let range: [number, number] | undefined;
    if (values.frames) {
      if (command !== 'preview' || !/^\d+-\d+$/.test(values.frames))
        throw new Error('--frames START-END is supported for previews only');
      range = values.frames.split('-').map(Number) as [number, number];
      if (range[0] > range[1] || range[1] >= duration(spec))
        throw new Error('Preview frame range is outside the timeline');
    }
    const path = command === 'preview' ? join(output, `preview${range ? `-${range.join('-')}` : ''}.mp4`) : final;
    const temporary = path.replace('.mp4', '.partial.mp4');
    console.log(
      `Rendering ${command === 'preview' ? 'preview' : 'final'}${range ? ` frames ${range.join('-')}` : ''}…`,
    );
    const started = Date.now();
    await renderMedia({
      ...options,
      outputLocation: temporary,
      codec: 'h264',
      pixelFormat: 'yuv420p',
      crf: command === 'preview' ? 23 : 18,
      scale: command === 'preview' ? 0.5 : 1,
      frameRange: range,
      concurrency: 2,
      imageFormat: 'png',
      colorSpace: 'bt709',
      x264Preset: 'fast',
    });
    const { rename } = await import('node:fs/promises');
    await rename(temporary, path);
    console.log(`Rendered in ${((Date.now() - started) / 1000).toFixed(1)}s: ${path}`);
    if (command !== 'preview') {
      await validateVideo(spec, path);
      await writeFile(keyFile, key);
    }
    if (command !== 'produce') return;
    await sheet(spec, output, path);
    return;
  }
  const frames = representativeFrames(spec);
  const frameDir = join(output, 'frames');
  await rm(frameDir, { recursive: true, force: true });
  await mkdir(frameDir, { recursive: true });
  for (const [index, frame] of frames.entries()) {
    await renderStill({
      ...options,
      frame,
      output: join(frameDir, `${String(index).padStart(3, '0')}.png`),
      scale: 1,
      imageFormat: 'png',
    });
  }
  await tile(frameDir, frames, output);
}

function representativeFrames(spec: AdSpec) {
  let start = 0;
  return spec.scenes.flatMap((scene) => {
    const frames = [start + Math.min(22, scene.frames - 1), start + Math.floor(scene.frames * 0.65)];
    start += scene.frames;
    return frames;
  });
}
async function sheet(spec: AdSpec, output: string, video: string) {
  const frames = representativeFrames(spec);
  const directory = join(output, 'frames');
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  for (const [index, frame] of frames.entries()) {
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
  }
  await tile(directory, frames, output);
}
async function tile(directory: string, frames: number[], output: string) {
  await ffmpeg(
    [
      '-framerate',
      '1',
      '-i',
      join(directory, '%03d.png'),
      '-frames:v',
      '1',
      '-vf',
      `scale=270:480,tile=4x${Math.ceil(frames.length / 4)}:nb_frames=${frames.length}:padding=8:margin=8:color=0xede5da`,
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
