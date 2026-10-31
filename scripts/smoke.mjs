// Launches the app (packaged exe if given, else the built out/ folder) and makes a song end to end.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { _electron as electron } from 'playwright';

const exe = process.argv[2];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const songsDir = mkdtempSync(join(tmpdir(), 'howl-smoke-'));
mkdirSync('test-output', { recursive: true });
const env = { ...process.env, HOWL_SONGS_DIR: songsDir };
// Skips the macOS permission prompt. The mic itself is replaced in the page below.
const micArgs = ['--use-fake-device-for-media-stream'];
const launch = () => electron.launch(exe ? { executablePath: exe, env, args: micArgs } : { args: ['.', ...micArgs], env });
// A recording of three spoken lines becomes the mic, so the real VAD and Whisper pipeline runs on this machine.
const useRecordingAsMic = (target) =>
  target.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const buffer = await context.decodeAudioData(bytes.buffer.slice(0));
      const source = context.createBufferSource();
      source.buffer = buffer;
      const out = context.createMediaStreamDestination();
      source.connect(out);
      source.start();
      return out.stream;
    };
  }, readFileSync('tests/fixtures/three-lines.wav').toString('base64'));
const check = (ok, message) => {
  if (!ok) throw new Error(message);
  console.log(`ok - ${message}`);
};

const blocked = [];
const watchNetwork = (electronApp) => {
  const read = (chunk) => {
    for (const match of String(chunk).matchAll(/Blocked network request: (\S+)/g)) blocked.push(match[1]);
  };
  electronApp.process().stdout?.on('data', read);
  electronApp.process().stderr?.on('data', read);
};
let app = await launch();
watchNetwork(app);
let page = await app.firstWindow();
const errors = [];
const listen = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
};
listen(page);
const t = (id) => `[data-testid=${id}]`;
const shot = (name) => page.screenshot({ path: `test-output/${name}.png` });

try {
  // ---- Home and new song ----
  await page.waitForSelector(t('new-song'), { timeout: 30000 });
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  check(await page.evaluate(() => window.crossOriginIsolated), 'page is cross-origin isolated');
  await shot('01-home-empty');
  await page.click(t('new-song'));
  await page.fill(t('new-name'), 'moon pocket');
  await page.click(t('mood-snowfall'));
  await sleep(300);
  await page.click(t('mood-wolfMoon'));
  await sleep(500);
  await shot('02-new-song');
  await page.click(t('start-writing'));

  // ---- Words ----
  await page.waitForSelector(t('type-instead'));
  await shot('03-say-it-all');

  // ---- Dictation: three spoken lines through VAD and Whisper, on this machine ----
  const dictationStart = Date.now();
  await page.waitForSelector(`${t('record')}:not([disabled])`, { timeout: 90000 });
  console.log(`dictation ready after ${Date.now() - dictationStart}ms`);
  await useRecordingAsMic(page);
  await page.click(t('record'));
  await page.waitForFunction(() => document.querySelectorAll('.say-line').length >= 3, null, { timeout: 60000 });
  await shot('03b-dictated');
  const said = await page.locator('.say-line').allInnerTexts();
  console.log('heard', JSON.stringify(said));
  check(said.length === 3, 'three spoken lines become three lines');
  check(/pine trees/i.test(said[0]) && /river/i.test(said[1]) && /moon/i.test(said[2]), 'spoken lines arrive in order');
  await page.click(t('record'));
  await page.waitForSelector(t('line'), { timeout: 15000 });
  console.log('last transcription ms', await page.evaluate(() => window.__howlProbe().lastTranscribeMs));
  check((await page.locator(t('line')).count()) === 3, 'Stop switches to Your lines');

  // Put known words in place for the steps below.
  for (const [i, text] of ['the pine trees whisper my name', 'walking where the snow forgets my feet', 'and the river runs cold under me'].entries()) {
    await page.locator(t('line')).nth(i).click({ position: { x: 300, y: 25 } });
    await page.keyboard.press('Enter');
    await page.fill(t('line-input'), text);
    await page.keyboard.press('Enter');
  }

  await page.locator(t('line')).nth(0).click({ position: { x: 300, y: 25 } });
  await page.waitForSelector(t('bit-count'));
  const count = () => page.locator(t('bit-count')).innerText();
  check((await count()) === '7 bits to sing', 'first line has 7 bits');
  await page.locator(t('join')).first().click();
  check((await count()) === '6 bits to sing', 'joining bits lowers the count');
  await page.locator(t('undo')).click();
  check((await count()) === '7 bits to sing', 'undo restores the bits');
  await page.locator(t('bit')).nth(1).click();
  await page.locator(t('split-gap')).first().click();
  check((await count()) === '8 bits to sing', 'splitting a bit raises the count');
  await page.locator(t('undo')).click();
  await shot('04-your-lines');

  await page.keyboard.press('Alt+ArrowDown');
  const first = () => page.locator(`${t('line')} .line-text`).first().innerText();
  check((await first()).startsWith('walking'), 'Alt+Down moves the line');
  await page.locator(t('undo')).click();
  check((await first()).startsWith('the pine'), 'undo puts it back');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Delete');
  check((await page.locator(t('line')).count()) === 2, 'Delete removes the line');
  await page.locator('.toast-action').click();
  check((await page.locator(t('line')).count()) === 3, 'the toast Undo brings it back');

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.fill(t('line-input'), 'the pine trees whisper my name');
  await page.keyboard.press('Escape');

  await page.locator(t('line')).nth(0).click({ position: { x: 300, y: 25 } });
  await page.click(t('make-tune'));

  // ---- Tune, with real touch events ----
  await page.waitForSelector(t('start'));
  await shot('05-tune-ready');
  await page.click(t('start'));
  await page.waitForSelector('.count-number', { timeout: 5000 });
  await shot('06-count-in');
  await page.waitForSelector('.count-number', { state: 'detached', timeout: 15000 });
  const cdp = await page.context().newCDPSession(page);
  const padCentre = async (i) => {
    const box = await page.locator('[data-pad]').nth(i).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const pressed = () => page.locator('[data-pad][data-pressed]').count();

  let peak = 0;
  // A tap, a tap, then a held tap with a slide (a bend).
  for (const pad of [1, 3]) {
    const p = await padCentre(pad);
    await touch('touchStart', [{ ...p, id: 1 }]);
    await sleep(100);
    peak = Math.max(peak, await page.evaluate(() => window.__howlProbe().peak));
    await touch('touchEnd', []);
    await sleep(100);
  }
  check((await page.locator(t('block')).count()) === 2, 'touch taps make blocks');
  const a = await padCentre(4);
  const b = await padCentre(6);
  await touch('touchStart', [{ ...a, id: 1 }]);
  await sleep(200);
  await touch('touchMove', [{ ...b, id: 1 }]);
  await sleep(200);
  check((await page.locator('[data-pad="6"][data-pressed]').count()) === 1, 'sliding lights the new pad');
  await touch('touchEnd', []);
  await sleep(60);
  check((await page.locator(t('block')).count()) === 4, 'sliding makes a bend on one bit');
  check((await page.locator('.block-bend').count()) === 1, 'the bend shows as a joined block');
  check((await page.locator('.bit-glow').innerText()) === 'whis', 'glow is on the fourth bit');

  // Two fingers: the second finger ends the first note and takes the next bit.
  const c = await padCentre(2);
  const d = await padCentre(5);
  await touch('touchStart', [{ ...c, id: 1 }]);
  await sleep(150);
  await touch('touchStart', [{ ...c, id: 1 }, { ...d, id: 2 }]);
  await sleep(150);
  check((await pressed()) === 1, 'two fingers light one pad');
  check((await page.locator('.bit-glow').innerText()) === 'my', 'second finger sings the next bit');
  await shot('07-tapping');
  await touch('touchEnd', [{ ...c, id: 1 }]);
  await sleep(50);
  await touch('touchEnd', []);
  await sleep(50);

  await page.keyboard.press('Backspace');
  check((await page.locator('.bit-glow').innerText()) === 'per', 'Backspace moves the glow back');

  // The rest by keyboard, holding one key to prove key-up handling.
  for (const key of ['s', 'd', 'f']) {
    await page.keyboard.down(key);
    await sleep(90);
    await page.keyboard.up(key);
    await sleep(60);
  }
  await page.waitForSelector(t('next'), { timeout: 5000 });
  await sleep(500);
  await shot('08-has-tune');
  const probe = await page.evaluate(() => window.__howlProbe());
  console.log('audio', JSON.stringify(probe), 'peak while pressed', peak);
  check(probe.state === 'running', 'audio is running');
  check(peak > 0, 'pads make sound');
  const worst = Math.max(...probe.handlerMs);
  check(worst < 50, `pad handler took under 50ms (${worst.toFixed(1)}ms worst, ${probe.queuedMs.map((ms) => ms.toFixed(0)).join(' ')}ms queued)`);
  const left = await page.locator('.playhead').evaluate((el) => [getComputedStyle(el).display, el.style.left]);
  await sleep(300);
  const left2 = await page.locator('.playhead').evaluate((el) => el.style.left);
  check(left[0] === 'block' && left[1] !== left2, 'playhead moves over the loop');
  await page.click(t('next'));
  await page.waitForSelector(t('start'));
  check((await page.locator('.tune-header h1').innerText()) === 'Line 2', 'Next line goes to line 2');

  await page.click(t('play-song'));
  await sleep(400);
  check((await page.locator('.tune-header h1').innerText()) === 'Line 1', 'Play song follows the first line with a tune');
  await page.keyboard.press('Escape');

  // ---- Saved, and still there after quitting ----
  await app.close();
  const files = readdirSync(songsDir);
  check(files.includes('moon pocket.howl'), 'song file is in the songs folder');
  const zip = await JSZip.loadAsync(readFileSync(join(songsDir, 'moon pocket.howl')));
  check(['README.txt', 'lyrics.txt', 'song.json', 'tune.mid'].every((name) => zip.file(name)), 'zip holds the 4 files');
  const saved = JSON.parse(await zip.file('song.json').async('string'));
  check(saved.lines.length === 3 && saved.lines[0].tune.notes.length === 7, 'tune is in the saved song');

  app = await launch();
  watchNetwork(app);
  page = await app.firstWindow();
  listen(page);
  await page.waitForSelector(t('song-card'), { timeout: 30000 });
  await sleep(300);
  await shot('09-home');
  await page.locator('.song-tile').click();
  await page.waitForSelector(t('rail-tune'), { timeout: 5000 });
  await page.waitForSelector('.tune', { timeout: 5000 });
  await page.locator('[aria-label="Previous line"]').click(); // It opens on the first line without a tune.
  await page.waitForSelector(t('hear'), { timeout: 5000 });
  check((await page.locator(t('block')).count()) === 8, 'blocks are still there after reopening');
  await page.click(t('hear'));
  await sleep(300);
  await shot('10-reopened');
  await page.keyboard.press('Space');

  check(blocked.length === 0, `no network requests were attempted${blocked.length ? `: ${blocked.join(' ')}` : ''}`);
  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  console.log('Smoke test passed');
} catch (err) {
  await page.screenshot({ path: 'test-output/failure.png' }).catch(() => {});
  console.error(err);
  if (errors.length) console.error('Page errors:', errors);
  process.exitCode = 1;
} finally {
  await app.close().catch(() => {});
}
