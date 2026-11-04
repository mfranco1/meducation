import { chromium, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
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

type Step = Recipe['shots'][number]['setup'][number];
type Tap = { t: number; x: number; y: number; type: 'click' | 'hover' | 'fill' };

type Clock = { frame: number; now: () => number; wait: (ms: number) => Promise<void> };

/**
 * Runs recipe steps. Time passes only through `clock.wait`, so recipe durations are page time.
 * Clicks use raw pointer events: Playwright's actionability checks wait on animation frames.
 * `onTap` receives each pointer or typing target just before the interaction.
 */
async function actions(page: Page, steps: Step[], clock: Clock, scale = 1, onTap?: (tap: Omit<Tap, 't'>) => void) {
  for (const step of steps) {
    if (step.type === 'wait') await clock.wait(step.ms);
    else if (step.type === 'press') await page.keyboard.press(step.key);
    else if (step.type === 'scroll')
      await page.getByText(step.text, { exact: true }).evaluate((element) => {
        element.scrollIntoView({ block: 'nearest' });
        return true; // An undefined result stalls evaluate while time is paused.
      });
    else if (step.type === 'scrollBy') {
      // Wheel scrolling animates outside page time, so scroll the container under the viewport centre directly, one step per frame.
      const size = page.viewportSize()!;
      const count = Math.max(1, Math.round(step.ms / clock.frame));
      for (let index = 0; index < count; index++) {
        await page.evaluate(
          ({ x, y, top }) => {
            let element = document.elementFromPoint(x, y);
            while (
              element &&
              !(element.scrollHeight > element.clientHeight && /auto|scroll/.test(getComputedStyle(element).overflowY))
            )
              element = element.parentElement;
            (element ?? document.scrollingElement!).scrollBy({ top, behavior: 'instant' });
            return true; // An undefined result stalls evaluate while time is paused.
          },
          { x: size.width / 2, y: size.height / 2, top: step.y / count },
        );
        await clock.wait(clock.frame);
      }
    } else {
      const target =
        step.type === 'fill'
          ? page.getByLabel(step.label, { exact: true })
          : page.getByRole(step.role as Parameters<Page['getByRole']>[0], { name: step.name, exact: step.exact });
      // Playwright's actionability waits stall while page time is paused, so poll with non-waiting checks.
      const name = step.type === 'fill' ? step.label : step.name;
      for (let tries = 0; ; tries++) {
        const count = await target.count();
        if (count > 1) throw new Error(`More than one control matches: ${name}`);
        if (count === 1 && (await target.isVisible()) && (await target.isEnabled())) break;
        if (tries > 600) throw new Error(`Control not found, visible and enabled: ${name}`);
        await clock.wait(clock.frame);
      }
      await target.evaluate((element) => {
        element.scrollIntoView({ block: 'nearest' });
        return true; // An undefined result stalls evaluate while time is paused.
      });
      const box = (await target.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      onTap?.({ type: step.type, x: x * scale, y: y * scale });
      if (step.type === 'hover') await page.mouse.move(x, y);
      else {
        await page.mouse.click(x, y);
        if (step.type === 'fill') {
          await page.keyboard.press('ControlOrMeta+A');
          await page.keyboard.press('Backspace');
          for (const character of step.text) {
            await page.keyboard.type(character);
            await clock.wait(step.delay);
          }
        }
      }
    }
  }
}

/**
 * Records evenly spaced frames, so frame N shows the page exactly N / fps seconds in however long
 * screenshots take. `--deterministic-mode` puts Chromium on virtual time: timers, Date and
 * performance.now advance only by the budget given per frame. The compositor still runs CSS and Web
 * Animations on real time, so the DevTools Animation domain pauses them and seeks every animation to
 * its virtual age before each screenshot.
 */
async function record(page: Page, steps: Step[], directory: string, scale: number, fps: number) {
  await mkdir(directory, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frameMs = 1000 / fps;
  const events: Tap[] = [];
  let now = 0;
  let count = 0;
  const writes: Promise<void>[] = [];
  // Animation ids grouped by the virtual time they started, with the time the group ends.
  const groups = new Map<number, { ids: Set<string>; end: number }>();
  let fresh: { id: string; end: number }[] = [];
  cdp.on('Animation.animationStarted', ({ animation: { id, source } }) => {
    const total = (source?.delay ?? 0) + (source?.duration ?? 0) * (source?.iterations ?? 1) + (source?.endDelay ?? 0);
    fresh.push({ id, end: Number.isFinite(total) ? total : Infinity });
  });
  cdp.on('Animation.animationCanceled', ({ id }) => groups.forEach((group) => group.ids.delete(id)));
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });
  await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  let virtual = 0;
  const frame = async () => {
    if (count > 0) {
      const expired = new Promise((resolve) => cdp.once('Emulation.virtualTimeBudgetExpired', resolve));
      await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pauseIfNetworkFetchesPending', budget: frameMs });
      await expired;
      virtual += frameMs;
    }
    await cdp.send('Animation.getPlaybackRate'); // Flushes animationStarted events queued before this point.
    for (const { id, end } of fresh.splice(0)) {
      const group = groups.get(virtual) ?? { ids: new Set<string>(), end: 0 };
      group.ids.add(id);
      group.end = Math.max(group.end, end);
      groups.set(virtual, group);
    }
    for (const [start, group] of groups) {
      if (virtual - start > group.end || group.ids.size === 0) groups.delete(start);
      else {
        const seek = (animations: string[]) =>
          cdp.send('Animation.seekAnimations', { animations, currentTime: virtual - start });
        // Removed elements can drop animations without a cancel event; forget the ones that are gone.
        await seek([...group.ids]).catch(async () => {
          for (const id of [...group.ids]) await seek([id]).catch(() => group.ids.delete(id));
        });
      }
    }
    // Clip coordinates are document-relative, so place the clip at the current viewport; `scale` keeps device resolution.
    const { cssVisualViewport: view } = await cdp.send('Page.getLayoutMetrics');
    const clip = { x: view.pageX, y: view.pageY, width: view.clientWidth, height: view.clientHeight, scale };
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, clip });
    writes.push(writeFile(join(directory, `${count++}.jpg`), Buffer.from(data, 'base64')));
  };
  const clock: Clock = {
    frame: frameMs,
    now: () => now,
    wait: async (ms) => {
      now += ms;
      while (count * frameMs <= now + 1e-6) await frame();
    },
  };
  await frame();
  await actions(page, steps, clock, scale, (tap) => events.push({ t: Math.round(now) / 1000, ...tap }));
  await Promise.all(writes);
  return { frames: count, events };
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
        await readFile(join(destination, `${shot.id}.events.json`));
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
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--deterministic-mode',
      '--disable-threaded-animation',
      '--disable-threaded-scrolling',
      '--disable-checker-imaging',
    ],
  });
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
        await actions(page, shot.setup, {
          frame: 16,
          now: () => 0,
          wait: (ms) => page.waitForTimeout(ms),
        });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(700);
        await page.screenshot({ path: join(temporary, `${shot.id}.png`) });
        const framesDir = join(temporary, shot.id);
        const { frames, events } = await record(page, shot.record, framesDir, recipe.deviceScaleFactor, recipe.fps);
        await writeFile(join(temporary, `${shot.id}.events.json`), JSON.stringify(events));
        await ffmpeg(
          [
            '-framerate',
            String(recipe.fps),
            '-i',
            join(framesDir, '%d.jpg'),
            '-vf',
            'pad=ceil(iw/2)*2:ceil(ih/2)*2',
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
          `Captured ${shot.id}: ${info.streams[0].width}×${info.streams[0].height}, ${frames} frames at ${recipe.fps} fps, ${Number(info.format.duration).toFixed(1)}s`,
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
