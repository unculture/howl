// Launches the app (packaged exe if given, else the built out/ folder) and walks the main flow.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const exe = process.argv[2];
const songsDir = mkdtempSync(join(tmpdir(), 'howl-smoke-'));
mkdirSync('test-output', { recursive: true });
const env = { ...process.env, HOWL_SONGS_DIR: songsDir };
const app = await electron.launch(exe ? { executablePath: exe, env } : { args: ['.'], env });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.waitForSelector('text=howl', { timeout: 30000 });
  await page.waitForLoadState('load');
  const isolated = await page.evaluate(() => window.crossOriginIsolated);
  console.log('crossOriginIsolated', isolated);
  if (!isolated) throw new Error('Page is not cross-origin isolated');
  await page.screenshot({ path: 'test-output/01-home.png' });
  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  console.log('Smoke test passed');
} catch (err) {
  await page.screenshot({ path: 'test-output/failure.png' }).catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await app.close();
}
