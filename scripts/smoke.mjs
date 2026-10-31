// Launches the app (packaged exe if given, else the built out/ folder) and walks the main flow.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const exe = process.argv[2];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const songsDir = mkdtempSync(join(tmpdir(), 'howl-smoke-'));
mkdirSync('test-output', { recursive: true });
const env = { ...process.env, HOWL_SONGS_DIR: songsDir };
const app = await electron.launch(exe ? { executablePath: exe, env } : { args: ['.'], env });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.waitForSelector('[data-testid=start]', { timeout: 30000 });
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  const isolated = await page.evaluate(() => window.crossOriginIsolated);
  console.log('crossOriginIsolated', isolated);
  if (!isolated) throw new Error('Page is not cross-origin isolated');
  await page.screenshot({ path: 'test-output/01-ready.png' });

  await page.click('[data-testid=start]');
  await page.waitForFunction(() => document.querySelector('.count-number'), null, { timeout: 5000 });
  await page.screenshot({ path: 'test-output/02-count-in.png' });
  await page.waitForFunction(() => !document.querySelector('.count-number'), null, { timeout: 15000 });
  const pads = page.locator('[data-pad]');
  const bits = await page.locator('[data-testid=lyric] .bit-wrap').count();
  let peak = 0;
  for (let i = 0; i < bits; i++) {
    const box = await pads.nth((i * 3) % 10).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await sleep(120);
    peak = Math.max(peak, await page.evaluate(() => window.__howlProbe().peak));
    if (i === 3) await page.screenshot({ path: 'test-output/03-tapping.png' });
    await page.mouse.up();
    await sleep(120);
  }
  await page.waitForSelector('[data-testid=next]', { timeout: 5000 });
  await sleep(600);
  await page.screenshot({ path: 'test-output/04-done.png' });
  const blocks = await page.locator('[data-testid=block]').count();
  const probe = await page.evaluate(() => window.__howlProbe());
  console.log('blocks', blocks, 'of', bits, 'audio', JSON.stringify(probe), 'peak while pressed', peak);
  if (blocks !== bits) throw new Error(`Expected ${bits} blocks, got ${blocks}`);
  if (probe.state !== 'running') throw new Error(`Audio context is ${probe.state}`);
  if (peak <= 0) throw new Error('Pads made no sound');
  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  console.log('Smoke test passed');
} catch (err) {
  await page.screenshot({ path: 'test-output/failure.png' }).catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await app.close();
}
