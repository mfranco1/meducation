/* global window: readonly, probe: readonly, localStorage: readonly, navigator: readonly, dispatchEvent: readonly, PageTransitionEvent: readonly */
// Browser globals are referenced only in Playwright-serialized page callbacks.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium, firefox, webkit } from '@playwright/test';

const fixture = await readFile(
  new URL('../../tests/fixtures/progress-coordination/probe.html', import.meta.url),
  'utf8',
);
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end(request.url.startsWith('/probe') ? fixture : '<title>Away</title><p>No app writes</p>');
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
const report = { purpose: 'L0 Step 3 synthetic coordination feasibility', engines: [] };
const selectedEngines = process.argv.slice(2);
if (selectedEngines.some((name) => !['chromium', 'firefox', 'webkit'].includes(name))) {
  throw new Error('Engine arguments must be chromium, firefox or webkit.');
}
const ready = (page) => page.waitForFunction(() => window.probe?.status().state === 'ready');
const eventuallyExclusive = (page) =>
  page.waitForFunction(() => probe.exclusive(), undefined, { timeout: 5000, polling: 50 });
const open = async (context) => {
  const page = await context.newPage();
  await page.goto(`${origin}/probe`);
  await ready(page);
  return page;
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    if (selectedEngines.length && !selectedEngines.includes(name)) continue;
    const browser = await engine.launch({
      ignoreDefaultArgs: name === 'chromium' ? ['--disable-back-forward-cache'] : [],
    });
    const result = { name, version: browser.version(), tests: [], observations: {} };
    const test = async (label, action) => {
      const context = await browser.newContext();
      try {
        await action(context);
        result.tests.push({ label, passed: true });
        console.log(`${name}: PASS ${label}`);
      } finally {
        await context.close();
      }
    };
    try {
      await test('two shared participants reject restore, rejoin, then permit after other tab closes', async (context) => {
        const a = await open(context);
        const b = await open(context);
        assert.equal(await a.evaluate(() => probe.exclusive()), false);
        assert.equal(await a.evaluate(() => probe.status().held), true);
        await b.close();
        await eventuallyExclusive(a);
      });
      await test('exclusive restore gates new boot/read/write until a coherent pair is available', async (context) => {
        const a = await open(context);
        assert.equal(await a.evaluate(() => probe.exclusive(true)), true);
        const b = await context.newPage();
        await b.goto(`${origin}/probe`);
        assert.equal(await b.evaluate(() => probe.status().state), 'gated');
        assert.equal(
          await b.evaluate(() => {
            try {
              probe.write('bad');
              return false;
            } catch {
              return true;
            }
          }),
          true,
        );
        await a.evaluate(() => {
          localStorage.setItem('probe.quiz', 'new-q');
          localStorage.setItem('probe.cards', 'new-f');
        });
        await a.evaluate(() => probe.endExclusive());
        await ready(b);
        assert.deepEqual(await b.evaluate(() => probe.status().snapshot), ['new-q', 'new-f']);
      });
      await test('simultaneous booting tabs release shared claims and converge on one recovery owner', async (context) => {
        const seed = await context.newPage();
        await seed.goto(`${origin}/away`);
        await seed.evaluate(() => localStorage.setItem('probe.pending', 'synthetic-marker'));
        const a = await context.newPage();
        const b = await context.newPage();
        await Promise.all([a.goto(`${origin}/probe`), b.goto(`${origin}/probe`)]);
        await Promise.all([ready(a), ready(b)]);
        assert.equal(await a.evaluate(() => localStorage.getItem('probe.recoveries')), '1');
      });
      await test('lost local participation rejects synchronous writes', async (context) => {
        const a = await open(context);
        assert.equal(
          await a.evaluate(() => {
            probe.lose();
            try {
              probe.write('bad');
              return false;
            } catch {
              return true;
            }
          }),
          true,
        );
      });
      await test('adversarial forced lock loss gates the existing participant', async (context) => {
        const a = await open(context);
        const attacker = await context.newPage();
        await attacker.goto(`${origin}/away`);
        // The application protocol never steals. This simulates external revocation.
        await attacker.evaluate(() =>
          navigator.locks.request('meducation.progress.coordination.v1', { steal: true }, () => undefined),
        );
        await a.waitForFunction(() => probe.status().state === 'gated');
        assert.equal(
          await a.evaluate(() => {
            try {
              probe.write('bad');
              return false;
            } catch {
              return true;
            }
          }),
          true,
        );
      });
      await test('unavailable participation state cannot claim safe restore/writes', async (context) => {
        const a = await open(context);
        assert.equal(
          await a.evaluate(() => {
            probe.unsupported();
            try {
              probe.write('bad');
              return false;
            } catch {
              return true;
            }
          }),
          true,
        );
      });
      await test('pagehide checkpoints synchronously with lease, reload/back reacquires before writes', async (context) => {
        const a = await open(context);
        await a.reload();
        await ready(a);
        assert.equal(await a.evaluate(() => localStorage.getItem('probe.quiz')), 'paused-checkpoint');
        await a.goto(`${origin}/away`);
        await a.goBack();
        await ready(a);
        const status = await a.evaluate(() => probe.status());
        result.observations.bfcacheRestored = status.events.some(
          (event) => event.event === 'pageshow' && event.persisted,
        );
        assert(status.events.some((event) => event.event === 'checkpoint' && event.held && event.paused));
        await a.evaluate(() => probe.write('after-return'));
      });
      await test('synthetic persisted lifecycle gates writes until fresh admission', async (context) => {
        const a = await open(context);
        await a.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
        assert.equal(await a.evaluate(() => probe.status().state), 'gated');
        assert.equal(
          await a.evaluate(() => {
            try {
              probe.write('bad');
              return false;
            } catch {
              return true;
            }
          }),
          true,
        );
        await a.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
        await ready(a);
        await a.evaluate(() => probe.write('re-admitted'));
      });
      await test('legacy nonparticipant bypasses lock: limitation is observable', async (context) => {
        const a = await open(context);
        assert.equal(await a.evaluate(() => probe.exclusive(true)), true);
        const old = await context.newPage();
        await old.goto(`${origin}/away`);
        await old.evaluate(() => localStorage.setItem('probe.quiz', 'legacy-unfenced'));
        assert.equal(await a.evaluate(() => localStorage.getItem('probe.quiz')), 'legacy-unfenced');
        await a.evaluate(() => probe.endExclusive());
      });
      if (name === 'chromium') {
        await test('frozen participant safely blocks exclusivity until it is resumed and closed', async (context) => {
          const a = await open(context);
          const b = await open(context);
          const cdp = await context.newCDPSession(b);
          await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
          assert.equal(await a.evaluate(() => probe.exclusive()), false);
          await cdp.send('Page.setWebLifecycleState', { state: 'active' });
          await b.close();
          await eventuallyExclusive(a);
        });
        await test('crashed shared owner releases browser lock for surviving tab', async (context) => {
          const a = await open(context);
          const b = await open(context);
          const cdp = await context.newCDPSession(b);
          const crash = b.waitForEvent('crash');
          void cdp.send('Page.crash').catch(() => undefined);
          await crash;
          await b.close();
          await eventuallyExclusive(a);
        });
        await test('crashed exclusive owner leaves pending marker for gated startup recovery', async (context) => {
          const a = await open(context);
          assert.equal(await a.evaluate(() => probe.exclusive(true)), true);
          await a.evaluate(() => localStorage.setItem('probe.pending', 'synthetic-marker'));
          const cdp = await context.newCDPSession(a);
          const crash = a.waitForEvent('crash');
          void cdp.send('Page.crash').catch(() => undefined);
          await crash;
          await a.close();
          const b = await open(context);
          assert.equal(await b.evaluate(() => localStorage.getItem('probe.recoveries')), '1');
        });
      }
      report.engines.push(result);
    } finally {
      await browser.close();
    }
  }
  await writeFile('/private/tmp/meducation-L0-step3-coordination.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log('Report: /private/tmp/meducation-L0-step3-coordination.json');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
