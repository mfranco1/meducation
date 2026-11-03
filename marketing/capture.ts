import { chromium, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { recipeSchema, type Recipe } from './spec';
import { ffmpeg, probe } from './media';

export async function sourceFingerprint(root: string): Promise<string> {
  const hash = createHash('sha256');
  async function walk(path: string): Promise<void> {
    for (const item of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, item.name);
      if (item.isDirectory()) await walk(child);
      else if (item.isFile() && !/\.test\./.test(item.name)) {
        hash.update(relative(root, child));
        hash.update(await readFile(child));
      }
    }
  }
  await walk(join(root, '../src'));
  await walk(join(root, '../public'));
  hash.update(await readFile(join(root, '../package-lock.json')));
  hash.update(await readFile(join(root, 'capture.ts')));
  hash.update(await readFile(join(root, 'package-lock.json')));
  hash.update(await readFile(join(root, 'public/fonts/InterVariable.woff2')));
  return hash.digest('hex');
}
export const cacheKey = (recipe: unknown, source: string, revisions: string[], baseURL: string) =>
  createHash('sha256').update(JSON.stringify({ recipe, source, revisions, baseURL })).digest('hex');

async function actions(page: Page, steps: Recipe['shots'][number]['setup']) {
  for (const step of steps) {
    if (step.type === 'wait') await page.waitForTimeout(step.ms);
    else if (step.type === 'scroll') await page.getByText(step.text, { exact: true }).scrollIntoViewIfNeeded();
    else await page.getByRole(step.role, { name: step.name, exact: step.exact }).click();
  }
}

/** Device-resolution screenshots avoid Chromium screencast's CSS-pixel resolution cap. */
async function record(page: Page, steps: Recipe['shots'][number]['record'], directory: string) {
  await mkdir(directory, { recursive: true });
  const frames: { data: Buffer; time: number }[] = [];
  let recording = true;
  const start = performance.now();
  const grab = async () => {
    const time = performance.now() / 1000;
    const data = await page.screenshot({ type: 'jpeg', quality: 95, scale: 'device' });
    frames.push({ data, time });
  };
  await grab();
  const loop = (async () => {
    while (recording) {
      const tick = performance.now();
      await grab();
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1000 / 30 - (performance.now() - tick))));
    }
  })();
  await Promise.all([
    loop,
    actions(page, steps).finally(() => {
      recording = false;
    }),
  ]);
  const seconds = (performance.now() - start) / 1000;
  const list: string[] = [];
  for (const [index, frame] of frames.entries()) {
    const name = `${index}.jpg`;
    await writeFile(join(directory, name), frame.data);
    const next = frames[index + 1];
    const length = next ? next.time - frame.time : seconds - (frame.time - frames[0].time);
    list.push(`file '${name}'`, `duration ${Math.max(1 / 120, length).toFixed(6)}`);
  }
  list.push(`file '${frames.length - 1}.jpg'`);
  await writeFile(join(directory, 'frames.ffconcat'), list.join('\n'));
  return seconds;
}

export async function capture(root: string, recipePath: string, baseURL: string, force: boolean) {
  const recipe = recipeSchema.parse(JSON.parse(await readFile(resolve(root, recipePath), 'utf8')));
  const name = recipePath
    .split('/')
    .pop()!
    .replace(/\.json$/, '');
  const destination = join(root, 'public/footage', name);
  const revisions = await Promise.all(
    recipe.sources.map(async (path) => {
      const response = await fetch(new URL(path, baseURL), { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Published content unavailable (${response.status}): ${path}`);
      const payload = (await response.json()) as { revision: string };
      if (!payload.revision) throw new Error(`Missing content revision: ${path}`);
      return payload.revision;
    }),
  );
  const key = cacheKey(recipe, await sourceFingerprint(root), revisions, baseURL);
  try {
    const saved = await readFile(join(destination, 'cache-key'), 'utf8');
    if (!force && saved === key) {
      for (const shot of recipe.shots) {
        const info = await probe(join(destination, `${shot.id}.mp4`), join(root, '.cache/logs/cache.log'));
        if (!(Number(info.format.duration) > 0)) throw new Error('Empty cached footage');
        await readFile(join(destination, `${shot.id}.png`));
      }
      console.log(`Capture reused: ${destination}`);
      return;
    }
  } catch {
    /* A missing or invalid cache is captured again. */
  }
  const temporary = join(root, '.cache', `capture-${name}`);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const shot of recipe.shots) {
      const context = await browser.newContext({
        viewport: recipe.viewport,
        deviceScaleFactor: recipe.deviceScaleFactor,
        colorScheme: 'light',
        locale: 'en-US',
        timezoneId: 'Asia/Manila',
      });
      try {
        await context.addInitScript(() => localStorage.setItem('meducation.started.v1', '1'));
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        // Supply the theme's intended font only in the recording browser, never the app source.
        await page.route('**/__marketing-font.woff2', (route) =>
          route.fulfill({ path: join(root, 'public/fonts/InterVariable.woff2'), contentType: 'font/woff2' }),
        );
        await page.goto(baseURL);
        await page.addStyleTag({
          content: `@font-face {font-family:Inter;src:url('/__marketing-font.woff2');font-weight:100 900;font-display:block}`,
        });
        await page.evaluate(() => document.fonts.load('600 16px Inter'));
        await actions(page, shot.setup);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(700);
        await page.screenshot({ path: join(temporary, `${shot.id}.png`) });
        const framesDir = join(temporary, shot.id);
        const seconds = await record(page, shot.record, framesDir);
        await ffmpeg(
          [
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            join(framesDir, 'frames.ffconcat'),
            '-vf',
            'fps=30,pad=ceil(iw/2)*2:ceil(ih/2)*2,tpad=stop_mode=clone:stop_duration=1',
            '-t',
            String(seconds),
            '-c:v',
            'libx264',
            '-crf',
            '15',
            '-preset',
            'fast',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            join(temporary, `${shot.id}.mp4`),
          ],
          join(root, '.cache/logs', `capture-${shot.id}.log`),
        );
        const info = await probe(join(temporary, `${shot.id}.mp4`), join(root, '.cache/logs/probe.log'));
        console.log(
          `Captured ${shot.id}: ${info.streams[0].width}×${info.streams[0].height}, ${Number(info.format.duration).toFixed(1)}s`,
        );
        await rm(framesDir, { recursive: true });
      } finally {
        await context.close();
      }
    }
    const after = await Promise.all(
      recipe.sources.map(async (path) => {
        const response = await fetch(new URL(path, baseURL));
        if (!response.ok) throw new Error('Could not verify content after capture');
        return ((await response.json()) as { revision: string }).revision;
      }),
    );
    if (JSON.stringify(after) !== JSON.stringify(revisions))
      throw new Error('Publication changed during capture. Rerun capture.');
    await writeFile(join(temporary, 'cache-key'), key);
    // Keep a prior complete capture if any part of this run fails.
    await mkdir(join(destination, '..'), { recursive: true });
    const previous = `${destination}.previous`;
    await rm(previous, { recursive: true, force: true });
    let moved = false;
    try {
      await rename(destination, previous);
      moved = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (moved) await rename(previous, destination);
      throw error;
    }
    await rm(previous, { recursive: true, force: true });
  } finally {
    await browser.close();
  }
}
